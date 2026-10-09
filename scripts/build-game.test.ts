import { beforeAll, describe, expect, test } from "vitest";

import type { GameData } from "../engine/data.ts";
import { buildGame } from "./build-game.ts";
import { loadGame, readGameFile } from "./games.ts";
import { loadTables, type Tables } from "./pokeapi.ts";

let tables: Tables;
let game: GameData;

beforeAll(async () => {
  tables = await loadTables();
  game = await loadGame("firered-leafgreen");
});

const type = (name: string) => game.types.indexOf(name);
const stages = (version: string, species: string) =>
  (game.sources[version][species] ?? []).map((s) => s.stage);

describe("FireRed & LeafGreen", () => {
  test("uses the generation III type chart", () => {
    expect(game.types).toHaveLength(17);
    expect(game.types).not.toContain("fairy");
    expect(game.typeChart[type("ghost")][type("steel")]).toBe(0.5);
    expect(game.typeChart[type("dark")][type("steel")]).toBe(0.5);
    expect(game.typeChart[type("normal")][type("ghost")]).toBe(0);
  });

  test("splits physical and special by type", () => {
    expect(game.moves["shadow-ball"].physical).toBe(true);
    expect(game.moves.bite.physical).toBe(false);
  });

  test("uses typings and base stats from before later changes", () => {
    expect(game.species.clefairy.types).toEqual([type("normal")]);
    expect(game.species.magnemite.types).toEqual([
      type("electric"),
      type("steel"),
    ]);
    expect(game.species.butterfree.stats.spa).toBe(80);
    expect(game.species.pikachu.stats.def).toBe(30);
  });

  test("uses move power and type from before later changes", () => {
    expect(game.moves.tackle).toMatchObject({
      power: 35,
      type: type("normal"),
    });
    expect(game.moves.bite.type).toBe(type("dark"));
    expect(game.moves.flamethrower.power).toBe(95);
  });

  test("discounts moves with drawbacks", () => {
    expect(game.moves.explosion).toBeUndefined();
    expect(game.moves["hyper-beam"].power).toBe(75);
  });

  test("keeps version exclusives apart", () => {
    expect(stages("firered", "growlithe")).not.toHaveLength(0);
    expect(stages("leafgreen", "growlithe")).toHaveLength(0);
    expect(stages("leafgreen", "vulpix")).not.toHaveLength(0);
    expect(stages("firered", "vulpix")).toHaveLength(0);
  });

  test("places sources at their stage and leaves out the post-game", () => {
    expect(Math.min(...stages("firered", "pikachu"))).toBe(0);
    expect(Math.min(...stages("firered", "gastly"))).toBe(4);
    expect(Math.min(...stages("firered", "lapras"))).toBe(5);
    expect(stages("firered", "mewtwo")).toHaveLength(0);
  });

  test("records what in-game trades cost", () => {
    expect(game.sources.firered["mr-mime"]).toEqual([
      expect.objectContaining({ stage: 3, gives: "abra" }),
    ]);
    expect(game.sources.firered.lickitung[0].gives).toBe("golduck");
    expect(game.sources.leafgreen.lickitung[0].gives).toBe("slowbro");
  });

  test("evolves by level, stone and trade", () => {
    const method = (to: string) =>
      game.evolutions.find((e) => e.to === to)?.method;
    expect(method("charmeleon")).toEqual({ kind: "level", level: 16 });
    expect(method("raichu")).toEqual({
      kind: "item",
      item: "thunder-stone",
      stage: 3,
    });
    expect(method("alakazam")).toEqual({ kind: "trade", stage: 0 });
    expect(method("crobat")).toBeUndefined();
  });

  test("gives each battle its party, by starter where the rival's changes", () => {
    expect(game.battles.filter((b) => !b.rematch).map((b) => b.id)).toEqual([
      "brock",
      "misty",
      "lt-surge",
      "erika",
      "koga",
      "sabrina",
      "blaine",
      "giovanni",
      "lorelei",
      "bruno",
      "agatha",
      "lance",
      "champion",
    ]);
    const champion = game.battles.find((b) => b.id === "champion")!;
    expect(Object.keys(champion.parties).sort()).toEqual([
      "bulbasaur",
      "charmander",
      "squirtle",
    ]);
    expect(champion.parties.bulbasaur.at(-1)!.species).toBe("charizard");
    expect(champion.aceLevel).toBe(63);
  });
});

describe("game file checks", () => {
  test("rejects a location PokeAPI does not have", () => {
    const file = readGameFile("firered-leafgreen");
    file.locations["no-such-place"] = 0;
    expect(() => buildGame(file, tables)).toThrow(
      "unknown location no-such-place",
    );
  });

  test("rejects encounters at a location without a stage", () => {
    const file = readGameFile("firered-leafgreen");
    delete file.locations["viridian-forest"];
    expect(() => buildGame(file, tables)).toThrow(
      "viridian-forest has encounters but no stage",
    );
  });

  test("rejects an in-game trade that is not listed", () => {
    const file = readGameFile("firered-leafgreen");
    delete file.trades.jynx;
    expect(() => buildGame(file, tables)).toThrow(
      "jynx is traded in firered but not listed",
    );
  });

  test("rejects a story battle after a rematch", () => {
    const file = readGameFile("firered-leafgreen");
    file.battles.push({ ...file.battles[0], id: "late-brock", rematch: false });
    expect(() => buildGame(file, tables)).toThrow(
      "rematches must come after every story battle",
    );
  });

  test("rejects an evolution item without a stage", () => {
    const file = readGameFile("firered-leafgreen");
    delete file.items["moon-stone"];
    expect(() => buildGame(file, tables)).toThrow(
      "needs moon-stone, which items does not list",
    );
  });
});

describe("Emerald", () => {
  let emerald: GameData;
  beforeAll(async () => {
    emerald = await loadGame("emerald");
  });
  const firstStage = (species: string) =>
    Math.min(...(emerald.sources.emerald[species] ?? []).map((s) => s.stage));
  const method = (to: string) =>
    emerald.evolutions.find((e) => e.to === to)?.method;

  test("evolves by friendship, beauty, shedding and trading with an item", () => {
    expect(method("crobat")).toEqual({ kind: "friendship" });
    expect(method("milotic")).toEqual({ kind: "beauty", stage: 6 });
    expect(method("shedinja")).toEqual({ kind: "level", level: 20 });
    expect(method("huntail")).toEqual({
      kind: "trade",
      item: "deep-sea-tooth",
      stage: 7,
    });
  });

  test("marks evolutions that happen at random", () => {
    expect(method("silcoon")).toEqual({
      kind: "level",
      level: 7,
      random: true,
    });
    expect(method("cascoon")).toEqual({
      kind: "level",
      level: 7,
      random: true,
    });
    expect(method("ninjask")).toEqual({ kind: "level", level: 20 });
  });

  test("narrows a location's stage to one encounter method", () => {
    // Route 111's wild Pokémon live in the desert, which needs the Go-Goggles.
    expect(firstStage("trapinch")).toBe(4);
    expect(
      emerald.sources.emerald.geodude.some(
        (s) => s.location === "Route 111" && s.stage === 3,
      ),
    ).toBe(true);
  });

  test("leaves out Mirage Island, which appears only on rare days", () => {
    expect(emerald.sources.emerald.wynaut.map((s) => s.method)).toEqual([
      "Receive egg as a gift",
    ]);
  });

  test("keeps only regular abilities as they were in generation III", () => {
    expect(emerald.species.slaking.abilities).toEqual(["truant"]);
    expect(game.species.gengar.abilities).toEqual(["levitate"]);
    expect(game.species.koffing.abilities).toEqual(["levitate"]);
  });
});
