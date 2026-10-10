// Evolutions between regional species, with what each needs and when the game
// file says the story provides it.
import type { Evolution, EvolutionRequirements } from "../engine/data.ts";
import {
  groupBy,
  indexBy,
  inEveryVersion,
  type BuildContext,
} from "./build-context.ts";
import type { MoveCatalog, TypeTable } from "./build-moves.ts";
import type { SpeciesCatalog } from "./build-species.ts";
import { englishNames, identifierById, type Table } from "./pokeapi.ts";

/**
 * Evolutions by the methods of the latest version group up to this game. Rows
 * that differ only in the form they name, such as Burmy's cloaks, are one
 * method, and so are rows for every gender.
 */
export function buildEvolutions(
  {
    file,
    t,
    errors,
    groupOrder,
    groupOrderById,
    speciesById,
    speciesByIdentifier,
    speciesNames,
    defaultPokemon,
    moveRowsById,
    moveNames,
    locationsById,
    locationNames,
  }: BuildContext,
  { types, typeIndex }: TypeTable,
  { learnsets }: MoveCatalog,
  { species, regional }: SpeciesCatalog,
): Evolution[] {
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
  const learnLevel = (from: string, wanted: (moveId: string) => boolean) => {
    let level: number | undefined;
    for (let s: string | undefined = from; s;) {
      const row: Record<string, string> = speciesByIdentifier.get(s)!;
      for (const move of learnsets.get(defaultPokemon.get(row.id)!) ?? []) {
        if (wanted(move.move_id))
          level = Math.min(level ?? Infinity, Number(move.level));
      }
      s = speciesById.get(row.evolves_from_species_id)?.identifier;
    }
    return level;
  };

  interface Method {
    requires: EvolutionRequirements;
    label: string;
    afterStory: boolean;
  }
  /** One evolution method, or undefined if it cannot be read. */
  function readMethod(
    row: Record<string, string>,
    trigger: string | undefined,
    from: string,
    context: string,
  ): Method | undefined {
    if (
      trigger !== "level-up" &&
      trigger !== "use-item" &&
      trigger !== "trade"
    ) {
      errors.push(`${context}: unsupported evolution method ${trigger}`);
      return undefined;
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
      return undefined;
    }
    return { requires, label: label.join(", "), afterStory };
  }

  for (const [evolvedId, rows] of evolutionRows) {
    const to = speciesById.get(evolvedId)!.identifier;
    const from = speciesById.get(
      speciesById.get(evolvedId)!.evolves_from_species_id,
    )!.identifier;
    const context = `${from} -> ${to}`;
    const triggerOf = (row: Record<string, string>) =>
      triggers.get(row.evolution_trigger_id);
    if (rows.length === 1 && triggerOf(rows[0]) === "shed") {
      // Shedinja appears when Nincada evolves by level with a free party slot.
      shed.push({ from, to });
      continue;
    }
    const methods = rows.map((row) =>
      readMethod(row, triggerOf(row), from, context),
    );
    if (methods.some((m) => m === undefined)) continue;
    // Several methods are alternatives, such as evolving in either of two
    // places: the player takes whichever the story offers first.
    const story = (methods as Method[]).filter((m) => !m.afterStory);
    if (story.length === 0) continue;
    const first = story.reduce((a, b) =>
      (b.requires.stage ?? 0) < (a.requires.stage ?? 0) ? b : a,
    );
    evolutions.push({ from, to, label: first.label, requires: first.requires });
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
  return evolutions;
}
