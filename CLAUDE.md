# sixth-slot

README.md says what the project does, how it is laid out and how the site is
built. Read its Development section before changing the build.

- Run everything through pnpm (`pnpm check`, `pnpm test:e2e`, `pnpm exec …`).
  The project pins its Node.js version in `devEngines`, and the system Node may
  be too old for React Router, Vitest and the `.ts` scripts.
- A change is done when `pnpm check` and `pnpm test:e2e` both pass.
- Outside CI, `pnpm test:e2e` reuses a server already listening on port 4173
  instead of building; stop any preview server first, or the tests run
  against its build.
- Every fact in `data/games/` follows the sourcing rule under "Game files"
  in README.md. Never fill one in from memory.
- The supported games are those in README.md's table; add no others.
