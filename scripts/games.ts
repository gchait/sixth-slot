// Loads and validates the curated game files in data/games/ and the planned
// games in data/planned.yaml.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import {
  gameSchema,
  plannedSchema,
  type GameFile,
  type PlannedGame,
} from "../data/schema.ts";
import type { GameData } from "../engine/data.ts";
import { buildGame } from "./build-game.ts";
import { loadTables, type Tables } from "./pokeapi.ts";

const gamesDir = fileURLToPath(new URL("../data/games/", import.meta.url));
const plannedFile = fileURLToPath(
  new URL("../data/planned.yaml", import.meta.url),
);

export function readPlannedGames(): PlannedGame[] {
  return plannedSchema.parse(parse(readFileSync(plannedFile, "utf8")));
}

export function gameIds(): string[] {
  return readdirSync(gamesDir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.slice(0, -".yaml".length))
    .sort();
}

export function readGameFile(id: string): GameFile {
  const result = gameSchema.safeParse(
    parse(readFileSync(`${gamesDir}${id}.yaml`, "utf8")),
  );
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(`data/games/${id}.yaml:\n${issues.join("\n")}`);
  }
  return { id, ...result.data };
}

let tables: Promise<Tables> | undefined;

/** PokeAPI's tables, loaded once per process. */
export function gameTables(): Promise<Tables> {
  tables ??= loadTables();
  return tables;
}

export async function loadGame(id: string): Promise<GameData> {
  return buildGame(readGameFile(id), await gameTables());
}
