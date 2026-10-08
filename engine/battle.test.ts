import { beforeAll, describe, expect, test } from "vitest";

import { loadGame } from "../scripts/games.ts";
import {
  damageFraction,
  effectiveness,
  knownMoves,
  matchup,
  MATCHUP_LIMIT,
  stat,
} from "./battle.ts";
import type { GameData } from "./data.ts";

let game: GameData;
beforeAll(async () => {
  game = await loadGame("firered-leafgreen");
});

describe("battle math", () => {
  test("computes stats with the generation III formula", () => {
    // Pikachu: base HP 35, Speed 90, at level 50 with 15 IVs and no EVs.
    expect(stat(game.species.pikachu, "hp", 50)).toBe(
      Math.floor((70 + 15) / 2) + 60,
    );
    expect(stat(game.species.pikachu, "spe", 50)).toBe(
      Math.floor((180 + 15) / 2) + 5,
    );
  });

  test("multiplies effectiveness across both types", () => {
    const water = game.types.indexOf("water");
    expect(effectiveness(game, water, game.species.geodude)).toBe(4);
    expect(
      effectiveness(game, game.types.indexOf("electric"), game.species.geodude),
    ).toBe(0);
  });

  test("scales damage with effectiveness and same-type bonus", () => {
    const { squirtle, geodude, rattata } = game.species;
    const water = damageFraction(game, "water-gun", squirtle, 20, geodude, 20);
    const neutral = damageFraction(game, "tackle", squirtle, 20, geodude, 20);
    expect(water).toBeGreaterThan(neutral * 4);
    expect(
      damageFraction(game, "tackle", rattata, 20, game.species.gastly, 20),
    ).toBe(0);
  });

  test("scores a mirror match as even", () => {
    const { rattata } = game.species;
    expect(
      matchup(game, rattata, ["tackle"], 10, rattata, ["tackle"], 10).score,
    ).toBeCloseTo(0);
  });

  test("scores a member without damaging moves as the worst matchup", () => {
    const { magikarp, rattata } = game.species;
    expect(matchup(game, magikarp, [], 10, rattata, ["tackle"], 10).score).toBe(
      -MATCHUP_LIMIT,
    );
  });

  test("knows moves learned by earlier forms and HMs obtained by then", () => {
    const moves = knownMoves(game, ["squirtle", "wartortle"], 20, 5);
    expect(moves).toContain("water-gun");
    expect(moves).toContain("surf");
    expect(knownMoves(game, ["squirtle", "wartortle"], 20, 4)).not.toContain(
      "surf",
    );
  });
});
