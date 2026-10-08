import { expect, test } from "@playwright/test";

const builder = "./firered-leafgreen/";

test("home page links to each game", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: /FireRed & LeafGreen/ }).click();
  await expect(
    page.getByRole("heading", { name: "FireRed & LeafGreen", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Best team/ })).toBeVisible();
});

test("builds a team around the chosen starter", async ({ page }) => {
  await page.goto(builder);
  await page.getByRole("button", { name: "Charmander" }).click();
  await expect(page).toHaveURL(/starter=charmander/);
  await expect(
    page.getByRole("heading", { name: "Charizard", level: 3 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Brock", level: 3 }),
  ).toBeVisible();
});

test("excluding a member searches again without it", async ({ page }) => {
  await page.goto(builder);
  const exclude = page.getByRole("button", { name: /^Exclude / }).first();
  const name = (await exclude.getAttribute("aria-label"))!.replace(
    "Exclude ",
    "",
  );
  await exclude.click();
  await expect(page).toHaveURL(/ban=/);
  await expect(
    page.getByRole("button", { name: `Remove ${name}` }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name, level: 3 })).toHaveCount(0);
});

test("explains pinned Pokémon that cannot go together", async ({ page }) => {
  await page.goto(`${builder}?starter=charmander&pin=pidgeot`);
  await expect(page.getByText("Pidgeot cannot join Charizard")).toBeVisible();
  await page.getByRole("button", { name: "Clear pinned Pokémon" }).click();
  await expect(page.getByRole("heading", { name: /Best team/ })).toBeVisible();
});
