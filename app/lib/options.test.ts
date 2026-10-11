import { beforeAll, describe, expect, test } from "vitest";

import type { GameData } from "../../engine/data.ts";
import { fireRed as options } from "../../engine/test-options.ts";
import { loadGame } from "../../scripts/games.ts";
import { setTradeEvolutions } from "./options.ts";

let game: GameData;
beforeAll(async () => {
  game = await loadGame("firered-leafgreen");
});

describe("setTradeEvolutions", () => {
  test("moves pinned and excluded Pokémon to their line's new final form", () => {
    const on = setTradeEvolutions(
      game,
      options({ pinned: ["kadabra"], banned: ["graveler"] }),
      true,
    );
    expect(on).toMatchObject({ pinned: ["alakazam"], banned: ["golem"] });
    expect(setTradeEvolutions(game, on, false)).toMatchObject({
      pinned: ["kadabra"],
      banned: ["graveler"],
    });
  });

  test("keeps Pokémon trade evolutions do not affect", () => {
    expect(
      setTradeEvolutions(
        game,
        options({ pinned: ["pidgeot"], banned: ["mewtwo"] }),
        true,
      ),
    ).toMatchObject({ pinned: ["pidgeot"], banned: ["mewtwo"] });
  });

  test("drops a pin whose line splits, and excludes every branch", async () => {
    const emerald = await loadGame("emerald");
    const clamperl = options({
      version: "emerald",
      starter: "treecko",
      pinned: ["clamperl"],
    });
    expect(setTradeEvolutions(emerald, clamperl, true).pinned).toEqual([]);
    expect(
      setTradeEvolutions(
        emerald,
        { ...clamperl, pinned: [], banned: ["clamperl"] },
        true,
      ).banned.sort(),
    ).toEqual(["gorebyss", "huntail"]);
  });
});
