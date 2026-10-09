import { beforeAll, describe, expect, test } from "vitest";

import { loadGame } from "../scripts/games.ts";
import {
  buildCandidates,
  defaultOptions,
  type Candidate,
  type Options,
} from "./candidates.ts";
import type { GameData } from "./data.ts";
import { explain, scoreTeam, search, TEAM_SIZE } from "./search.ts";

let game: GameData;
beforeAll(async () => {
  game = await loadGame("firered-leafgreen");
});

const options = (overrides: Partial<Options> = {}): Options => ({
  ...defaultOptions,
  version: "firered",
  starter: "charmander",
  ...overrides,
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
      return (
        new Set(families).size === team.length &&
        new Set(groups).size === groups.length &&
        (!o.uniqueTypes || new Set(types).size === types.length)
      );
    })
    .map((team) => ({
      members: team.map((c) => c.id),
      score: scoreTeam(game, o, team),
    }))
    .sort((a, b) => b.score - a.score);
}

describe("search", () => {
  test.each([true, false])(
    "finds the same best teams as checking every team (unique types: %s)",
    (uniqueTypes) => {
      const all = buildCandidates(game, options({ uniqueTypes }));
      const starter = all.find((c) => c.family === "charmander")!;
      // A pool small enough to enumerate, mixing early and late joiners and an exclusive pair.
      const keep = new Set([
        "primeape",
        "raticate",
        "graveler",
        "snorlax",
        "vaporeon",
        "jolteon",
        "mr-mime",
        "hitmonlee",
        "hitmonchan",
        "golbat",
        "beedrill",
        "lapras",
        "dragonite",
        "nidoking",
      ]);
      const pool = all.filter((c) => keep.has(c.id));
      const o = options({
        uniqueTypes,
        banned: all
          .filter((c) => c !== starter && !keep.has(c.id))
          .map((c) => c.id),
      });

      const expected = exhaustive(o, pool, starter).slice(0, 10);
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
