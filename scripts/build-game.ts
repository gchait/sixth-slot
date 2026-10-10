// Turns a curated game file plus PokeAPI's tables into the GameData the app loads.
// Every reference in the game file is checked against PokeAPI, and all problems
// are reported together.
import type { GameFile } from "../data/schema.ts";
import {
  met,
  type Battle,
  type BattleVariant,
  type Evolution,
  type EvolutionRequirements,
  type FieldMove,
  type GameData,
  type Move,
  type Opponent,
  type Source,
  type Species,
  type StatKey,
  type Stats,
} from "../engine/data.ts";
import {
  englishNames,
  identifierById,
  spriteUrl,
  type Table,
  type Tables,
} from "./pokeapi.ts";

type Placement = GameFile["locations"][string];

/**
 * How much of a move's damage counts toward a typical attack, by move effect:
 * moves that knock out the user or need a sleeping user or target count for
 * nothing, and moves that spend a turn charging, recharging or waiting count
 * for half.
 */
const drawbackByEffect: Record<string, number> = {
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

/** Damage that ignores stats, by move effect: the user's level, or HP. */
const fixedDamageByEffect: Record<string, "level" | number> = {
  "88": "level", // Seismic Toss, Night Shade
  "42": 40, // Dragon Rage
  "131": 20, // Sonic Boom
};

/** Encounter methods that give one Pokémon, which cannot be found again. */
const oneTimeMethods = new Set([
  "gift",
  "gift-egg",
  "npc-trade",
  "static",
  "pokeflute",
  "squirt-bottle",
]);

/**
 * Triple Kick's effect: each of three strikes has one more share of the
 * move's power than the last, and needs every strike before it to hit.
 */
const RISING_STRIKES = "105";

/**
 * The average strikes of a move that hits `min` to `max` times. Moves that hit
 * 2 to 5 times average 3 strikes until generation V, and 3.1 from then on.
 */
function averageStrikes(min: number, max: number, generation: number) {
  if (min === max) return min;
  if (min === 2 && max === 5) return generation <= 4 ? 3 : 3.1;
  return undefined;
}

const statIdentifiers: Record<string, StatKey> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

/** Lowercase without accents and with "Mount" shortened, for comparing names. */
function plain(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bmount\b/g, "mt.");
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

/** Until generation IV, a move's type decides whether it is physical. */
export function isPhysical(
  generation: number,
  type: Record<string, string>,
  move: Record<string, string>,
): boolean {
  return (generation <= 3 ? type : move).damage_class_id === "2";
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
  if (generation === 1) {
    throw new Error(
      "generation 1 has a single Special stat, which is not supported yet",
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
  const versionIds = versions.map((v) => v.id);
  for (const [key, placement] of Object.entries(file.locations)) {
    if (
      typeof placement === "object" &&
      Object.keys(placement).sort().join() !== [...versionIds].sort().join()
    )
      errors.push(
        `locations.${key}: give a placement for each of ${versionIds.join(", ")}`,
      );
  }
  /** A location's placement in one version. */
  const inVersion = (placement: Placement | undefined, version: string) =>
    typeof placement === "object" ? placement[version] : placement;
  /** A location's placement in every version: the latest of them. */
  const inEveryVersion = (placement: Placement | undefined) => {
    if (typeof placement !== "object") return placement;
    const stages = Object.values(placement);
    return stages.every((stage) => typeof stage === "number")
      ? Math.max(...stages)
      : "postgame";
  };

  // Types and the type chart as they were in this generation.
  const typeRows = t.types
    .filter(
      (row) =>
        Number(row.generation_id) <= generation && Number(row.id) < 10000,
    )
    .sort((a, b) => Number(a.id) - Number(b.id));
  const typeIndex = new Map(typeRows.map((row, i) => [row.id, i]));
  const types = typeRows.map((row) => row.identifier);
  const typeChart = types.map(() => types.map(() => 1));
  const setEfficacy = (row: Record<string, string>) => {
    const a = typeIndex.get(row.damage_type_id);
    const d = typeIndex.get(row.target_type_id);
    if (a !== undefined && d !== undefined)
      typeChart[a][d] = Number(row.damage_factor) / 100;
  };
  t.type_efficacy.forEach(setEfficacy);
  const pastEfficacy = groupBy(
    t.type_efficacy_past.map((row) => ({
      ...row,
      pair: `${row.damage_type_id}:${row.target_type_id}`,
    })),
    "pair",
  );
  for (const rows of pastEfficacy.values())
    pastFor(rows, generation).forEach(setEfficacy);

  // Moves as they were in this version group. Each changelog row holds the
  // values a move had before the version group it names.
  const changelog = groupBy(t.move_changelog, "move_id");
  const moveNames = englishNames(t.move_names, "move_id");
  const moveRowsById = indexBy(t.moves, "id");
  const moveIdsByIdentifier = new Map(
    t.moves.map((row) => [row.identifier, row.id]),
  );
  const metaByMove = indexBy(t.move_meta, "move_id");
  const moves: Record<string, Move> = {};
  /** Records the move as it was in this game; undefined if it does no direct damage. */
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
    const power = Number(later.find((c) => c.power)?.power ?? row.power);
    const fixed = fixedDamageByEffect[effectId];
    const drawback = drawbackByEffect[effectId] ?? 1;
    if ((!power && fixed === undefined) || drawback === 0) return undefined;
    // An empty accuracy means the move never misses.
    const accuracy =
      Number(later.find((c) => c.accuracy)?.accuracy ?? row.accuracy) / 100 ||
      1;
    const meta = metaByMove.get(moveId);
    const strikes = meta?.min_hits
      ? averageStrikes(Number(meta.min_hits), Number(meta.max_hits), generation)
      : 1;
    if (strikes === undefined) {
      errors.push(`${context}: ${row.identifier} has an unknown hit count`);
      return undefined;
    }
    const type = typeIndex.get(typeId);
    if (type === undefined) {
      errors.push(
        `${context}: ${row.identifier} has a type generation ${generation} lacks`,
      );
      return undefined;
    }
    const physical = isPhysical(generation, typeRows[type], row);
    moves[row.identifier] ??= {
      name: moveNames.get(moveId) ?? row.identifier,
      type,
      power: fixed === undefined ? power : 0,
      physical,
      ...(fixed !== undefined && { fixed }),
      factor:
        drawback *
        (effectId === RISING_STRIKES
          ? accuracy + 2 * accuracy ** 2 + 3 * accuracy ** 3
          : strikes * accuracy),
    };
    return row.identifier;
  }
  const methodIds = identifierById(t.pokemon_move_methods);
  /** This version group's learnable moves by `method`, by Pokémon. */
  const movesBy = (
    method: string,
    keep: (row: Record<string, string>) => boolean = () => true,
  ) =>
    groupBy(
      t.pokemon_moves.filter(
        (row) =>
          row.version_group_id === versionGroup.id &&
          methodIds.get(row.pokemon_move_method_id) === method &&
          keep(row),
      ),
      "pokemon_id",
    );
  const hms: Record<string, number> = {};
  for (const [move, stage] of Object.entries(file.hms)) {
    const moveId = moveIdsByIdentifier.get(move);
    if (!moveId) errors.push(`hms: unknown move ${move}`);
    else if (damagingMove(moveId, "hms") && typeof stage === "number")
      hms[move] = stage;
  }
  const hmUsers = movesBy(
    "machine",
    (row) => moveRowsById.get(row.move_id)!.identifier in hms,
  );
  const learnsets = movesBy("level-up");
  const fieldMoves: FieldMove[] = [];
  for (const [move, stage] of Object.entries(file.fieldMoves)) {
    const moveId = moveIdsByIdentifier.get(move);
    if (!moveId) errors.push(`fieldMoves: unknown move ${move}`);
    else
      fieldMoves.push({ id: move, name: moveNames.get(moveId) ?? move, stage });
    const obtained = file.hms[move];
    if (
      obtained !== undefined &&
      !(typeof obtained === "number" && obtained <= stage)
    )
      errors.push(`fieldMoves.${move}: works before hms.${move} is obtained`);
  }
  const isFieldMove = (row: Record<string, string>) =>
    moveRowsById.get(row.move_id)!.identifier in file.fieldMoves;
  const fieldMachines = movesBy("machine", isFieldMove);
  const fieldLevelUps = movesBy("level-up", isFieldMove);

  // Species in the regional Pokédexes, plus anything a battle uses.
  const pokedexIds = file.pokedex.map((name) => {
    const pokedex = t.pokedexes.find((row) => row.identifier === name);
    if (!pokedex) throw new Error(`unknown pokedex ${name}`);
    return pokedex.id;
  });
  const regional = new Set(
    t.pokemon_dex_numbers
      .filter((row) => pokedexIds.includes(row.pokedex_id))
      .map((row) => row.species_id),
  );
  const speciesByIdentifier = indexBy(t.pokemon_species, "identifier");
  const speciesById = indexBy(t.pokemon_species, "id");
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
  const abilityNames = identifierById(t.abilities);
  const abilitiesByPokemon = groupBy(t.pokemon_abilities, "pokemon_id");
  const pastAbilitiesByPokemon = groupBy(
    t.pokemon_abilities_past,
    "pokemon_id",
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

    // Regular abilities as they were in this generation, slot by slot; a past
    // row without an ability means the slot did not exist yet.
    const abilities: string[] = [];
    const pastAbilities = groupBy(
      pastAbilitiesByPokemon.get(pokemonId) ?? [],
      "slot",
    );
    for (const abilityRow of abilitiesByPokemon.get(pokemonId) ?? []) {
      if (abilityRow.is_hidden === "1") continue;
      const past = pastFor(
        pastAbilities.get(abilityRow.slot) ?? [],
        generation,
      );
      const abilityId =
        past.length > 0 ? past[0].ability_id : abilityRow.ability_id;
      if (generation >= 3 && abilityId)
        abilities.push(abilityNames.get(abilityId)!);
    }

    const learnset: [number, string][] = [];
    for (const moveRow of learnsets.get(pokemonId) ?? []) {
      const move = damagingMove(moveRow.move_id, row.identifier);
      if (move) learnset.push([Number(moveRow.level), move]);
    }
    learnset.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

    const fieldMoveLevels: Record<string, number> = {};
    const knowFrom = (moveRow: Record<string, string>, level: number) => {
      const move = moveRowsById.get(moveRow.move_id)!.identifier;
      fieldMoveLevels[move] = Math.min(fieldMoveLevels[move] ?? level, level);
    };
    for (const moveRow of fieldMachines.get(pokemonId) ?? [])
      knowFrom(moveRow, 1);
    for (const moveRow of fieldLevelUps.get(pokemonId) ?? [])
      knowFrom(moveRow, Math.max(1, Number(moveRow.level)));

    species[row.identifier] = {
      id: row.identifier,
      name: speciesNames.get(speciesId) ?? row.identifier,
      national: Number(speciesId),
      types: speciesTypes,
      stats: stats as Stats,
      legendary: row.is_legendary === "1" || row.is_mythical === "1",
      abilities: [...new Set(abilities)].sort(),
      learnset,
      hms: (hmUsers.get(pokemonId) ?? [])
        .map((m) => moveRowsById.get(m.move_id)!.identifier)
        .sort(),
      fieldMoves: Object.fromEntries(
        Object.entries(fieldMoveLevels).sort(([a], [b]) => a.localeCompare(b)),
      ),
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
        `${context}: ${identifier} is not in the ${file.pokedex.join(" or ")} Pokédex`,
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

  const locationsById = indexBy(t.locations, "id");
  const locationNames = englishNames(t.location_names, "location_id");

  // Evolutions between regional species, by the methods of the latest version
  // group up to this game. Rows that differ only in the form they name, such
  // as Burmy's cloaks, are one method, and so are rows for every gender.
  const triggers = identifierById(t.evolution_triggers);
  const perRow = new Set([
    "id",
    "required_pokemon_form_id",
    "evolved_pokemon_form_id",
  ]);
  const evolutionRows = new Map<string, Table>();
  for (const [evolvedId, rows] of groupBy(
    t.pokemon_evolution.filter((row) => {
      const evolved = speciesById.get(row.evolved_species_id)!;
      return (
        regional.has(row.evolved_species_id) &&
        regional.has(evolved.evolves_from_species_id) &&
        (groupOrderById.get(row.version_group_id) ?? 0) <= groupOrder
      );
    }),
    "evolved_species_id",
  )) {
    const order = (row: Record<string, string>) =>
      groupOrderById.get(row.version_group_id)!;
    const latest = Math.max(...rows.map(order));
    const methods = rows
      .filter((row) => order(row) === latest)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([column]) => !perRow.has(column)),
        ),
      );
    const genders = new Set(methods.map((m) => m.gender_id));
    const distinct = new Map(
      methods.map((m) => {
        const method = genders.size > 1 ? { ...m, gender_id: "" } : m;
        return [JSON.stringify(method), method];
      }),
    );
    evolutionRows.set(evolvedId, [...distinct.values()]);
  }
  const evolutions: Evolution[] = [];
  const shed: { from: string; to: string }[] = [];
  const genders: Record<string, string> = { "1": "female", "2": "male" };
  const stats: Record<string, string> = {
    "-1": "Attack below Defense",
    "0": "Attack equal to Defense",
    "1": "Attack above Defense",
  };
  const itemName = (item: string) => items[item] ?? item;
  /** The stage of something an evolution needs; "postgame" leaves it out. */
  const needStage = (
    stage: number | string | undefined,
    context: string,
    what: string,
  ): number | "postgame" | undefined => {
    if (typeof stage === "number") return stage;
    if (stage === "postgame" || stage === "excluded") return "postgame";
    errors.push(`${context} needs ${what}, which has no story stage`);
    return undefined;
  };
  const itemStage = (itemId: string, context: string) => {
    const item = itemsById.get(itemId)!.identifier;
    if (!(item in items)) items[item] = itemNames.get(itemId) ?? item;
    return needStage(file.items[item], context, `items.${item}`);
  };
  /** The lowest level at which `species` or an earlier form learns a move matching `wanted`. */
  const learnLevel = (species: string, wanted: (moveId: string) => boolean) => {
    let level: number | undefined;
    for (let s: string | undefined = species; s;) {
      const row: Record<string, string> = speciesByIdentifier.get(s)!;
      for (const move of learnsets.get(defaultPokemon.get(row.id)!) ?? []) {
        if (wanted(move.move_id))
          level = Math.min(level ?? Infinity, Number(move.level));
      }
      s = speciesById.get(row.evolves_from_species_id)?.identifier;
    }
    return level;
  };

  for (const [evolvedId, rows] of evolutionRows) {
    const to = speciesById.get(evolvedId)!.identifier;
    const from = speciesById.get(
      speciesById.get(evolvedId)!.evolves_from_species_id,
    )!.identifier;
    const context = `${from} -> ${to}`;
    if (rows.length !== 1) {
      errors.push(
        `${context}: ${rows.length} evolution methods apply, expected 1`,
      );
      continue;
    }
    const row = rows[0];
    const trigger = triggers.get(row.evolution_trigger_id);
    if (trigger === "shed") {
      // Shedinja appears when Nincada evolves by level with a free party slot.
      shed.push({ from, to });
      continue;
    }
    if (
      trigger !== "level-up" &&
      trigger !== "use-item" &&
      trigger !== "trade"
    ) {
      errors.push(`${context}: unsupported evolution method ${trigger}`);
      continue;
    }

    const requires: EvolutionRequirements = {};
    const label: string[] = [];
    let afterStory = false;
    const atStage = (stage: number | "postgame" | undefined) => {
      if (stage === "postgame") afterStory = true;
      else if (stage !== undefined)
        requires.stage = Math.max(requires.stage ?? 0, stage);
    };
    if (row.minimum_level) {
      requires.level = Number(row.minimum_level);
      label.push(`Lv ${row.minimum_level}`);
    }
    if (trigger === "use-item") {
      atStage(itemStage(row.trigger_item_id, context));
      label.push(itemName(itemsById.get(row.trigger_item_id)!.identifier));
    }
    if (trigger === "trade") {
      requires.trade = true;
      label.push("trade");
    }
    if (row.held_item_id) {
      atStage(itemStage(row.held_item_id, context));
      label.push(
        `holding ${itemName(itemsById.get(row.held_item_id)!.identifier)}`,
      );
    }
    if (row.trade_species_id) {
      const partner = speciesById.get(row.trade_species_id)!.identifier;
      requires.species = partner;
      label.push(`for ${speciesNames.get(row.trade_species_id) ?? partner}`);
    }
    if (row.known_move_id) {
      const move = moveRowsById.get(row.known_move_id)!.identifier;
      const level = learnLevel(from, (id) => id === row.known_move_id);
      if (level !== undefined)
        requires.level = Math.max(requires.level ?? 0, level);
      else atStage(needStage(file.moves[move], context, `moves.${move}`));
      label.push(`knowing ${moveNames.get(row.known_move_id) ?? move}`);
    }
    if (row.known_move_type_id) {
      const typeName = t.types.find(
        (ty) => ty.id === row.known_move_type_id,
      )!.identifier;
      const level = learnLevel(
        from,
        (id) => moveRowsById.get(id)!.type_id === row.known_move_type_id,
      );
      if (level === undefined)
        errors.push(
          `${context} needs a ${typeName} move, which it does not learn by level`,
        );
      else requires.level = Math.max(requires.level ?? 0, level);
      label.push(`knowing a ${typeName} move`);
    }
    if (row.minimum_happiness || row.minimum_affection) {
      requires.friendship = true;
      label.push(row.minimum_happiness ? "friendship" : "affection");
    }
    if (row.minimum_beauty) {
      atStage(
        needStage(
          file.evolutionConditions.beauty,
          context,
          "evolutionConditions.beauty",
        ),
      );
      label.push("beauty");
    }
    if (row.location_id) {
      const place = locationsById.get(row.location_id)!;
      atStage(
        needStage(
          inEveryVersion(file.locations[place.identifier]),
          context,
          `locations.${place.identifier}`,
        ),
      );
      label.push(
        `at ${locationNames.get(row.location_id) ?? place.identifier}`,
      );
    }
    if (row.party_species_id) {
      requires.species = speciesById.get(row.party_species_id)!.identifier;
      label.push(
        `with ${speciesNames.get(row.party_species_id) ?? requires.species} in the party`,
      );
    }
    if (row.party_type_id) {
      const type = typeIndex.get(row.party_type_id);
      if (type === undefined)
        errors.push(`${context}: party type ${row.party_type_id} is missing`);
      else requires.partyType = type;
      label.push(`with a ${types[type ?? 0]} Pokémon in the party`);
    }
    if (row.relative_physical_stats) {
      // Which one depends on the Pokémon's stats, so it is hard to plan for.
      requires.random = true;
      label.push(stats[row.relative_physical_stats]);
    }
    // Conditions the player can always meet: the time of day, the Pokémon's
    // gender, rain and holding the system upside down.
    if (row.time_of_day)
      label.push(
        row.time_of_day === "night"
          ? "at night"
          : `during the ${row.time_of_day}`,
      );
    if (row.gender_id) label.push(`(${genders[row.gender_id]})`);
    if (row.needs_overworld_rain === "1") label.push("in the rain");
    if (row.turn_upside_down === "1") label.push("upside down");

    if (trigger === "level-up" && label.length === 0) {
      errors.push(`${context}: level-up evolution without a condition`);
      continue;
    }
    if (!afterStory)
      evolutions.push({ from, to, label: label.join(", "), requires });
  }

  // A Pokémon with several evolutions that read the same evolves into one of
  // them at random (Wurmple).
  const alike = groupBy(
    evolutions.map((e, i) => ({ key: `${e.from}:${e.label}`, i: String(i) })),
    "key",
  );
  for (const group of alike.values()) {
    if (group.length < 2) continue;
    for (const { i } of group) {
      const e = evolutions[Number(i)];
      e.requires = { ...e.requires, random: true };
      e.label += ", at random";
    }
  }
  for (const { from, to } of shed) {
    const sibling = evolutions.find((e) => e.from === from && e.requires.level);
    if (!sibling)
      errors.push(`${from} -> ${to}: no level evolution to shed alongside`);
    else
      evolutions.push({
        from,
        to,
        label: `${sibling.label}, alongside ${species[sibling.to].name}`,
        requires: sibling.requires,
      });
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
  let level = 0;
  const battles: Battle[] = file.battles.map((battle) => {
    const variants: BattleVariant[] = battle.variants.map((variant, i) => {
      const context = `${battle.id} variant ${i + 1}`;
      if (variant.version && !versionIds.includes(variant.version))
        errors.push(`${context}: ${variant.version} is not a version`);
      if (variant.starter && !starters.includes(variant.starter))
        errors.push(`${context}: ${variant.starter} is not a starter`);
      return {
        ...(variant.version && { version: variant.version }),
        ...(variant.starter && { starter: variant.starter }),
        ...(variant.name && { name: variant.name }),
        ...(variant.party && { party: opponents(variant.party, context) }),
      };
    });
    const built: Battle = {
      id: battle.id,
      ...(battle.name && { name: battle.name }),
      title: battle.title,
      postgame: battle.postgame,
      level: 0,
      ...(battle.party && { party: opponents(battle.party, battle.id) }),
      ...(variants.length > 0 && { variants }),
    };
    for (const version of versionIds) {
      for (const starter of starters) {
        const player = `${version} with ${starter}`;
        const matching = variants.filter(
          (v) =>
            (v.version === undefined || v.version === version) &&
            (v.starter === undefined || v.starter === starter),
        );
        if (matching.length > 1)
          errors.push(`${battle.id}: several variants for ${player}`);
        const { name, party } = met(built, { version, starter });
        if (name === undefined)
          errors.push(`${battle.id}: no name for ${player}`);
        if (party === undefined)
          errors.push(`${battle.id}: no party for ${player}`);
      }
    }
    level = Math.max(
      level,
      ...[built.party, ...variants.map((v) => v.party)]
        .flat()
        .map((o) => o?.level ?? 0),
    );
    built.level = level;
    return built;
  });

  const firstPostgame = battles.findIndex((b) => b.postgame);
  if (
    firstPostgame >= 0 &&
    battles.slice(firstPostgame).some((b) => !b.postgame)
  )
    errors.push(
      "battles: post-game battles must come after every story battle",
    );

  // Every stage must leave a battle to fight.
  const checkStage = (where: string, stage: number | string | undefined) => {
    if (typeof stage === "number" && stage >= battles.length)
      errors.push(`${where}: stage ${stage} is after the last battle`);
  };
  for (const [key, placement] of Object.entries(file.locations)) {
    for (const stage of typeof placement === "object"
      ? Object.values(placement)
      : [placement])
      checkStage(`locations.${key}`, stage);
  }
  for (const [key, stage] of Object.entries(file.methods))
    checkStage(`methods.${key}`, stage);
  for (const [key, stage] of Object.entries(file.items))
    checkStage(`items.${key}`, stage);
  for (const [key, stage] of Object.entries(file.hms))
    checkStage(`hms.${key}`, stage);
  for (const [key, stage] of Object.entries(file.fieldMoves))
    checkStage(`fieldMoves.${key}`, stage);
  checkStage("moveRelearner", file.moveRelearner);
  for (const [key, trade] of Object.entries(file.trades))
    checkStage(`trades.${key}`, trade.stage);
  checkStage("evolutionConditions.beauty", file.evolutionConditions.beauty);

  // Every location key must exist in PokeAPI.
  const locationsByIdentifier = indexBy(t.locations, "identifier");
  const areasByLocation = groupBy(t.location_areas, "location_id");
  const methodIdentifiers = new Set(
    t.encounter_methods.map((row) => row.identifier),
  );
  for (const key of Object.keys(file.locations)) {
    const [place, method] = key.split("@");
    const [location, area] = place.split("/");
    if (method && !methodIdentifiers.has(method))
      errors.push(`locations: unknown encounter method ${method} in ${key}`);
    const row = locationsByIdentifier.get(location);
    if (!row) errors.push(`locations: unknown location ${location}`);
    else if (
      area &&
      !(areasByLocation.get(row.id) ?? []).some((a) => a.identifier === area)
    ) {
      errors.push(`locations: ${location} has no area ${area}`);
    }
  }
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
  const areaNames = englishNames(t.location_area_prose, "location_area_id");
  const unmapped = new Set<string>();
  const usedTrades = new Set<string>();
  const conditionValues = identifierById(t.encounter_condition_values);
  const conditionsByEncounter = groupBy(
    t.encounter_condition_value_map,
    "encounter_id",
  );
  const conditionRules = Object.entries(file.encounterConditions).map(
    ([pattern, placement]) => ({
      matches: new RegExp(`^${pattern.replaceAll("*", ".*")}$`),
      placement,
    }),
  );
  const unmappedConditions = new Set<string>();
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
      const method = methodsById.get(
        slots.get(encounter.encounter_slot_id)!.encounter_method_id,
      )!;
      const inArea = `${location.identifier}/${area.identifier}`;
      const placement = inVersion(
        file.locations[`${inArea}@${method.identifier}`] ??
          file.locations[`${location.identifier}@${method.identifier}`] ??
          file.locations[inArea] ??
          file.locations[location.identifier],
        version.identifier,
      );
      if (placement === undefined) {
        unmapped.add(
          location.identifier + (area.identifier ? `/${area.identifier}` : ""),
        );
        continue;
      }
      const methodStage = file.methods[method.identifier] ?? 0;
      if (
        placement === "postgame" ||
        placement === "excluded" ||
        methodStage === "postgame"
      )
        continue;
      const speciesId = pokemonSpecies.get(encounter.pokemon_id)!;
      if (!regional.has(speciesId)) continue;

      const speciesIdentifier = speciesById.get(speciesId)!.identifier;
      let stage = Math.max(placement, methodStage);
      let gives: string | undefined;
      let place: string | undefined;
      const conditions = (conditionsByEncounter.get(encounter.id) ?? []).map(
        (row) => conditionValues.get(row.encounter_condition_value_id)!,
      );
      if (method.identifier === "npc-trade") {
        // The trade's condition names the species the trader wants.
        const wanted = conditions.filter((c) => c.startsWith("trade-"));
        if (wanted.length !== 1) {
          errors.push(
            `${speciesIdentifier} is traded at ${location.identifier} without exactly one trade condition`,
          );
          continue;
        }
        const species = wanted[0].slice("trade-".length);
        if (species !== "any-pokemon")
          gives = regionalSpecies(species, `trade for ${speciesIdentifier}`);
        const trade = file.trades[speciesIdentifier];
        if (trade) {
          usedTrades.add(speciesIdentifier);
          stage = Math.max(stage, trade.stage ?? 0);
          place = trade.place;
        }
      }
      let available = true;
      for (const condition of conditions) {
        if (condition.startsWith("trade-")) continue;
        const rule = conditionRules.find((r) => r.matches.test(condition));
        if (!rule) unmappedConditions.add(condition);
        if (!rule || typeof rule.placement !== "number") available = false;
        else stage = Math.max(stage, rule.placement);
      }
      if (!available) continue;
      const locationName =
        locationNames.get(location.id) ?? location.identifier;
      // Floors and sections matter little for wild Pokémon, but a one-time
      // encounter is worth pinpointing.
      const once = oneTimeMethods.has(method.identifier);
      // PokeAPI area names often end in a parenthesized floor or route number.
      const areaName =
        area.identifier && once
          ? areaNames.get(area.id)?.replace(/ \([^()]*\)$/, "")
          : undefined;
      const levels: [number, number] = [
        Number(encounter.min_level),
        Number(encounter.max_level),
      ];
      const source: Source & { species: string } = {
        species: speciesIdentifier,
        stage,
        location: place
          ? place
          : !areaName || plain(areaName) === plain(locationName)
            ? locationName
            : plain(areaName).includes(plain(locationName))
              ? areaName
              : `${locationName} (${areaName})`,
        method: methodNames.get(method.id) ?? method.identifier,
        ...(once && { once }),
        ...(gives ? { gives } : { levels }),
      };
      const key = `${source.species}|${source.location}|${source.method}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, source);
      } else {
        existing.stage = Math.min(existing.stage, source.stage);
        if ("levels" in existing && "levels" in source) {
          existing.levels = [
            Math.min(existing.levels[0], source.levels[0]),
            Math.max(existing.levels[1], source.levels[1]),
          ];
        }
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
  for (const condition of unmappedConditions)
    errors.push(
      `encounterConditions: ${condition} applies to an encounter but has no stage`,
    );
  for (const traded of Object.keys(file.trades)) {
    if (!usedTrades.has(traded))
      errors.push(`trades: ${traded} is not traded during the story`);
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
    sprite: spriteUrl(file.sprites, "{national}"),
    versions,
    types,
    typeChart,
    species,
    moves,
    evolutions,
    sources,
    hms,
    fieldMoves,
    ...(typeof file.moveRelearner === "number" && {
      moveRelearner: file.moveRelearner,
    }),
    starters,
    exclusiveGroups,
    battles,
  };
}
