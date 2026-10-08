import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:4173/";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
