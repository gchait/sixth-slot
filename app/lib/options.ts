import { defaultOptions, type Options } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";

const switchKeys = [
  "uniqueTypes",
  "allowLegendaries",
  "allowTradeEvolutions",
  "includePostgame",
  "carryFieldMoves",
] as const;

type Switch = (typeof switchKeys)[number];

/** URL parameter names of the on-off options. */
const switches: Record<Switch, string> = {
  uniqueTypes: "unique",
  allowLegendaries: "legendaries",
  allowTradeEvolutions: "trades",
  includePostgame: "postgame",
  carryFieldMoves: "field",
};

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

/** Reads options from the page URL, falling back to defaults for anything missing or invalid. */
export function readOptions(params: URLSearchParams, game: GameData): Options {
  const version = params.get("version");
  const starter = params.get("starter");
  const on = (key: Switch) => {
    const value = params.get(switches[key]);
    return value === null ? defaultOptions[key] : value === "1";
  };
  return {
    version: game.versions.some((v) => v.id === version)
      ? version!
      : game.versions[0].id,
    starter:
      starter && game.starters.includes(starter) ? starter : game.starters[0],
    uniqueTypes: on("uniqueTypes"),
    allowLegendaries: on("allowLegendaries"),
    allowTradeEvolutions: on("allowTradeEvolutions"),
    includePostgame: on("includePostgame"),
    carryFieldMoves: on("carryFieldMoves"),
    pinned: list(params.get("pin")).filter((id) => id in game.species),
    banned: list(params.get("ban")).filter((id) => id in game.species),
  };
}

/** Writes options to URL parameters, leaving out defaults so links stay short. */
export function writeOptions(
  options: Options,
  game: GameData,
): URLSearchParams {
  const params = new URLSearchParams();
  if (options.version !== game.versions[0].id)
    params.set("version", options.version);
  if (options.starter !== game.starters[0])
    params.set("starter", options.starter);
  for (const key of switchKeys) {
    if (options[key] !== defaultOptions[key])
      params.set(switches[key], options[key] ? "1" : "0");
  }
  if (options.pinned.length > 0) params.set("pin", options.pinned.join(","));
  if (options.banned.length > 0) params.set("ban", options.banned.join(","));
  return params;
}
