# sixth-slot

Plan the best team for a Pokémon playthrough: pick your starter, and get five
teammates the game actually lets you catch, balanced for every battle on the
way to the Champion.

Supported games: **FireRed & LeafGreen** and **Emerald**.

## How teams are chosen

**Rules every team follows**

- Your starter is always on the team.
- Only Pokémon your version can get before the Champion: wild encounters,
  gifts, static encounters and in-game trades, each from the point in the
  story where it becomes reachable.
- One Pokémon per evolution family, and one from each either-or gift (such as
  Hitmonlee or Hitmonchan).
- By default, no two members share a type, legendaries are left out, and
  evolutions that need a trade with another player are off. Each can be
  changed, and any Pokémon can be pinned or excluded.
- Post-game rematches, such as FireRed's second Elite Four round or Emerald's
  first Gym Leader rematches, can be scored too, still with Pokémon from the
  story only.

**How a team is scored**

The team faces every Gym Leader, the Elite Four and the Champion, with their
real teams and moves. For each opponent, the team's best one-on-one matchup
counts: how many more hits your Pokémon survives than it needs, using the
game's own stat and damage formulas. A member counts only from the battle by
which you can have it, in the form and with the moves it would have by then:
level-up moves and the HMs obtained so far. Abilities count where a species is
sure to have them and they change damage: immunities such as Levitate, Thick
Fat, Huge Power and Truant. Teams where many members share a weakness lose a
little. The search checks every valid team, skipping only those that provably
cannot make the top ten.

**What it leaves out**

TMs (single-use in these games), other abilities, held items, natures, IVs and
EVs, status moves, random damage and critical hits, and opponents' switching.
Your level is taken to be that of each battle's strongest opponent, and double
battles are treated as one-on-one.

## Development

Requires [pnpm](https://pnpm.io/installation), which downloads the Node.js
version the project pins.

```sh
pnpm install
pnpm dev          # dev server; edits to data/games/ reload the page
pnpm check        # typecheck, lint, format check, unit tests
pnpm test:e2e     # build, serve, and run browser tests
```

`pnpm build` writes a static site to `build/client/`. The first build or test
run downloads PokeAPI's data tables into `.cache/`.

The code is split in three:

- `data/games/` holds one hand-curated file per game: when each location,
  encounter method, item and HM becomes available, in-game trades, and the
  major battles.
- `scripts/` combines those files with [PokeAPI](https://pokeapi.co)'s data
  into `public/data/<game>.json`, checking every reference.
- `engine/` builds the candidates and searches for teams; `app/` is the site.

## Adding a game

Games on the way are listed in `data/planned.yaml`, which the home page shows
as coming soon; remove a game from there when it lands. Copy a file in
`data/games/` and fill it in for the new game. Your editor can
check it as you type using `data/game.schema.json`, and `pnpm data` reports
every location, item, species or evolution it cannot resolve. Take stages and
battles from a source such as the game's
[Bulbapedia walkthrough](https://bulbapedia.bulbagarden.net/wiki/Category:Walkthroughs),
following its order of play. Generation I is not supported yet, since it has a
single Special stat; later generations may use evolution conditions the build
reports as unsupported until the engine models them.

## Credits

Game data comes from [PokeAPI](https://pokeapi.co), and sprites are loaded from
its sprite repository. Story order and trainer teams follow
[Bulbapedia](https://bulbapedia.bulbagarden.net)'s walkthroughs.

Pokémon is © Nintendo, Creatures Inc. and GAME FREAK inc. This is an
unofficial fan project, not affiliated with or endorsed by them. It distributes no game files or artwork of its own.
