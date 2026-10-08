import { defaultOptions, type Options } from "../../engine/candidates.ts";
import type { GameData } from "../../engine/data.ts";

const list = (value: string | null) =>
  value ? value.split(",").filter(Boolean) : [];

/** Reads options from the page URL, falling back to defaults for anything missing or invalid. */
export function readOptions(params: URLSearchParams, game: GameData): Options {
  const version = params.get("version");
  const starter = params.get("starter");
  return {
    version: game.versions.some((v) => v.id === version)
      ? version!
      : game.versions[0].id,
    starter:
      starter && game.starters.includes(starter) ? starter : game.starters[0],
    uniqueTypes: params.get("unique") !== "0",
    allowLegendaries: params.get("legendaries") === "1",
    allowTradeEvolutions: params.get("trades") === "1",
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
  if (options.uniqueTypes !== defaultOptions.uniqueTypes)
    params.set("unique", "0");
  if (options.allowLegendaries) params.set("legendaries", "1");
  if (options.allowTradeEvolutions) params.set("trades", "1");
  if (options.pinned.length > 0) params.set("pin", options.pinned.join(","));
  if (options.banned.length > 0) params.set("ban", options.banned.join(","));
  return params;
}
