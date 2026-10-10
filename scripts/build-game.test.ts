import { beforeAll, describe, expect, test } from "vitest";

import { gameSchema } from "../data/schema.ts";
import { met, type GameData } from "../engine/data.ts";
import { buildGame, isPhysical } from "./build-game.ts";
import { loadGame, readGameFile, readPlannedGames } from "./games.ts";
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
    expect(game.moves["hyper-beam"]).toMatchObject({
      power: 150,
      factor: 0.45,
    });
  });

  test("counts moves by their accuracy and strikes", () => {
    expect(game.moves.thunder.factor).toBeCloseTo(0.7);
    expect(game.moves["double-kick"].factor).toBe(2);
    expect(game.moves["fury-attack"].factor).toBeCloseTo(3 * 0.85);
  });

  test("gives fixed-damage moves their damage", () => {
    expect(game.moves["seismic-toss"]).toMatchObject({ fixed: "level" });
    expect(game.moves["sonic-boom"]).toMatchObject({ fixed: 20, factor: 0.9 });
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

  test("reads what in-game trades cost from PokeAPI", () => {
    expect(game.sources.firered["mr-mime"]).toEqual([
      expect.objectContaining({ stage: 1, gives: "abra" }),
    ]);
    expect(game.sources.firered.lickitung[0]).toMatchObject({
      gives: "golduck",
    });
    expect(game.sources.leafgreen.lickitung[0]).toMatchObject({
      gives: "slowbro",
    });
  });

  test("evolves by level, stone and trade", () => {
    const evolution = (to: string) => game.evolutions.find((e) => e.to === to);
    expect(evolution("charmeleon")).toMatchObject({
      label: "Lv 16",
      requires: { level: 16 },
    });
    expect(evolution("raichu")).toMatchObject({
      label: "Thunder Stone",
      requires: { stage: 2 },
    });
    expect(evolution("alakazam")).toMatchObject({
      label: "trade",
      requires: { trade: true },
    });
    expect(evolution("crobat")).toBeUndefined();
  });

  test("does not mistake evolutions by different items for random ones", () => {
    for (const to of ["vaporeon", "jolteon", "flareon"]) {
      expect(
        game.evolutions.find((e) => e.to === to)!.requires.random,
      ).toBeUndefined();
    }
  });

  test("gives each battle its party, by starter where the rival's changes", () => {
    expect(game.battles.filter((b) => !b.postgame).map((b) => b.id)).toEqual([
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
    const rival = met(champion, { version: "firered", starter: "bulbasaur" });
    expect(rival.name).toBe("Blue");
    expect(rival.party.at(-1)!.species).toBe("charizard");
    expect(champion.level).toBe(63);
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

  test("rejects an encounter condition without a stage", () => {
    const file = readGameFile("firered-leafgreen");
    delete file.encounterConditions["coins-180"];
    expect(() => buildGame(file, tables)).toThrow(
      "coins-180 applies to an encounter but has no stage",
    );
  });

  test("rejects a story battle after a post-game battle", () => {
    const file = readGameFile("firered-leafgreen");
    file.battles.push({
      ...file.battles[0],
      id: "late-brock",
      postgame: false,
    });
    expect(() => buildGame(file, tables)).toThrow(
      "post-game battles must come after every story battle",
    );
  });

  test("rejects a field move that works before its HM is obtained", () => {
    const file = readGameFile("firered-leafgreen");
    file.fieldMoves.fly = 3;
    expect(() => buildGame(file, tables)).toThrow(
      "fieldMoves.fly: works before hms.fly is obtained",
    );
  });

  test("rejects an evolution item without a stage", () => {
    const file = readGameFile("firered-leafgreen");
    delete file.items["moon-stone"];
    expect(() => buildGame(file, tables)).toThrow(
      "needs items.moon-stone, which has no story stage",
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
  const evolution = (to: string) => emerald.evolutions.find((e) => e.to === to);

  test("evolves by friendship, beauty, shedding and trading with an item", () => {
    expect(evolution("crobat")).toEqual({
      from: "golbat",
      to: "crobat",
      label: "friendship",
      requires: { friendship: true },
    });
    expect(evolution("milotic")).toMatchObject({
      label: "beauty",
      requires: { stage: 6 },
    });
    expect(evolution("shedinja")).toMatchObject({
      label: "Lv 20, alongside Ninjask",
      requires: { level: 20 },
    });
    expect(evolution("huntail")).toMatchObject({
      label: "trade, holding Deep Sea Tooth",
      requires: { trade: true, stage: 7 },
    });
  });

  test("marks evolutions that happen at random", () => {
    for (const to of ["silcoon", "cascoon"]) {
      expect(evolution(to)).toMatchObject({
        label: "Lv 7, at random",
        requires: { level: 7, random: true },
      });
    }
    expect(evolution("ninjask")!.requires.random).toBeUndefined();
  });

  test("keeps the player's level from dropping at lower-level rematches", () => {
    const level = (id: string) =>
      emerald.battles.find((b) => b.id === id)!.level;
    expect(level("wallace")).toBe(58);
    expect(level("roxanne-rematch")).toBe(58);
  });

  test("lists field moves by when they work outside battle", () => {
    expect(emerald.fieldMoves).toEqual([
      { id: "surf", name: "Surf", stage: 5 },
      { id: "fly", name: "Fly", stage: 6 },
    ]);
    expect(emerald.species.swellow.fieldMoves).toEqual({ fly: 1 });
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

describe("Crystal", () => {
  let crystal: GameData;
  beforeAll(async () => {
    crystal = await loadGame("crystal");
  });
  const stagesOf = (species: string) =>
    (crystal.sources.crystal[species] ?? []).map((s) => s.stage);

  test("has no abilities, which generation III introduced", () => {
    expect(
      Object.values(crystal.species).filter((s) => s.abilities.length > 0),
    ).toEqual([]);
  });

  test("waits for Surf to reach Union Cave's Friday Lapras", () => {
    expect(Math.min(...stagesOf("lapras"))).toBe(4);
  });

  test("leaves out the Odd Egg, which hatches at random", () => {
    expect(stagesOf("elekid")).toEqual([]);
    expect(stagesOf("tyrogue")).toEqual([8]);
  });

  test("scores Kanto's Gym Leaders and Red as post-game battles after Lance", () => {
    const postgame = crystal.battles.filter((b) => b.postgame);
    expect(postgame.map((b) => b.id)).toEqual([
      "lt-surge",
      "sabrina",
      "misty",
      "erika",
      "janine",
      "brock",
      "blaine",
      "blue",
      "red",
    ]);
    expect(crystal.battles.at(-postgame.length - 1)!.id).toBe("lance");
  });
});

describe("Platinum", () => {
  let platinum: GameData;
  beforeAll(async () => {
    platinum = await loadGame("platinum");
  });
  const stagesOf = (species: string) =>
    (platinum.sources.platinum[species] ?? []).map((s) => s.stage);

  test("splits physical and special by move from generation IV", () => {
    expect(platinum.moves["shadow-ball"].physical).toBe(false);
    expect(platinum.moves["night-slash"].physical).toBe(true);
  });

  test("leaves out encounters that need the post-game Super Rod", () => {
    expect(stagesOf("gyarados")).toEqual([]);
    expect(stagesOf("magikarp")).toContain(0);
  });

  test("leaves out what depends on chance, Trainer ID or other players", () => {
    expect(stagesOf("heracross")).toEqual([]);
    expect(stagesOf("munchlax")).toEqual([]);
    expect(stagesOf("spiritomb")).toEqual([]);
    expect(stagesOf("cranidos")).toEqual([]);
    expect(Math.min(...stagesOf("combee"))).toBe(1);
  });

  test("evolves by place from the first area reached", () => {
    expect(platinum.evolutions.find((e) => e.to === "magnezone")).toMatchObject(
      { label: "at Mt. Coronet", requires: { stage: 2 } },
    );
  });
});

describe("HeartGold & SoulSilver", () => {
  let hgss: GameData;
  beforeAll(async () => {
    hgss = await loadGame("heartgold-soulsilver");
  });
  const stagesOf = (version: string, species: string) =>
    (hgss.sources[version][species] ?? []).map((s) => s.stage);

  test("stages a place by version where the versions reach it at different times", () => {
    expect(stagesOf("heartgold", "ho-oh")).toEqual([8]);
    expect(stagesOf("soulsilver", "ho-oh")).toEqual([13]);
    expect(stagesOf("heartgold", "lugia")).toEqual([13]);
    expect(stagesOf("soulsilver", "lugia")).toEqual([8]);
  });

  test("needs a placement for every version in a by-version placement", () => {
    const file = readGameFile("heartgold-soulsilver");
    file.locations["bell-tower"] = { heartgold: 8 };
    expect(() => buildGame(file, tables)).toThrow(
      "locations.bell-tower: give a placement for each of heartgold, soulsilver",
    );
  });

  test("leaves out what depends on chance, waiting days or the Game Corner", () => {
    expect(stagesOf("heartgold", "houndoom")).toEqual([]);
    expect(stagesOf("heartgold", "porygon")).toEqual([]);
    expect(stagesOf("heartgold", "aerodactyl")).toEqual([]);
    expect(stagesOf("heartgold", "snorlax")).toEqual([15]);
  });

  test("stages an area's method by the area before the method on the whole location", () => {
    // Route 47's tall grass waits for Waterfall, but Cliff Cave does not.
    expect(Math.min(...stagesOf("heartgold", "steelix"))).toBe(5);
  });

  test("counts the Safari Zone's other areas later than the Peak every layout has", () => {
    expect(stagesOf("heartgold", "magneton")[0]).toBe(5);
    expect(stagesOf("heartgold", "kangaskhan")[0]).toBe(8);
  });

  test("leaves out encounters PokeAPI lists wrongly, and entries it no longer lists", () => {
    expect(stagesOf("heartgold", "golem")).toEqual([]);
    const file = readGameFile("heartgold-soulsilver");
    file.wrongEncounters["johto-safari-zone/peak@walk"] = ["geodude"];
    file.wrongEncounters["johto-route-29"] = ["golem"];
    expect(() => buildGame(file, tables)).toThrow(
      "wrongEncounters: PokeAPI has no golem at johto-route-29",
    );
  });
});

describe("Black & White", () => {
  let bw: GameData;
  beforeAll(async () => {
    bw = await loadGame("black-white");
  });
  const stagesOf = (species: string) =>
    (bw.sources.black[species] ?? []).map((s) => s.stage);

  test("counts a seasonal encounter only where it is found in every season", () => {
    // Route 6 has Vanillite only in winter, while Cold Storage has it all year.
    expect(bw.sources.black.vanillite.map((s) => s.location)).not.toContain(
      "Route 6",
    );
    expect(Math.min(...stagesOf("vanillite"))).toBe(4);
  });

  test("gives each starter its own Dreamyard monkey", () => {
    const gift = (species: string) =>
      bw.sources.black[species].find((s) => s.location === "Dreamyard");
    expect(gift("panpour")).toMatchObject({ stage: 0, starter: "snivy" });
    expect(gift("pansage")).toMatchObject({ starter: "tepig" });
    expect(gift("pansear")).toMatchObject({ starter: "oshawott" });
  });

  test("names the first and last Gym Leaders by starter and version", () => {
    const [striaton] = bw.battles;
    expect(met(striaton, { version: "black", starter: "snivy" }).name).toBe(
      "Chili",
    );
    const opelucid = bw.battles.find((b) => b.id === "opelucid")!;
    expect(met(opelucid, { version: "white", starter: "snivy" }).name).toBe(
      "Iris",
    );
    const n = bw.battles.find((b) => b.id === "n")!;
    expect(
      met(n, { version: "black", starter: "snivy" }).party[0].species,
    ).toBe("zekrom");
  });
});

describe("game files placing a location by version", () => {
  test("evolve by that place from the latest version's stage", () => {
    const file = readGameFile("platinum");
    file.locations["mt-coronet"] = { platinum: 5 };
    const game = buildGame(file, tables);
    expect(game.evolutions.find((e) => e.to === "magnezone")).toMatchObject({
      requires: { stage: 5 },
    });
  });
});

describe("planned games", () => {
  test.each(readPlannedGames())(
    "$name lacks only the stages its game file will give",
    ({ versionGroup, name, pokedex, sprites, starters }) => {
      const file = {
        id: versionGroup,
        ...gameSchema.parse({
          name,
          versionGroup,
          pokedex,
          sprites,
          starters,
          locations: {},
          battles: [
            {
              id: "first",
              name: "First",
              title: "Gym Leader",
              party: [{ species: starters[0], level: 5, moves: ["tackle"] }],
            },
          ],
        }),
      };
      let problems: string[] = [];
      try {
        buildGame(file, tables);
      } catch (error) {
        problems = (error as Error).message.split("\n").slice(1);
      }
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.filter((p) => !/no (story )?stage$/.test(p))).toEqual([]);
    },
  );
});

describe("battle variants", () => {
  const champion = (file: ReturnType<typeof readGameFile>) =>
    file.battles.find((b) => b.id === "champion")!;

  test("must give every version and starter a party", () => {
    const file = readGameFile("firered-leafgreen");
    champion(file).variants.pop();
    expect(() => buildGame(file, tables)).toThrow(
      "champion: no party for firered with squirtle",
    );
  });

  test("must not overlap or name an unknown version", () => {
    const file = readGameFile("firered-leafgreen");
    champion(file).variants.push(
      { version: "firered", name: "Gary" },
      { version: "crystal", name: "Silver" },
    );
    const build = () => buildGame(file, tables);
    expect(build).toThrow(
      "champion: several variants for firered with bulbasaur",
    );
    expect(build).toThrow("champion variant 5: crystal is not a version");
  });
});

describe("game files with several Pokédexes", () => {
  test("cover every listed Pokédex, numbering species by the first", () => {
    const file = readGameFile("firered-leafgreen");
    file.pokedex = ["kanto", "original-johto"];
    for (const item of [
      "sun-stone",
      "kings-rock",
      "metal-coat",
      "dragon-scale",
      "up-grade",
    ])
      file.items[item] = "postgame";
    const game = buildGame(file, tables);
    expect(Object.keys(game.species).length).toBeGreaterThan(151);
    expect(game.species.chikorita).toBeDefined();
    expect(game.evolutions.find((e) => e.to === "steelix")).toBeUndefined();
    expect(game.evolutions.find((e) => e.to === "crobat")).toMatchObject({
      label: "friendship",
      requires: { friendship: true },
    });
  });
});

describe("isPhysical", () => {
  test("follows the type until generation IV and the move after", () => {
    const shadowBall = tables.moves.find(
      (m) => m.identifier === "shadow-ball",
    )!;
    const ghost = tables.types.find((t) => t.identifier === "ghost")!;
    expect(isPhysical(3, ghost, shadowBall)).toBe(true);
    expect(isPhysical(4, ghost, shadowBall)).toBe(false);
  });
});
