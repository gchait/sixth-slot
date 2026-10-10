import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{app,engine,scripts}/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
