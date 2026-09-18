import { type Page, expect, test } from "@playwright/test";

/** Fail a test on any console error or uncaught exception. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("/ redirects to the reader's language", async ({ browser }) => {
  for (const [accept, path] of [["en-US", "/en"], ["zh-TW", "/zh"], ["ja-JP", "/zh"]] as const) {
    const ctx = await browser.newContext({ locale: accept });
    const page = await ctx.newPage();
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe(path);
    await ctx.close();
  }
});

for (const locale of ["zh", "en"] as const) {
  test(`home renders and classifies in ${locale}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh" ? "zh-Hant-TW" : "en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The hero instrument boots with a sample 7 and must read it as 7.
    await expect(page.getByTestId("hero-prediction")).toHaveText("7");
    await page.getByRole("button", { name: "3", exact: true }).first().click();
    await expect(page.getByTestId("hero-prediction")).toHaveText("3");
    expect(errors).toEqual([]);
  });
}

test("locale switch keeps you on the same article", async ({ page }) => {
  await page.goto("/zh/posts/cnn-from-scratch");
  await page.getByRole("link", { name: /English/ }).click();
  await expect(page).toHaveURL(/\/en\/posts\/cnn-from-scratch$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CNN from scratch");
});

test("article has an outline and five working instruments", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/posts/cnn-from-scratch");
  await expect(page.locator("[data-instrument]")).toHaveCount(5);
  await expect(page.locator('a[href="#what-the-network-sees"]').first()).toBeAttached();
  await expect(page.getByTestId("prediction")).toHaveText("7");
  expect(errors).toEqual([]);
});

test("drawing on the canvas produces a prediction", async ({ page }) => {
  await page.goto("/en/posts/cnn-from-scratch");
  await page.getByRole("button", { name: "Clear" }).first().click();
  await expect(page.getByTestId("prediction")).toHaveText("–");

  const canvas = page.getByTestId("digit-canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  // One vertical stroke down the middle: a 1.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("prediction")).toHaveText("1");
});

test("the convolution stepper advances", async ({ page }) => {
  await page.goto("/en/posts/cnn-from-scratch");
  const stepper = page.locator('[data-instrument="conv2d / step"]');
  await expect(stepper).toContainText("1/16");
  await stepper.getByRole("button", { name: "Step" }).click();
  await expect(stepper).toContainText("2/16");
});

test("search opens, finds the CNN article and navigates", async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await page.goto("/en");
  // The ⌘K listener attaches on hydration; the hero prediction only appears after it.
  await expect(page.getByTestId("hero-prediction")).toHaveText("7");
  if (isMobile) await page.getByRole("button", { name: "Search" }).click();
  else await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/Search posts/).fill("convolution");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/en\/posts\/cnn-from-scratch$/);
  expect(errors).toEqual([]);
});

test("feeds and sitemap are served", async ({ request }) => {
  const feed = await request.get("/en/feed.xml");
  expect(feed.ok()).toBe(true);
  const xml = await feed.text();
  expect(xml).toContain("<rss");
  expect(xml).toContain("cnn-from-scratch");
  expect((await request.get("/sitemap.xml")).ok()).toBe(true);
});

test("flappy birds evolve past the first generation", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/posts/ai-flappy-bird");
  await expect(page.getByTestId("flappy-canvas")).toBeVisible();
  await expect(page.getByTestId("flappy-generation")).toHaveText("1");
  await page.getByRole("button", { name: "max", exact: true }).click();
  await expect(page.getByTestId("flappy-generation")).not.toHaveText("1", { timeout: 15_000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a trading bot can be trained, and the result survives a reload", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/posts/trading-agent");
  await expect(page.getByTestId("roi")).toHaveCount(0);
  await page.getByTestId("train").click();
  await expect(page.getByTestId("roi")).toHaveText(/^[+-]\d+\.\d\d$/, { timeout: 30_000 });
  const roi = await page.getByTestId("roi").textContent();

  await page.reload();
  await expect(page.getByTestId("roi")).toHaveText(roi!);
  await expect(page.getByText("Loaded the result of your last training run")).toBeVisible();
  expect(errors).toEqual([]);
});
