// Writes public/data/<game>.json for every file in data/games/, and an index.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { gameIds, loadGame } from "./games.ts";

const outDir = fileURLToPath(new URL("../public/data/", import.meta.url));

export async function writeGameData(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const index = [];
  for (const id of gameIds()) {
    const game = await loadGame(id);
    writeFileSync(`${outDir}${id}.json`, JSON.stringify(game));
    index.push({
      id,
      name: game.name,
      versions: game.versions.map((v) => v.name),
      starters: game.starters.map((s) => ({
        name: game.species[s].name,
        sprite: game.sprite.replace(
          "{national}",
          String(game.species[s].national),
        ),
      })),
    });
  }
  writeFileSync(`${outDir}games.json`, JSON.stringify(index));
}
