# sixth-slot

README.md says what the project does, how it is laid out and how the site is
built. Read its Development section before changing the build.

- Run everything through pnpm (`pnpm check`, `pnpm test:e2e`, `pnpm exec …`).
  The project pins its Node.js version in `devEngines`, and the system Node may
  be too old for React Router, Vitest and the `.ts` scripts.
- A change is done when `pnpm check` and `pnpm test:e2e` both pass.
- Every fact in `data/games/` follows the sourcing rule under "Game files"
  in README.md. Never fill one in from memory.
