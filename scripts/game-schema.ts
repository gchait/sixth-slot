// The JSON Schema editors use to check data/games/*.yaml as you type.
import { z } from "zod";

import { gameSchema } from "../data/schema.ts";

export const schemaPath = "data/game.schema.json";

export function gameJsonSchema(): string {
  return `${JSON.stringify(z.toJSONSchema(gameSchema, { io: "input" }), null, 2)}\n`;
}
