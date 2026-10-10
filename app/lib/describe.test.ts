import { beforeAll, describe, expect, test } from "vitest";

import type { GameData } from "../../engine/data.ts";
import { fireRed as options } from "../../engine/test-options.ts";
import { loadGame } from "../../scripts/games.ts";
import { describeSource, stageName } from "./describe.ts";

let hgss: GameData;
beforeAll(async () => {
  hgss = await loadGame("heartgold-soulsilver");
});
const heartGold = () => options({ version: "heartgold", starter: "cyndaquil" });

describe("stageName", () => {
  test("names a stage by the battle it leads to", () => {
    expect(stageName(hgss, heartGold(), 5)).toBe("Before Jasmine");
  });

  test("adds the title for an opponent met before, as in a rematch", () => {
    expect(stageName(hgss, heartGold(), 32)).toBe(
      "Before Jasmine (Gym Leader rematch)",
    );
  });
});

describe("describeSource", () => {
  test("keeps the item names in an encounter method", () => {
    const source = hgss.sources.heartgold.magikarp.find(
      (s) => s.method === "Fishing with a Good Rod",
    )!;
    expect(describeSource(hgss, { ...source, species: "magikarp" })).toContain(
      "· fishing with a Good Rod ·",
    );
  });

  test("describes a trade that takes any Pokémon", () => {
    const trade = hgss.sources.heartgold.steelix.find((s) => "givesAny" in s)!;
    expect(describeSource(hgss, { ...trade, species: "steelix" })).toBe(
      "Steelix · Olivine City Gym · trade any Pokémon",
    );
  });
});
