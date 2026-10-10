import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { sprite, writeGameData, type GameSummary } from "./game-data.ts";
import { spriteUrl } from "./pokeapi.ts";

test("lists playable and planned games in release order, each once", async () => {
  await writeGameData();
  const games = JSON.parse(
    readFileSync("generated/games.json", "utf8"),
  ) as GameSummary[];
  const ids = games.map((g) => g.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.indexOf("crystal")).toBeLessThan(ids.indexOf("emerald"));
  expect(ids.indexOf("heartgold-soulsilver")).toBeLessThan(
    ids.indexOf("black-white"),
  );
  expect(games.find((g) => g.id === "crystal")!.planned).toBe(false);
  expect(games.find((g) => g.id === "black-white")).toMatchObject({
    planned: true,
    starters: [{ name: "Snivy" }, { name: "Tepig" }, { name: "Oshawott" }],
  });
});

test("rejects a sprite set with solid backgrounds", async () => {
  await expect(
    sprite("Chikorita", spriteUrl("generation-ii/crystal", "152")),
  ).rejects.toThrow("solid background");
  await expect(
    sprite("Chikorita", spriteUrl("generation-ii/crystal/transparent", "152")),
  ).resolves.toMatchObject({ width: 56, height: 56 });
});
