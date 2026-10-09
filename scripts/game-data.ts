// Writes public/data/<game>.json for every file in data/games/, and an index of
// those games and the planned ones, in release order.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { plannedSchema } from "../data/schema.ts";
import { gameIds, loadGame, readGameFile } from "./games.ts";
import { loadTables, SPRITES_COMMIT } from "./pokeapi.ts";

const outDir = fileURLToPath(new URL("../public/data/", import.meta.url));
const plannedFile = fileURLToPath(
  new URL("../data/planned.yaml", import.meta.url),
);

export interface Sprite {
  name: string;
  url: string;
  /** The image's size in pixels; sprite sets of different games differ. */
  width: number;
  height: number;
}

/** Reads a PNG sprite's size from its header. */
async function sprite(name: string, url: string): Promise<Sprite> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const png = Buffer.from(await response.arrayBuffer());
  return {
    name,
    url,
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

export interface GameSummary {
  id: string;
  name: string;
  versions: string[];
  starters: Sprite[];
  /** Listed but not playable yet. */
  planned: boolean;
}

export async function writeGameData(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const tables = await loadTables();
  const order = new Map(
    tables.version_groups.map((vg) => [vg.identifier, Number(vg.order)]),
  );
  const species = new Map(tables.pokemon_species.map((s) => [s.identifier, s]));
  const names = new Map(
    tables.pokemon_species_names
      .filter((row) => row.local_language_id === "9")
      .map((row) => [row.pokemon_species_id, row.name]),
  );
  const summaries: GameSummary[] = [];
  const releaseOrder = new Map<string, number>();

  for (const id of gameIds()) {
    const game = await loadGame(id);
    writeFileSync(`${outDir}${id}.json`, JSON.stringify(game));
    summaries.push({
      id,
      name: game.name,
      versions: game.versions.map((v) => v.name),
      starters: await Promise.all(
        game.starters.map((s) =>
          sprite(
            game.species[s].name,
            game.sprite.replace("{national}", String(game.species[s].national)),
          ),
        ),
      ),
      planned: false,
    });
    releaseOrder.set(id, order.get(readGameFile(id).versionGroup)!);
  }

  const planned = plannedSchema.parse(parse(readFileSync(plannedFile, "utf8")));
  const playable = new Set(
    gameIds().map((id) => readGameFile(id).versionGroup),
  );
  for (const game of planned) {
    if (!order.has(game.versionGroup))
      throw new Error(
        `data/planned.yaml: unknown version group ${game.versionGroup}`,
      );
    if (playable.has(game.versionGroup))
      throw new Error(
        `data/planned.yaml: ${game.name} is already in data/games/`,
      );
    summaries.push({
      id: game.versionGroup,
      name: game.name,
      versions: [],
      starters: await Promise.all(
        game.starters.map((s) => {
          const row = species.get(s);
          if (!row) throw new Error(`data/planned.yaml: unknown species ${s}`);
          return sprite(
            names.get(row.id) ?? s,
            `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@${SPRITES_COMMIT}/sprites/pokemon/versions/${game.sprites}/${row.id}.png`,
          );
        }),
      ),
      planned: true,
    });
    releaseOrder.set(game.versionGroup, order.get(game.versionGroup)!);
  }

  summaries.sort((a, b) => releaseOrder.get(a.id)! - releaseOrder.get(b.id)!);
  writeFileSync(`${outDir}games.json`, JSON.stringify(summaries));
}
