// Checks every game in data/games/, so a new game is covered without new tests.
import { describe, expect, test } from "vitest";

import { gameIds, loadGame } from "../scripts/games.ts";
import { defaultOptions } from "./candidates.ts";
import { search } from "./search.ts";

describe.each(gameIds())("%s", (id) => {
  test.each([false, true])(
    "finds ten teams for every version and starter, each with that starter (post-game battles: %s)",
    async (includePostgame) => {
      const game = await loadGame(id);
      for (const version of game.versions) {
        for (const starter of game.starters) {
          const { candidates, teams } = search(game, {
            ...defaultOptions,
            version: version.id,
            starter,
            includePostgame,
          });
          expect(teams, `${version.id} ${starter}`).toHaveLength(10);
          for (const team of teams) {
            const families = team.members.map(
              (m) => candidates.find((c) => c.id === m)!.family,
            );
            expect(families).toContain(starter);
          }
        }
      }
    },
  );
});
