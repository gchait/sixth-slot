// Writes public/data/<game>.json for every file in data/games/, and an index of
// those games and the planned ones, in release order.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { parse } from "yaml";

import { plannedSchema } from "../data/schema.ts";
import { gameIds, loadGame, readGameFile } from "./games.ts";
import { englishNames, loadTables, spriteUrl } from "./pokeapi.ts";

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

/**
 * Whether a PNG's top-left pixel is transparent, which tells a sprite with a
 * transparent background from one with a solid one. The first pixel of an image
 * is stored as is, whatever filter its row uses.
 */
export function cornerIsTransparent(png: Buffer): boolean {
  let offset = 8;
  let header: { bitDepth: number; colorType: number } | undefined;
  let transparency: Buffer | undefined;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = { bitDepth: body[8], colorType: body[9] };
    if (type === "tRNS") transparency = body;
    if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG without a header");
  const pixel = inflateSync(Buffer.concat(data)).subarray(1);
  const { bitDepth, colorType } = header;
  switch (colorType) {
    case 3: {
      const index = bitDepth < 8 ? pixel[0] >> (8 - bitDepth) : pixel[0];
      return (transparency?.[index] ?? 255) === 0;
    }
    case 4:
      return (bitDepth === 8 ? pixel[1] : pixel.readUInt16BE(2)) === 0;
    case 6:
      return (bitDepth === 8 ? pixel[3] : pixel.readUInt16BE(6)) === 0;
    default:
      return false;
  }
}

/** Reads a sprite's size, rejecting one drawn on a solid background. */
export async function sprite(name: string, url: string): Promise<Sprite> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const png = Buffer.from(await response.arrayBuffer());
  if (!cornerIsTransparent(png)) {
    throw new Error(
      `${url} has a solid background; use a transparent sprite set`,
    );
  }
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
  const names = englishNames(
    tables.pokemon_species_names,
    "pokemon_species_id",
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
            spriteUrl(game.sprites, row.id),
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
