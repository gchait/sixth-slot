import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { stripVTControlCharacters } from "node:util";

import { createLogger, defineConfig } from "vite";

import { gameData } from "./scripts/vite-game-data.ts";
import { notFoundPage } from "./scripts/vite-not-found.ts";

// Vite notices that say nothing actionable for this project: how to expose the
// dev server on the network, and the server-side module runner connecting.
const quiet = /use --host to expose|^connected\.$/;
const logger = createLogger();
const info = logger.info.bind(logger);
logger.info = (message, options) => {
  if (!quiet.test(stripVTControlCharacters(message))) info(message, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [gameData(), notFoundPage(), tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  // Scan all app code up front, so the dev server does not discover
  // dependencies mid-visit and reload the page.
  optimizeDeps: {
    entries: ["app/**/*.{ts,tsx}"],
  },
});
