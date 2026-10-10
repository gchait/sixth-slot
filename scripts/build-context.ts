// What every step of building a game reads: the game file, PokeAPI's tables
// with the lookups the steps share, and the problems found so far, which are
// reported together at the end.
import type { GameFile } from "../data/schema.ts";
import { englishNames, type Table, type Tables } from "./pokeapi.ts";

type Row = Record<string, string>;
type Placement = GameFile["locations"][string];

export function indexBy(table: Table, key: string): Map<string, Row> {
  return new Map(table.map((row) => [row[key], row]));
}

export function groupBy(table: Table, key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of table) {
    const group = groups.get(row[key]);
    if (group) group.push(row);
    else groups.set(row[key], [row]);
  }
  return groups;
}

/**
 * PokeAPI keeps current values in one table and older ones in a "_past" table,
 * where each row's generation_id is the last generation the value applied to.
 * The value for `generation` is the past row with the smallest such generation
 * that is still >= `generation`, or the current value if there is none.
 */
export function pastFor(rows: Table, generation: number): Table {
  const applicable = rows.filter(
    (row) => Number(row.generation_id) >= generation,
  );
  if (applicable.length === 0) return [];
  const last = Math.min(...applicable.map((row) => Number(row.generation_id)));
  return applicable.filter((row) => Number(row.generation_id) === last);
}

/** A location's placement in one version. */
export const inVersion = (placement: Placement | undefined, version: string) =>
  typeof placement === "object" ? placement[version] : placement;

/** A location's placement in every version: the latest of them. */
export const inEveryVersion = (placement: Placement | undefined) => {
  if (typeof placement !== "object") return placement;
  const stages = Object.values(placement);
  return stages.every((stage) => typeof stage === "number")
    ? Math.max(...stages)
    : "postgame";
};

export interface BuildContext {
  file: GameFile;
  t: Tables;
  errors: string[];
  versionGroup: Row;
  generation: number;
  /** The version group's place in release order. */
  groupOrder: number;
  groupOrderById: Map<string, number>;
  versions: { id: string; name: string }[];
  versionIds: string[];
  speciesById: Map<string, Row>;
  speciesByIdentifier: Map<string, Row>;
  speciesNames: Map<string, string>;
  /** Each species' default Pokémon id. */
  defaultPokemon: Map<string, string>;
  /** Each Pokémon's species id. */
  pokemonSpecies: Map<string, string>;
  moveRowsById: Map<string, Row>;
  moveIdsByIdentifier: Map<string, string>;
  moveNames: Map<string, string>;
  locationsById: Map<string, Row>;
  locationNames: Map<string, string>;
}

export function buildContext(file: GameFile, t: Tables): BuildContext {
  const errors: string[] = [];
  const versionGroup = t.version_groups.find(
    (vg) => vg.identifier === file.versionGroup,
  );
  if (!versionGroup)
    throw new Error(`unknown version group ${file.versionGroup}`);
  const generation = Number(versionGroup.generation_id);
  if (generation === 1) {
    throw new Error(
      "generation 1 has a single Special stat, which is not supported yet",
    );
  }

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

  return {
    file,
    t,
    errors,
    versionGroup,
    generation,
    groupOrder: Number(versionGroup.order),
    groupOrderById: new Map(
      t.version_groups.map((vg) => [vg.id, Number(vg.order)]),
    ),
    versions,
    versionIds,
    speciesById: indexBy(t.pokemon_species, "id"),
    speciesByIdentifier: indexBy(t.pokemon_species, "identifier"),
    speciesNames: englishNames(t.pokemon_species_names, "pokemon_species_id"),
    defaultPokemon: new Map(
      t.pokemon
        .filter((row) => row.is_default === "1")
        .map((row) => [row.species_id, row.id]),
    ),
    pokemonSpecies: new Map(t.pokemon.map((row) => [row.id, row.species_id])),
    moveRowsById: indexBy(t.moves, "id"),
    moveIdsByIdentifier: new Map(
      t.moves.map((row) => [row.identifier, row.id]),
    ),
    moveNames: englishNames(t.move_names, "move_id"),
    locationsById: indexBy(t.locations, "id"),
    locationNames: englishNames(t.location_names, "location_id"),
  };
}
