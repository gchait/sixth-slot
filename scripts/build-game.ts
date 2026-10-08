// Turns a curated game file plus PokeAPI's tables into the GameData the app loads.
// Every reference in the game file is checked against PokeAPI, and all problems
// are reported together.
import type { GameFile } from "../data/schema.ts";
import type {
  Battle,
  Evolution,
  GameData,
  Move,
  Opponent,
  Source,
  Species,
  StatKey,
  Stats,
} from "../engine/data.ts";
import type { Table, Tables } from "./pokeapi.ts";

const ENGLISH = "9";

/**
 * How much of a move's power counts toward a typical attack, by move effect:
 * moves that knock out the user or need a sleeping user or target count for
 * nothing, and moves that spend a turn charging, recharging or waiting count
 * for half.
 */
const powerFactorByEffect: Record<string, number> = {
  "8": 0, // User faints
  "9": 0, // Dream Eater: target must be asleep
  "93": 0, // Snore: user must be asleep
  "102": 0, // False Swipe: cannot knock out
  "136": 0, // Hidden Power: type depends on IVs
  "159": 0, // Fake Out: first turn only
  "40": 0.5, // Charges first
  "76": 0.5,
  "146": 0.5,
  "152": 0.5,
  "81": 0.5, // Recharges after
  "149": 0.5, // Hits two turns later
  "171": 0.5, // Focus Punch: fails if hit first
};

const statIdentifiers: Record<string, StatKey> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

/** Lowercase without accents, for comparing names. */
function plain(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function indexBy(
  table: Table,
  key: string,
): Map<string, Record<string, string>> {
  return new Map(table.map((row) => [row[key], row]));
}

function groupBy(
  table: Table,
  key: string,
): Map<string, Record<string, string>[]> {
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of table) {
    const group = groups.get(row[key]);
    if (group) group.push(row);
    else groups.set(row[key], [row]);
  }
  return groups;
}

function englishNames(table: Table, idKey: string): Map<string, string> {
  return new Map(
    table
      .filter((row) => row.local_language_id === ENGLISH)
      .map((row) => [row[idKey], row.name]),
  );
}

/**
 * PokeAPI keeps current values in one table and older ones in a "_past" table,
 * where each row's generation_id is the last generation the value applied to.
 * The value for `generation` is the past row with the smallest such generation
 * that is still >= `generation`, or the current value if there is none.
 */
function pastFor(rows: Table, generation: number): Table {
  const applicable = rows.filter(
    (row) => Number(row.generation_id) >= generation,
  );
  if (applicable.length === 0) return [];
  const last = Math.min(...applicable.map((row) => Number(row.generation_id)));
  return applicable.filter((row) => Number(row.generation_id) === last);
}

export function buildGame(file: GameFile, t: Tables): GameData {
  const errors: string[] = [];

  const versionGroup = t.version_groups.find(
    (vg) => vg.identifier === file.versionGroup,
  );
  if (!versionGroup)
    throw new Error(`unknown version group ${file.versionGroup}`);
  const generation = Number(versionGroup.generation_id);
  const groupOrder = Number(versionGroup.order);
  if (generation > 3) {
    throw new Error(
      `generation ${generation} decides physical or special per move, which is not supported yet`,
    );
  }
  const groupOrderById = new Map(
    t.version_groups.map((vg) => [vg.id, Number(vg.order)]),
  );

  const versionNames = englishNames(t.version_names, "version_id");
  const versions = t.versions
    .filter((v) => v.version_group_id === versionGroup.id)
    .map((v) => ({
      id: v.identifier,
      name: versionNames.get(v.id) ?? v.identifier,
    }));

  // Types and the type chart as they were in this generation.
  const typeRows = t.types
    .filter(
      (row) =>
        Number(row.generation_id) <= generation && Number(row.id) < 10000,
    )
    .sort((a, b) => Number(a.id) - Number(b.id));
  const typeIndex = new Map(typeRows.map((row, i) => [row.id, i]));
  const types = typeRows.map((row) => row.identifier);
  const physicalTypes = typeRows.map((row) => row.damage_class_id === "2");
  const typeChart = types.map(() => types.map(() => 1));
  for (const row of t.type_efficacy) {
    const a = typeIndex.get(row.damage_type_id);
    const d = typeIndex.get(row.target_type_id);
    if (a !== undefined && d !== undefined)
      typeChart[a][d] = Number(row.damage_factor) / 100;
  }
  const pastEfficacy = groupBy(
    t.type_efficacy_past.map((row) => ({
      ...row,
      pair: `${row.damage_type_id}:${row.target_type_id}`,
    })),
    "pair",
  );
  for (const rows of pastEfficacy.values()) {
    for (const row of pastFor(rows, generation)) {
      const a = typeIndex.get(row.damage_type_id);
      const d = typeIndex.get(row.target_type_id);
      if (a !== undefined && d !== undefined)
        typeChart[a][d] = Number(row.damage_factor) / 100;
    }
  }

  // Moves as they were in this version group. Each changelog row holds the
  // values a move had before the version group it names.
  const changelog = groupBy(t.move_changelog, "move_id");
  const moveNames = englishNames(t.move_names, "move_id");
  const moveRowsById = indexBy(t.moves, "id");
  const moveIdsByIdentifier = new Map(
    t.moves.map((row) => [row.identifier, row.id]),
  );
  const moves: Record<string, Move> = {};
  /** The move's type index and power in this game, or undefined if it does no direct damage. */
  function damagingMove(moveId: string, context: string): string | undefined {
    const row = moveRowsById.get(moveId)!;
    const later = (changelog.get(moveId) ?? [])
      .filter(
        (c) =>
          (groupOrderById.get(c.changed_in_version_group_id) ?? 0) > groupOrder,
      )
      .sort(
        (a, b) =>
          groupOrderById.get(a.changed_in_version_group_id)! -
          groupOrderById.get(b.changed_in_version_group_id)!,
      );
    const typeId = later.find((c) => c.type_id)?.type_id ?? row.type_id;
    const effectId = later.find((c) => c.effect_id)?.effect_id ?? row.effect_id;
    const power =
      Number(later.find((c) => c.power)?.power ?? row.power) *
      (powerFactorByEffect[effectId] ?? 1);
    if (!power) return undefined;
    const type = typeIndex.get(typeId);
    if (type === undefined) {
      errors.push(
        `${context}: ${row.identifier} has a type generation ${generation} lacks`,
      );
      return undefined;
    }
    moves[row.identifier] ??= {
      name: moveNames.get(moveId) ?? row.identifier,
      type,
      power,
    };
    return row.identifier;
  }
  const levelUp = t.pokemon_move_methods.find(
    (row) => row.identifier === "level-up",
  )!.id;
  const machine = t.pokemon_move_methods.find(
    (row) => row.identifier === "machine",
  )!.id;
  const hms: Record<string, number> = {};
  for (const [move, stage] of Object.entries(file.hms)) {
    const moveId = moveIdsByIdentifier.get(move);
    if (!moveId) errors.push(`hms: unknown move ${move}`);
    else if (damagingMove(moveId, "hms")) hms[move] = stage;
  }
  const hmUsers = groupBy(
    t.pokemon_moves.filter(
      (row) =>
        row.version_group_id === versionGroup.id &&
        row.pokemon_move_method_id === machine &&
        moveRowsById.get(row.move_id)!.identifier in hms,
    ),
    "pokemon_id",
  );
  const learnsets = groupBy(
    t.pokemon_moves.filter(
      (row) =>
        row.version_group_id === versionGroup.id &&
        row.pokemon_move_method_id === levelUp,
    ),
    "pokemon_id",
  );

  // Species in the regional Pokédex, plus anything a battle uses.
  const pokedex = t.pokedexes.find((row) => row.identifier === file.pokedex);
  if (!pokedex) throw new Error(`unknown pokedex ${file.pokedex}`);
  const speciesByIdentifier = indexBy(t.pokemon_species, "identifier");
  const speciesById = indexBy(t.pokemon_species, "id");
  const regional = new Map(
    t.pokemon_dex_numbers
      .filter((row) => row.pokedex_id === pokedex.id)
      .map((row) => [row.species_id, Number(row.pokedex_number)]),
  );
  const defaultPokemon = new Map(
    t.pokemon
      .filter((row) => row.is_default === "1")
      .map((row) => [row.species_id, row.id]),
  );
  const pokemonSpecies = new Map(
    t.pokemon.map((row) => [row.id, row.species_id]),
  );
  const speciesNames = englishNames(
    t.pokemon_species_names,
    "pokemon_species_id",
  );
  const typesByPokemon = groupBy(t.pokemon_types, "pokemon_id");
  const pastTypesByPokemon = groupBy(t.pokemon_types_past, "pokemon_id");
  const statsByPokemon = groupBy(t.pokemon_stats, "pokemon_id");
  const pastStatsByPokemon = groupBy(t.pokemon_stats_past, "pokemon_id");
  const statById = new Map(
    t.stats.map((row) => [row.id, statIdentifiers[row.identifier]]),
  );

  const species: Record<string, Species> = {};
  function addSpecies(speciesId: string): string {
    const row = speciesById.get(speciesId)!;
    if (species[row.identifier]) return row.identifier;
    const pokemonId = defaultPokemon.get(speciesId)!;

    const pastTypes = pastFor(
      pastTypesByPokemon.get(pokemonId) ?? [],
      generation,
    );
    const typeRowsForPokemon =
      pastTypes.length > 0 ? pastTypes : typesByPokemon.get(pokemonId)!;
    const speciesTypes: number[] = [];
    for (const typeRow of [...typeRowsForPokemon].sort(
      (a, b) => Number(a.slot) - Number(b.slot),
    )) {
      const index = typeIndex.get(typeRow.type_id);
      if (index === undefined) {
        errors.push(
          `${row.identifier} has type ${typeRow.type_id}, which generation ${generation} lacks`,
        );
      } else {
        speciesTypes.push(index);
      }
    }

    const stats: Partial<Stats> = {};
    const pastStats = groupBy(
      pastStatsByPokemon.get(pokemonId) ?? [],
      "stat_id",
    );
    for (const statRow of statsByPokemon.get(pokemonId)!) {
      const key = statById.get(statRow.stat_id);
      if (!key) continue;
      const past = pastFor(pastStats.get(statRow.stat_id) ?? [], generation);
      stats[key] = Number((past[0] ?? statRow).base_stat);
    }

    const learnset: [number, string][] = [];
    for (const moveRow of learnsets.get(pokemonId) ?? []) {
      const move = damagingMove(moveRow.move_id, row.identifier);
      if (move) learnset.push([Number(moveRow.level), move]);
    }
    learnset.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

    species[row.identifier] = {
      id: row.identifier,
      name: speciesNames.get(speciesId) ?? row.identifier,
      dex: regional.get(speciesId) ?? Number(speciesId),
      national: Number(speciesId),
      types: speciesTypes,
      stats: stats as Stats,
      legendary: row.is_legendary === "1" || row.is_mythical === "1",
      learnset,
      hms: (hmUsers.get(pokemonId) ?? [])
        .map((m) => moveRowsById.get(m.move_id)!.identifier)
        .sort(),
    };
    return row.identifier;
  }
  for (const speciesId of regional.keys()) addSpecies(speciesId);

  function regionalSpecies(
    identifier: string,
    context: string,
  ): string | undefined {
    const row = speciesByIdentifier.get(identifier);
    if (!row) errors.push(`${context}: unknown species ${identifier}`);
    else if (!regional.has(row.id))
      errors.push(
        `${context}: ${identifier} is not in the ${file.pokedex} Pokédex`,
      );
    else return identifier;
    return undefined;
  }

  // Evolution items.
  const itemsByIdentifier = indexBy(t.items, "identifier");
  const itemsById = indexBy(t.items, "id");
  const itemNames = englishNames(t.item_names, "item_id");
  const items: Record<string, string> = {};
  for (const item of Object.keys(file.items)) {
    const row = itemsByIdentifier.get(item);
    if (!row) errors.push(`items: unknown item ${item}`);
    else items[item] = itemNames.get(row.id) ?? item;
  }

  // Evolutions between regional species, using methods that existed by this game.
  const triggers = new Map(
    t.evolution_triggers.map((row) => [row.id, row.identifier]),
  );
  const evolutionRows = groupBy(
    t.pokemon_evolution.filter((row) => {
      const evolved = speciesById.get(row.evolved_species_id)!;
      return (
        regional.has(row.evolved_species_id) &&
        regional.has(evolved.evolves_from_species_id) &&
        (groupOrderById.get(row.version_group_id) ?? 0) <= groupOrder
      );
    }),
    "evolved_species_id",
  );
  const evolutions: Evolution[] = [];
  for (const [evolvedId, rows] of evolutionRows) {
    const to = speciesById.get(evolvedId)!.identifier;
    const from = speciesById.get(
      speciesById.get(evolvedId)!.evolves_from_species_id,
    )!.identifier;
    if (rows.length !== 1) {
      errors.push(
        `${from} -> ${to}: ${rows.length} evolution methods apply, expected 1`,
      );
      continue;
    }
    const row = rows[0];
    const trigger = triggers.get(row.evolution_trigger_id);
    if (trigger === "level-up" && row.minimum_level) {
      evolutions.push({
        from,
        to,
        method: { kind: "level", level: Number(row.minimum_level) },
      });
    } else if (trigger === "use-item") {
      const item = itemsById.get(row.trigger_item_id)!.identifier;
      const stage = file.items[item];
      if (stage === undefined)
        errors.push(
          `${from} -> ${to} needs ${item}, which items does not list`,
        );
      else evolutions.push({ from, to, method: { kind: "item", item, stage } });
    } else if (trigger === "trade" && !row.held_item_id) {
      evolutions.push({ from, to, method: { kind: "trade" } });
    } else {
      errors.push(`${from} -> ${to}: unsupported evolution method ${trigger}`);
    }
  }

  // Battles.
  function opponents(
    party: GameFile["battles"][number]["party"] & object,
    context: string,
  ): Opponent[] {
    return party.map((member) => {
      const row = speciesByIdentifier.get(member.species);
      if (!row) errors.push(`${context}: unknown species ${member.species}`);
      const damagingMoves: string[] = [];
      for (const move of member.moves) {
        const moveId = moveIdsByIdentifier.get(move);
        if (!moveId) {
          errors.push(`${context}: unknown move ${move}`);
          continue;
        }
        const damaging = damagingMove(moveId, context);
        if (damaging) damagingMoves.push(damaging);
      }
      return {
        species: row ? addSpecies(row.id) : member.species,
        level: member.level,
        moves: damagingMoves,
      };
    });
  }
  const starters = file.starters.filter((s) => regionalSpecies(s, "starters"));
  const battles: Battle[] = file.battles.map((battle) => {
    const parties: Record<string, Opponent[]> = {};
    if (battle.party) parties["*"] = opponents(battle.party, battle.id);
    for (const [starter, party] of Object.entries(
      battle.partyByStarter ?? {},
    )) {
      if (!starters.includes(starter))
        errors.push(`${battle.id}: ${starter} is not a starter`);
      parties[starter] = opponents(party, `${battle.id} (${starter})`);
    }
    if (battle.partyByStarter) {
      for (const starter of starters) {
        if (!parties[starter])
          errors.push(`${battle.id}: no party for starter ${starter}`);
      }
    }
    const aceLevel = Math.max(
      ...Object.values(parties)
        .flat()
        .map((o) => o.level),
    );
    return {
      id: battle.id,
      name: battle.name,
      title: battle.title,
      aceLevel,
      parties,
    };
  });

  // Every location key must exist in PokeAPI.
  const locationsByIdentifier = indexBy(t.locations, "identifier");
  const areasByLocation = groupBy(t.location_areas, "location_id");
  for (const key of Object.keys(file.locations)) {
    const [location, area] = key.split("/");
    const row = locationsByIdentifier.get(location);
    if (!row) errors.push(`locations: unknown location ${location}`);
    else if (
      area &&
      !(areasByLocation.get(row.id) ?? []).some((a) => a.identifier === area)
    ) {
      errors.push(`locations: ${location} has no area ${area}`);
    }
  }
  const methodIdentifiers = new Set(
    t.encounter_methods.map((row) => row.identifier),
  );
  for (const method of Object.keys(file.methods)) {
    if (!methodIdentifiers.has(method))
      errors.push(`methods: unknown encounter method ${method}`);
  }

  // Sources: every encounter in the game, placed at its stage.
  const slots = indexBy(t.encounter_slots, "id");
  const methodsById = indexBy(t.encounter_methods, "id");
  const methodNames = englishNames(
    t.encounter_method_prose,
    "encounter_method_id",
  );
  const areas = indexBy(t.location_areas, "id");
  const locationsById = indexBy(t.locations, "id");
  const locationNames = englishNames(t.location_names, "location_id");
  const areaNames = englishNames(t.location_area_prose, "location_area_id");
  const unmapped = new Set<string>();
  const usedTrades = new Set<string>();
  const sources: Record<string, Record<string, Source[]>> = {};
  for (const version of t.versions.filter(
    (v) => v.version_group_id === versionGroup.id,
  )) {
    const merged = new Map<string, Source & { species: string }>();
    for (const encounter of t.encounters.filter(
      (e) => e.version_id === version.id,
    )) {
      const area = areas.get(encounter.location_area_id)!;
      const location = locationsById.get(area.location_id)!;
      const placement =
        file.locations[`${location.identifier}/${area.identifier}`] ??
        file.locations[location.identifier];
      if (placement === undefined) {
        unmapped.add(
          location.identifier + (area.identifier ? `/${area.identifier}` : ""),
        );
        continue;
      }
      if (placement === "postgame" || placement === "excluded") continue;
      const speciesId = pokemonSpecies.get(encounter.pokemon_id)!;
      if (!regional.has(speciesId)) continue;

      const method = methodsById.get(
        slots.get(encounter.encounter_slot_id)!.encounter_method_id,
      )!;
      const speciesIdentifier = speciesById.get(speciesId)!.identifier;
      let stage = Math.max(placement, file.methods[method.identifier] ?? 0);
      let gives: string | undefined;
      let place: string | undefined;
      if (method.identifier === "npc-trade") {
        const trade = file.trades[speciesIdentifier];
        if (!trade) {
          errors.push(
            `trades: ${speciesIdentifier} is traded in ${version.identifier} but not listed`,
          );
          continue;
        }
        usedTrades.add(speciesIdentifier);
        gives =
          typeof trade.gives === "string"
            ? trade.gives
            : trade.gives[version.identifier];
        if (!gives)
          errors.push(
            `trades: ${speciesIdentifier} gives nothing in ${version.identifier}`,
          );
        else regionalSpecies(gives, `trades.${speciesIdentifier}`);
        stage = Math.max(stage, trade.stage ?? 0);
        place = trade.place;
      }
      const locationName =
        locationNames.get(location.id) ?? location.identifier;
      // Floors and sections matter little for wild Pokémon, but a gift, trade or
      // one-off encounter is worth pinpointing.
      const wild = ![
        "gift",
        "gift-egg",
        "npc-trade",
        "static",
        "pokeflute",
      ].includes(method.identifier);
      // PokeAPI area names often end in a parenthesized floor or route number.
      const areaName =
        area.identifier && !wild
          ? areaNames.get(area.id)?.replace(/ \([^()]*\)$/, "")
          : undefined;
      const source = {
        species: speciesIdentifier,
        stage,
        location: place
          ? place
          : !areaName
            ? locationName
            : plain(areaName).includes(plain(locationName))
              ? areaName
              : `${locationName} (${areaName})`,
        method: methodNames.get(method.id) ?? method.identifier,
        minLevel: Number(encounter.min_level),
        maxLevel: Number(encounter.max_level),
        ...(gives ? { gives } : {}),
      };
      const key = `${source.species}|${source.location}|${source.method}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, source);
      } else {
        existing.stage = Math.min(existing.stage, source.stage);
        existing.minLevel = Math.min(existing.minLevel, source.minLevel);
        existing.maxLevel = Math.max(existing.maxLevel, source.maxLevel);
      }
    }
    const bySpecies: Record<string, Source[]> = {};
    for (const { species: id, ...source } of merged.values())
      (bySpecies[id] ??= []).push(source);
    for (const list of Object.values(bySpecies)) {
      list.sort(
        (a, b) => a.stage - b.stage || a.location.localeCompare(b.location),
      );
    }
    sources[version.identifier] = bySpecies;
  }
  for (const location of unmapped)
    errors.push(`locations: ${location} has encounters but no stage`);
  for (const traded of Object.keys(file.trades)) {
    if (!usedTrades.has(traded))
      errors.push(`trades: ${traded} is not traded in this game`);
  }

  const exclusiveGroups = file.exclusiveGroups.map((group) =>
    group.filter((s) => regionalSpecies(s, "exclusiveGroups")),
  );

  if (errors.length > 0) {
    throw new Error(
      `${file.id} has ${errors.length} problem(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return {
    id: file.id,
    name: file.name,
    generation,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/${file.sprites}/{national}.png`,
    versions,
    types,
    typeChart,
    physicalTypes,
    species,
    moves,
    evolutions,
    sources,
    items,
    hms,
    starters,
    exclusiveGroups,
    battles,
  };
}
