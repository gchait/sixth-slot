# sixth-slot

Plan the best team for a Pokémon playthrough: pick your starter, and get five
teammates the game actually lets you catch, balanced for every battle on the
way to the Champion.

Supported games: **FireRed & LeafGreen** and **Emerald**.

## How teams are chosen

**Rules every team follows**

- Your starter is always on the team.
- Only Pokémon your version can get: wild encounters, gifts, static encounters
  and in-game trades, each from the point in the story where it becomes
  reachable.
- One Pokémon per evolution family, and one from each either-or gift (such as
  Hitmonlee or Hitmonchan).
- A member can use each move the game file marks as needed outside battle all
  the time, such as Fly, from when it works there. Moves needed only now and
  then, such as Cut, are left to a Pokémon carried just for them.
- By default, no two members share a type, legendaries are left out,
  evolutions that need a trade with another player are off, and those
  outside-battle moves are kept on the team. Each can be changed, and any
  Pokémon can be pinned or excluded.
- Battles after the Champion, such as FireRed's second Elite Four round or
  Emerald's first Gym Leader rematches, can be scored too. They count Pokémon
  caught on the way to them, but not post-game story areas.

**How a team is scored**

The team faces every Gym Leader, the Elite Four and the Champion, with their
real teams and moves. For each opponent, the team's best one-on-one matchup
counts: how many more hits your Pokémon survives than it needs, using the
game's own stat and damage formulas. A member counts only from the battle by
which you can have it, in the form and with the moves it would have by then:
level-up moves and the HMs obtained so far. Abilities count where a species is
sure to have them and they change damage: immunities such as Levitate, and
Thick Fat, Huge Power and Truant. Teams where many members share a weakness lose a
little. The search checks every valid team, skipping only those that provably
cannot make the top ten.

**What it leaves out**

TMs (single-use in these games), other abilities, held items, natures, IVs and
EVs, status moves, random damage and critical hits, and opponents' switching.
Your level is taken to be that of the strongest opponent faced so far, and
double battles are treated as one-on-one.

## Development

Requires [pnpm](https://pnpm.io/installation), which downloads the Node.js
version the project pins.

```sh
pnpm install
pnpm dev          # dev server; edits to data/games/ reload the page
pnpm check        # typecheck, lint, format check, unit tests
pnpm test:e2e     # build, serve, and run browser tests
```

`pnpm build` writes a static site to `build/client/`, replacing `build/` as a
whole. A server for it answers addresses without a file with `404/index.html`
and status 404, and can cache `assets/` for good, since those file names carry
a hash of their content. The first build or test run downloads PokeAPI's data
tables into `.cache/`.

The code is split in three:

- `data/games/` holds one hand-curated file per game: when each location,
  encounter method and condition, item and HM becomes available, and the major
  battles.
- `scripts/` combines those files with [PokeAPI](https://pokeapi.co)'s data
  into `generated/<game>.json`, checking every reference.
- `engine/` builds the candidates and searches for teams; `app/` is the site.

## Adding a game

Games on the way are listed in `data/planned.yaml`, which the home page shows
as coming soon; remove a game from there when it lands. Copy a file in
`data/games/` and fill it in for the new game, following the order of play in
a source such as the game's
[Bulbapedia walkthrough](https://bulbapedia.bulbagarden.net/wiki/Category:Walkthroughs).
`data/schema.ts` describes every field, and editors show those descriptions
through `data/game.schema.json`. `pnpm data` reports every location, encounter
condition, item or evolution the file does not place.

Generation I is not supported yet, since it has a single Special stat.

## Credits

Game data comes from [PokeAPI](https://pokeapi.co), and sprites are loaded from
its sprite repository. Story order and trainer teams follow
[Bulbapedia](https://bulbapedia.bulbagarden.net)'s walkthroughs.

Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is an
unofficial fan project, not affiliated with or endorsed by them. It distributes
no game files or artwork of its own.
