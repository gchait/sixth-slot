// Writes data/game.schema.json.
import { writeFileSync } from "node:fs";

import { gameJsonSchema, schemaPath } from "./game-schema.ts";

writeFileSync(schemaPath, gameJsonSchema());
