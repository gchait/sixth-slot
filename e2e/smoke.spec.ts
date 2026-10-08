import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "sixth-slot" })).toBeVisible();
});

test("unknown deep link falls back to the app", async ({ page }) => {
  await page.goto("./no-such-page");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});
