import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { sprite, writeGameData, type GameSummary } from "./game-data.ts";
import { SPRITES_COMMIT } from "./pokeapi.ts";

test("lists playable and planned games in release order, each once", async () => {
  await writeGameData();
  const games = JSON.parse(
    readFileSync("public/data/games.json", "utf8"),
  ) as GameSummary[];
  const ids = games.map((g) => g.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.indexOf("crystal")).toBeLessThan(ids.indexOf("emerald"));
  expect(ids.indexOf("firered-leafgreen")).toBeLessThan(
    ids.indexOf("platinum"),
  );
  expect(games.find((g) => g.id === "emerald")!.planned).toBe(false);
  expect(games.find((g) => g.id === "crystal")).toMatchObject({
    planned: true,
    starters: [
      { name: "Chikorita" },
      { name: "Cyndaquil" },
      { name: "Totodile" },
    ],
  });
});

test("rejects a sprite set with solid backgrounds", async () => {
  const versions = `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@${SPRITES_COMMIT}/sprites/pokemon/versions`;
  await expect(
    sprite("Chikorita", `${versions}/generation-ii/crystal/152.png`),
  ).rejects.toThrow("solid background");
  await expect(
    sprite(
      "Chikorita",
      `${versions}/generation-ii/crystal/transparent/152.png`,
    ),
  ).resolves.toMatchObject({ width: 56, height: 56 });
});
