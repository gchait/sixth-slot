import { beforeAll, describe, expect, test } from "vitest";

import { loadGame } from "../scripts/games.ts";
import { buildCandidates, defaultOptions, type Options } from "./candidates.ts";
import type { GameData } from "./data.ts";

let game: GameData;
let emerald: GameData;
beforeAll(async () => {
  game = await loadGame("firered-leafgreen");
  emerald = await loadGame("emerald");
});

const options = (overrides: Partial<Options> = {}): Options => ({
  ...defaultOptions,
  version: "firered",
  starter: "charmander",
  ...overrides,
});
const find = (o: Options, id: string) =>
  buildCandidates(game, o).find((c) => c.id === id);
const formsAt = (o: Options, id: string) => {
  const c = find(o, id)!;
  return c.forms.map((f) => (f < 0 ? null : c.line[f]));
};

describe("buildCandidates", () => {
  test("evolves the starter as levels allow by each battle", () => {
    expect(formsAt(options(), "charizard").slice(0, 5)).toEqual([
      "charmander",
      "charmeleon",
      "charmeleon",
      "charmeleon",
      "charizard",
    ]);
  });

  test("leaves out the other starters", () => {
    const ids = buildCandidates(game, options()).map((c) => c.id);
    expect(ids).toContain("charizard");
    expect(ids).not.toContain("venusaur");
    expect(ids).not.toContain("blastoise");
  });

  test("stops at the last form evolution allows", () => {
    expect(find(options(), "kadabra")).toBeDefined();
    expect(find(options(), "alakazam")).toBeUndefined();
    const trading = options({ allowTradeEvolutions: true });
    expect(find(trading, "kadabra")).toBeUndefined();
    expect(find(trading, "alakazam")).toBeDefined();
  });

  test("offers each stone evolution of Eevee once stones are sold", () => {
    for (const id of ["vaporeon", "jolteon", "flareon"]) {
      expect(find(options(), id)).toMatchObject({ family: "eevee", joins: 3 });
    }
  });

  test("opens an in-game trade once the species it asks for can be held", () => {
    expect(find(options(), "mr-mime")!.joins).toBe(3);
    // Poliwhirl, which the Jynx trade asks for, first comes from the Super Rod.
    expect(find(options(), "jynx")!.joins).toBe(4);
  });

  test("leaves out legendaries unless allowed", () => {
    expect(find(options(), "zapdos")).toBeUndefined();
    expect(find(options({ allowLegendaries: true }), "zapdos")).toMatchObject({
      joins: 7,
    });
  });

  test("follows the version", () => {
    expect(find(options({ version: "firered" }), "arcanine")).toBeDefined();
    expect(find(options({ version: "leafgreen" }), "arcanine")).toBeUndefined();
  });

  test("evolves by friendship one battle after the Pokémon is held", () => {
    const o = options({ version: "emerald", starter: "mudkip" });
    const crobat = buildCandidates(emerald, o).find((c) => c.id === "crobat")!;
    const golbat = crobat.forms.indexOf(1);
    expect(golbat).toBeGreaterThanOrEqual(0);
    expect(crobat.forms[golbat]).toBe(1);
    expect(crobat.forms.indexOf(2)).toBe(golbat + 1);
  });
});
