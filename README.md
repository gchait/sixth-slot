# sixth-slot

Plan the best team for a Pokémon playthrough: pick your starter, and get a
balanced team built from what the game actually lets you catch.

## Development

Requires [pnpm](https://pnpm.io/installation). pnpm downloads the Node.js
version the project pins on first install.

```sh
pnpm install
pnpm dev          # dev server
pnpm check        # typecheck, lint, format check
pnpm test:e2e     # build, serve, and run browser tests
```

`pnpm build` writes a static site to `build/client/`.
