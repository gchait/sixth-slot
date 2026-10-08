// Builds public/data/<game>.json for every file in data/games/, and an index.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { gameIds, loadGame } from "./games.ts";

const outDir = join(import.meta.dirname, "..", "public", "data");
mkdirSync(outDir, { recursive: true });

const index = [];
for (const id of gameIds()) {
  const game = await loadGame(id);
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(game));
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
  console.log(
    `${id}: ${Object.keys(game.species).length} species, ${game.battles.length} battles`,
  );
}
writeFileSync(join(outDir, "games.json"), JSON.stringify(index));
