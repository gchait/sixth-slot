// Reads PokeAPI's CSV data and sprites at pinned commits, downloading each file
// once into .cache/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./csv.ts";

export const POKEAPI_COMMIT = "2fe95532d27a9bf340575253aff50868319d8182";

/** A sprite's URL, from the pinned commit of PokeAPI's sprite repository. */
export function spriteUrl(folder: string, national: string): string {
  return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@${SPRITES_COMMIT}/sprites/pokemon/versions/${folder}/${national}.png`;
}

const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));

/**
 * The file at a URL that pins a commit, so its content never changes: fetched
 * once into .cache/<host>/<path>, and read from there afterwards.
 */
export async function pinnedFile(url: string): Promise<Buffer> {
  const { host, pathname } = new URL(url);
  const path = `${cacheDir}${host}${decodeURIComponent(pathname)}`;
  if (!existsSync(path)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  return readFileSync(path);
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

export type Table = Record<string, string>[];

export async function loadTable(name: string): Promise<Table> {
  const csv = await pinnedFile(
    `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_COMMIT}/data/v2/csv/${name}.csv`,
  );
  return parseCsv(csv.toString("utf8"));
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
  "move_meta",
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
