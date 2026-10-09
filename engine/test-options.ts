// Options for engine tests: FireRed with Charmander, unless overridden.
import { defaultOptions, type Options } from "./candidates.ts";

export const fireRed = (overrides: Partial<Options> = {}): Options => ({
  ...defaultOptions,
  version: "firered",
  starter: "charmander",
  ...overrides,
});
