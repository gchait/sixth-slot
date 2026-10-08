import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import { gameJsonSchema, schemaPath } from "./game-schema.ts";

test("the committed JSON Schema matches data/schema.ts (run `pnpm data:schema`)", () => {
  expect(readFileSync(schemaPath, "utf8")).toBe(gameJsonSchema());
});
