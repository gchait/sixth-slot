// Builds the game data when Vite starts, and again whenever a game file changes
// during development, reloading the page.
import type { Plugin } from "vite";

import { writeGameData } from "./game-data.ts";

export function gameData(): Plugin {
  let built: Promise<void> | undefined;
  return {
    name: "sixth-slot:game-data",
    buildStart() {
      built ??= writeGameData();
      return built;
    },
    configureServer(server) {
      server.watcher.add("data/games");
      server.watcher.on("change", (file) => {
        if (!/data[\\/]games[\\/][^\\/]+\.yaml$/.test(file)) return;
        writeGameData().then(
          () => server.ws.send({ type: "full-reload" }),
          (error: unknown) => server.config.logger.error(String(error)),
        );
      });
    },
  };
}
