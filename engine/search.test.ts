import { beforeAll, describe, expect, test } from "vitest";

import { loadGame } from "../scripts/games.ts";
import { buildCandidates, type Candidate, type Options } from "./candidates.ts";
import type { GameData } from "./data.ts";
import { explain, scoreTeam, search, TEAM_SIZE } from "./search.ts";
import { fireRed as options } from "./test-options.ts";

let game: GameData;
beforeAll(async () => {
  game = await loadGame("firered-leafgreen");
});

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) =>
    combinations(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]),
  );
}

/** Every valid team, scored one by one: the reference the search must match. */
function exhaustive(o: Options, pool: Candidate[], starter: Candidate) {
  const typesOf = (c: Candidate) => game.species[c.id].types;
  const group = (c: Candidate) =>
    game.exclusiveGroups.findIndex((g) => g.includes(c.family));
  return combinations(pool, TEAM_SIZE - 1)
    .map((rest) => [starter, ...rest])
    .filter((team) => {
      const families = team.map((c) => c.family);
      const groups = team.map(group).filter((g) => g >= 0);
      const types = team.flatMap(typesOf);
      const carried = team.flatMap((c) => c.fieldMoves);
      return (
        new Set(families).size === team.length &&
        new Set(groups).size === groups.length &&
        (!o.uniqueTypes || new Set(types).size === types.length) &&
        (!o.carryFieldMoves ||
          game.fieldMoves.every((m) => carried.includes(m.id)))
      );
    })
    .map((team) => ({
      members: team.map((c) => c.id),
      score: scoreTeam(game, o, team),
    }))
    .sort((a, b) => b.score - a.score);
}

// Pools small enough to enumerate. Charmander's mixes early and late joiners,
// an exclusive pair and few Surf users, so keeping one changes the top teams;
// Bulbasaur's has many close teams, which tests pruning at every depth.
const pools: Record<string, string[]> = {
  charmander: [
    "primeape",
    "raticate",
    "graveler",
    "snorlax",
    "jolteon",
    "mr-mime",
    "hitmonlee",
    "hitmonchan",
    "golbat",
    "beedrill",
    "lapras",
    "dragonite",
    "nidoking",
  ],
  bulbasaur: [
    "hitmonchan",
    "fearow",
    "beedrill",
    "hitmonlee",
    "venomoth",
    "marowak",
    "wigglytuff",
    "seaking",
    "tangela",
    "mr-mime",
    "kangaskhan",
    "chansey",
    "raichu",
    "haunter",
  ],
};

describe("search", () => {
  test.each(
    Object.keys(pools).flatMap((starter) =>
      [true, false].flatMap((uniqueTypes) =>
        [true, false].map((carryFieldMoves) => ({
          starter,
          uniqueTypes,
          carryFieldMoves,
        })),
      ),
    ),
  )(
    "finds the same best teams as checking every team ($starter, unique types: $uniqueTypes, field moves: $carryFieldMoves)",
    ({ starter: family, uniqueTypes, carryFieldMoves }) => {
      const all = buildCandidates(
        game,
        options({ starter: family, uniqueTypes }),
      );
      const starter = all.find((c) => c.family === family)!;
      const keep = new Set(pools[family]);
      const pool = all.filter((c) => keep.has(c.id));
      const o = options({
        starter: family,
        uniqueTypes,
        carryFieldMoves,
        banned: all
          .filter((c) => c !== starter && !keep.has(c.id))
          .map((c) => c.id),
      });

      const expected = exhaustive(o, pool, starter).slice(0, 10);
      if (carryFieldMoves && family === "charmander") {
        const free = exhaustive(
          { ...o, carryFieldMoves: false },
          pool,
          starter,
        );
        expect(free.slice(0, 10).map((t) => t.score)).not.toEqual(
          expected.map((t) => t.score),
        );
      }
      const { teams } = search(game, o, 10);
      expect(teams).toHaveLength(expected.length);
      teams.forEach((team, i) =>
        expect(team.score).toBeCloseTo(expected[i].score, 9),
      );
      expect(teams.map((t) => new Set(t.members))).toEqual(
        expected.map((t) => new Set(t.members)),
      );
    },
  );

  test("keeps pinned members and drops banned ones", () => {
    const { teams } = search(
      game,
      options({ pinned: ["poliwrath"], banned: ["graveler"] }),
    );
    expect(teams.length).toBeGreaterThan(0);
    for (const team of teams) {
      expect(team.members).toContain("poliwrath");
      expect(team.members).not.toContain("graveler");
    }
  });

  test("explains pins that cannot go together", () => {
    expect(() => search(game, options({ pinned: ["pidgeot"] }))).toThrow(
      "Pidgeot cannot join Charizard",
    );
  });

  test("explains when no team can keep a member for every field move", () => {
    const pinned = ["raticate", "primeape", "graveler", "mr-mime", "jolteon"];
    expect(() => search(game, options({ pinned }))).toThrow(
      "No team with these settings keeps a member for Fly and Surf",
    );
    expect(
      search(game, options({ pinned, carryFieldMoves: false })).teams,
    ).toHaveLength(1);
  });

  test("blames field moves only when they are what rules out every team", () => {
    const all = buildCandidates(game, options());
    const banned = all
      .filter((c) => c.family !== "charmander")
      .slice(4)
      .map((c) => c.id);
    expect(search(game, options({ banned })).teams).toEqual([]);
  });

  test("never pairs members of an exclusive group or family", () => {
    const { teams } = search(
      game,
      options({ pinned: ["hitmonlee"], uniqueTypes: false }),
    );
    for (const team of teams) {
      expect(team.members).not.toContain("hitmonchan");
      const eeveelutions = team.members.filter((m) =>
        ["vaporeon", "jolteon", "flareon"].includes(m),
      );
      expect(eeveelutions.length).toBeLessThanOrEqual(1);
    }
  });

  test("reports each team's score as scoring it directly would", () => {
    const o = options({ starter: "squirtle" });
    const { candidates, teams } = search(game, o);
    for (const team of teams) {
      const members = team.members.map((id) =>
        candidates.find((c) => c.id === id)!,
      );
      expect(team.score).toBeCloseTo(scoreTeam(game, o, members), 9);
    }
  });

  test("scores post-game battles only when asked to", () => {
    const { candidates, teams } = search(game, options());
    const team = teams[0].members.map((id) =>
      candidates.find((c) => c.id === id)!,
    );
    const scored = (o: Options) =>
      explain(game, o, team).map((r) => game.battles[r.battle].id);
    const story = scored(options());
    expect(story).not.toContain("champion-rematch");
    expect(scored(options({ includePostgame: true }))).toEqual([
      ...story,
      "lorelei-rematch",
      "bruno-rematch",
      "agatha-rematch",
      "lance-rematch",
      "champion-rematch",
    ]);
  });
});
