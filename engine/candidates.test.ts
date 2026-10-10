import { beforeAll, describe, expect, test } from "vitest";

import { loadGame } from "../scripts/games.ts";
import { buildCandidates, type Options } from "./candidates.ts";
import type { Evolution, GameData } from "./data.ts";
import { fireRed as options } from "./test-options.ts";

let game: GameData;
let emerald: GameData;
beforeAll(async () => {
  game = await loadGame("firered-leafgreen");
  emerald = await loadGame("emerald");
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

describe("field moves", () => {
  test("count only for lines that can use them from when they work", () => {
    const carried = (id: string) => find(options(), id)!.fieldMoves;
    expect(carried("charizard")).toEqual(["fly"]);
    expect(carried("lapras")).toEqual(["surf"]);
    // Aerodactyl is revived only after Fly works, and Dragonair learns
    // Surf but cannot learn Fly until it evolves.
    expect(carried("aerodactyl")).toEqual([]);
    expect(carried("dragonite")).toEqual(["surf"]);
  });
});

describe("random evolutions", () => {
  test("count only when the base can be caught again until it goes the wanted way", async () => {
    const crystal = await loadGame("crystal");
    const ids = (g: GameData, version: string, starter: string) =>
      buildCandidates(g, options({ version, starter })).map((c) => c.id);
    // Crystal's one Tyrogue, a gift, evolves by its stats.
    expect(ids(crystal, "crystal", "totodile")).not.toContain("hitmonlee");
    expect(ids(emerald, "emerald", "mudkip")).toContain("dustox");
  });
});

describe("evolution requirements", () => {
  const withRequirement = (
    to: string,
    requires: Evolution["requires"],
  ): GameData => ({
    ...game,
    evolutions: game.evolutions.map((e) =>
      e.to === to ? { ...e, requires } : e,
    ),
  });
  const raichuJoins = (g: GameData) =>
    buildCandidates(g, options())
      .find((c) => c.id === "raichu")!
      .forms.indexOf(1);

  test("wait for another species to be held", () => {
    // Lapras is a gift before Sabrina, the sixth battle.
    expect(raichuJoins(withRequirement("raichu", { species: "lapras" }))).toBe(
      5,
    );
  });

  test("wait for a party member of a type", () => {
    // Ghosts can first be caught before Koga, the fifth battle.
    const ghost = game.types.indexOf("ghost");
    expect(raichuJoins(withRequirement("raichu", { partyType: ghost }))).toBe(
      4,
    );
  });
});
