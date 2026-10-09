import { readFileSync } from "node:fs";

import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  prerender() {
    const games = JSON.parse(
      readFileSync("public/data/games.json", "utf8"),
    ) as { id: string; planned: boolean }[];
    return [
      "/",
      ...games.filter((game) => !game.planned).map((game) => `/${game.id}/`),
    ];
  },
} satisfies Config;
