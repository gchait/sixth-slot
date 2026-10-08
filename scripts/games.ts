// Loads and validates the curated game files in data/games/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";

import { gameSchema, type GameFile } from "../data/schema.ts";
import type { GameData } from "../engine/data.ts";
import { buildGame } from "./build-game.ts";
import { loadTables, type Tables } from "./pokeapi.ts";

const gamesDir = join(import.meta.dirname, "..", "data", "games");

export function gameIds(): string[] {
  return readdirSync(gamesDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.slice(0, -".yaml".length))
    .sort();
}

export function readGameFile(id: string): GameFile {
  const result = gameSchema.safeParse(
    parse(readFileSync(join(gamesDir, `${id}.yaml`), "utf8")),
  );
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`data/games/${id}.yaml:\n${issues.join("\n")}`);
  }
  return result.data;
}

let tables: Promise<Tables> | undefined;

export async function loadGame(id: string): Promise<GameData> {
  tables ??= loadTables();
  return buildGame(readGameFile(id), await tables);
}
