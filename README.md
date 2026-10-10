# sixth-slot

**Plan the best team for a Pokémon playthrough.** Pick your starter, and get
five teammates the game really offers, scored against every major battle of
the story.

| Game                   | Generation | Region          |
| ---------------------- | :--------: | --------------- |
| Crystal                |     II     | Johto and Kanto |
| Emerald                |    III     | Hoenn           |
| FireRed & LeafGreen    |    III     | Kanto           |
| Platinum               |     IV     | Sinnoh          |
| HeartGold & SoulSilver |     IV     | Johto and Kanto |
| Black & White          |     V      | Unova           |
| Black 2 & White 2      |     V      | Unova           |
| X & Y                  |     VI     | Kalos           |

Generation I is not supported, since it has a single Special stat.

## How teams are chosen

### What a team can hold

- **Your starter**, always.
- **Only what your version can get**: wild encounters, gifts, static
  encounters and in-game trades, each from the point in the story where it
  becomes reachable.
- **No gambling, grinding or luck you cannot retry.**
  - A Game Corner prize counts once the story's trainers have paid twice its
    price in coins.
  - A random evolution counts only when its base can be caught again.
  - What the game decides by Trainer ID is left out.
  - A Pokémon that depends on the season counts only where it is found in every
    season.
- **One Pokémon per evolution family**, and one from each either-or gift, such
  as Hitmonlee or Hitmonchan.
- **The moves needed outside battle all the time**, such as Fly and Surf, are
  known by a member from when each works there. Moves needed only now and then,
  such as Cut, are left to a Pokémon carried for them.

### Settings

| Setting                    | Default | When on                                                                                   |
| -------------------------- | :-----: | ----------------------------------------------------------------------------------------- |
| No shared types            |   on    | No two members have a type in common.                                                     |
| Legendaries                |   off   | Legendary Pokémon can join.                                                               |
| Trade evolutions           |   off   | Evolutions that need a trade with another player count.                                   |
| Post-game battles          |   off   | Rematches and battles after the story are scored too.                                     |
| _Fly and Surf_ on the team |   on    | The team keeps the moves needed outside battle, as above; the label names the game's own. |

Any Pokémon can also be pinned to every team or excluded.

Post-game battles include FireRed's second Elite Four round, Emerald's Gym
Leader rematches, Crystal's Kanto Gym Leaders and Red, and Black and White's
Champion. They count Pokémon caught on the way to them, but not post-game story
areas.

### How a team is scored

The team faces every Gym Leader, the Elite Four and the story's final battles,
with their real teams and moves.

1. **One matchup per opponent.** Each member's matchup is how many more hits it
   survives than it needs to win, adjusted for who moves first, using the
   game's own stat and damage formulas. A move counts by its average damage per
   turn after accuracy, number of strikes and turns spent charging or
   recharging.
2. **The best member answers.** Each opponent counts the team's best matchup
   against it, and each battle counts equally.
3. **Shared weaknesses cost a little**, for each member beyond two that is weak
   to the same type.

A member counts only from the battle by which you can have it, in the form and
with the moves it would have by then:

- level-up moves learned since it reached each form, and all of them once the
  game's Move Reminder can reteach them;
- the damaging HMs obtained so far;
- the abilities it is sure to have that change damage: immunities such as
  Levitate and Flash Fire, Thick Fat, Dry Skin, Huge Power, Pure Power and
  Truant.

The search checks every valid team, skipping only those that provably cannot
make the top ten.

### Simplifications

Left out: TMs, abilities a species may not have, held items, natures, EVs,
status moves, move priority, random damage, critical hits and opponents'
switching.

- IVs are taken as average.
- Your level is taken as that of the highest-level opponent faced so far.
- Moves whose power changes during a battle count at their base power, such as
  Eruption at full HP.
- Double battles are treated as one-on-one.

## Development

Requires [pnpm](https://pnpm.io/installation), which downloads the Node.js
version the project pins in `package.json`.

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `pnpm install`     | Install dependencies.                                         |
| `pnpm dev`         | Start the dev server; edits to `data/games/` reload the page. |
| `pnpm check`       | Typecheck, lint, check formatting and run the unit tests.     |
| `pnpm test:e2e`    | Build, serve and run the browser tests.                       |
| `pnpm build`       | Write the static site to `build/client/`.                     |
| `pnpm data`        | Build only the game data, to check `data/games/` quickly.     |
| `pnpm data:schema` | Regenerate `data/game.schema.json` from `data/schema.ts`.     |

The first build or test run downloads PokeAPI's data tables and the starters'
sprites into `.cache/`.

### Layout

- `data/games/`: one hand-curated file per game, saying when each location,
  encounter method and condition, item and HM becomes available, and listing
  the major battles.
- `scripts/`: the build, which combines those files with
  [PokeAPI](https://pokeapi.co)'s data into `generated/<game>.json`, checking
  every reference.
- `engine/`: builds the candidates and searches for teams.
- `app/`: the site.

### How the site is built

- `generated/` is not committed. The Vite plugin in `scripts/vite-game-data.ts`
  writes it when the dev server or a build starts. It stays outside `public/`
  because route loaders read it while prerendering, so the pages already carry
  it.
- `data/game.schema.json` is committed, and a test fails when it falls behind
  `data/schema.ts`.
- `app/routes.ts` gives each file in `data/games/` its own route, and every
  route is prerendered. The site has no server, so a route matching an address
  that was not prerendered could not load its data; addresses with no route get
  the not-found page, prerendered at `/404/`.
- Game pages live at `/<game>/` with a trailing slash. Prerendering writes
  `<game>/index.html` and `<game>/_.data`, which is what client navigation to
  that path requests; without the slash the two disagree.
- `engine/` and `scripts/` import with explicit `.ts` extensions, because Node
  runs the scripts directly.
- `pnpm dev` runs `scripts/dev.ts`, which starts React Router's CLI with
  `--conditions=development`; run plainly, the CLI relaunches Node to add it.

### Deploying

`pnpm build` replaces `build/` as a whole. Serve `build/client/`, answering
addresses without a file with `404/index.html` and status 404. Files in
`assets/` can be cached for good, since their names carry a hash of their
content.

### Adding a game

1. Copy a file in `data/games/` and fill it in for the new game, following the
   story in its
   [Bulbapedia walkthrough](https://bulbapedia.bulbagarden.net/wiki/Category:Walkthroughs).
   `data/schema.ts` describes every field, and editors show those descriptions
   through `data/game.schema.json`.
2. Run `pnpm data`. It fails, listing every location, encounter condition, item
   or evolution the file does not place.
3. Add the game to the table at the top of this file.

Every fact comes from a source: PokeAPI, or Bulbapedia for stages and battles.
Where Bulbapedia or the game's [pret](https://github.com/pret) decompilation, if
it has one, shows PokeAPI is wrong, they win. When the source of a fact is not
obvious, a comment says where it is.

## Credits

Game data comes from [PokeAPI](https://pokeapi.co), and sprites are loaded from
its sprite repository. Story order, trainer teams and game mechanics come from
[Bulbapedia](https://bulbapedia.bulbagarden.net), and corrections to PokeAPI's
encounters from Bulbapedia and the [pret](https://github.com/pret)
decompilations.

Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is an
unofficial fan project, not affiliated with or endorsed by them. It distributes
no game files or artwork of its own.

Released under the [MIT License](LICENSE).
