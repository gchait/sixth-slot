// Reads PokeAPI's CSV data at a pinned commit, downloading each table once
// into .cache/pokeapi/<commit>/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./csv.ts";

export const POKEAPI_COMMIT = "2fe95532d27a9bf340575253aff50868319d8182";

/** A sprite's URL, from the pinned commit of PokeAPI's sprite repository. */
export function spriteUrl(folder: string, national: string): string {
  return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@${SPRITES_COMMIT}/sprites/pokemon/versions/${folder}/${national}.png`;
}

/** Fetches a URL, failing on any HTTP error. */
export async function download(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** Each row's identifier by its id, for PokeAPI's lookup tables. */
export function identifierById(table: Table): Map<string, string> {
  return new Map(table.map((row) => [row.id, row.identifier]));
}

/** English names from one of PokeAPI's name tables, by the id in `idKey`. */
export function englishNames(table: Table, idKey: string): Map<string, string> {
  return new Map(
    table
      .filter((row) => row.local_language_id === "9")
      .map((row) => [row[idKey], row.name]),
  );
}

/** The commit of PokeAPI's sprite repository the site loads images from. */
export const SPRITES_COMMIT = "35fdbe9bdec8f519f882c3edc3c0185f08af4d86";

const cacheDir = fileURLToPath(
  new URL(`../.cache/pokeapi/${POKEAPI_COMMIT}/`, import.meta.url),
);

export type Table = Record<string, string>[];

export async function loadTable(name: string): Promise<Table> {
  const path = `${cacheDir}${name}.csv`;
  if (!existsSync(path)) {
    const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_COMMIT}/data/v2/csv/${name}.csv`;
    const response = await download(url);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path, await response.text());
  }
  return parseCsv(readFileSync(path, "utf8"));
}

export const tableNames = [
  "abilities",
  "encounter_condition_value_map",
  "encounter_condition_values",
  "encounter_method_prose",
  "encounter_methods",
  "encounter_slots",
  "encounters",
  "evolution_triggers",
  "item_names",
  "items",
  "location_area_prose",
  "location_areas",
  "location_names",
  "locations",
  "move_changelog",
  "move_names",
  "moves",
  "pokedexes",
  "pokemon",
  "pokemon_abilities",
  "pokemon_abilities_past",
  "pokemon_dex_numbers",
  "pokemon_evolution",
  "pokemon_move_methods",
  "pokemon_moves",
  "pokemon_species",
  "pokemon_species_names",
  "pokemon_stats",
  "pokemon_stats_past",
  "pokemon_types",
  "pokemon_types_past",
  "stats",
  "type_efficacy",
  "type_efficacy_past",
  "types",
  "version_groups",
  "versions",
  "version_names",
] as const;

export type Tables = Record<(typeof tableNames)[number], Table>;

export async function loadTables(): Promise<Tables> {
  const entries = await Promise.all(
    tableNames.map(async (name) => [name, await loadTable(name)] as const),
  );
  return Object.fromEntries(entries) as Tables;
}
