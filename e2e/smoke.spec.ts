import { expect, test } from "@playwright/test";

import { gameIds } from "../scripts/games.ts";

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

test("plans a single-version game without a version choice", async ({
  page,
}) => {
  await page.goto("./emerald/?starter=mudkip");
  await expect(
    page.getByRole("heading", { name: "Swampert", level: 3 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Roxanne", level: 3 }),
  ).toBeVisible();
  await expect(page.getByText("Version", { exact: true })).toHaveCount(0);
});

test("lists planned games as coming soon, without a link", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("Black & White")).toBeVisible();
  await expect(page.getByRole("link", { name: /Black & White/ })).toHaveCount(
    0,
  );
  await expect(page.getByText("Coming soon").first()).toBeVisible();
});

test("keeps a member for each field move unless told not to", async ({
  page,
}) => {
  await page.goto(`${builder}?starter=squirtle`);
  await expect(page.getByText("Fly", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Surf", { exact: true }).first()).toBeVisible();
  await page.getByRole("switch", { name: "Fly and Surf on the team" }).click();
  await expect(page).toHaveURL(/field=0/);
});

test("an unknown address gets the not-found page, which links home", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const response = await page.goto("./no-such-game/");
  expect(response!.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found · sixth-slot");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  expect(errors.filter((e) => !e.includes("404"))).toEqual([]);
  await page.getByRole("link", { name: "← sixth-slot" }).click();
  await expect(page.getByText("Coming soon").first()).toBeVisible();
});

test("lines up the top teams and shows the one picked", async ({ page }) => {
  await page.goto("./emerald/?starter=mudkip");
  const rows = page.getByRole("list").filter({ has: page.getByText("#1") });
  await expect(rows.getByRole("button")).toHaveCount(10);
  const names = await rows
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((b) => [...b.querySelectorAll("img")].map((i) => i.alt)),
    );
  for (const row of names) {
    row.forEach((name, i) => {
      if (names[0].includes(name)) expect(name).toBe(names[0][i]);
    });
  }
  await rows.getByRole("button", { name: /^#3/ }).click();
  await expect(page.getByRole("heading", { name: /Team #3/ })).toBeInViewport();
});

test("lists further places once per stage, Pokémon and method", async ({
  page,
}) => {
  await page.goto("./platinum/?starter=piplup&pin=crobat");
  const card = page.locator("[data-slot=card]").filter({
    has: page.getByRole("heading", { name: "Crobat" }),
  });
  await card.getByText(/more places/).click();
  await expect(
    card.getByText(/Zubat · [^·]+, [^·]+ · walking/).first(),
  ).toBeVisible();
});

test("scores post-game battles when asked to", async ({ page }) => {
  await page.goto("./firered-leafgreen/");
  await expect(
    page.getByRole("heading", { name: "Lorelei", level: 3 }),
  ).toHaveCount(1);
  await page.getByRole("switch", { name: "Post-game battles" }).click();
  await expect(page).toHaveURL(/postgame=1/);
  await expect(
    page.getByRole("heading", { name: "Lorelei", level: 3 }),
  ).toHaveCount(2);
});

for (const id of gameIds()) {
  test(`${id} fits a narrow phone screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`./${id}/`);
    await expect(
      page.getByRole("heading", { name: /Best team/ }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}
