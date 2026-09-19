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

test("search is full-text, highlights the match and jumps to the section", async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await page.goto("/en");
  // The shortcut listener attaches on hydration; the hero prediction only appears after it.
  await expect(page.getByTestId("hero-prediction")).toHaveText("7");
  if (isMobile) await page.getByRole("button", { name: "Search" }).click();
  else await page.keyboard.press("ControlOrMeta+k");

  const input = page.getByPlaceholder(/Search the full text/);
  // Before typing: every post is listed.
  await expect(page.getByRole("option", { name: /CNN from scratch/ })).toBeVisible();

  // "occlusion" appears only in body text and a heading of the CNN article — never in a title.
  await input.fill("occlusion");
  const first = page.getByRole("option").first();
  await expect(first.locator("mark").first()).toHaveText(/occlusion/i);
  await first.click();
  await expect(page).toHaveURL(/\/en\/posts\/cnn-from-scratch#/);
  expect(errors).toEqual([]);
});

test("search says so when nothing matches, and finds Chinese by substring", async ({ page, isMobile }) => {
  await page.goto("/zh");
  await expect(page.getByTestId("hero-prediction")).toHaveText("7");
  if (isMobile) await page.getByRole("button", { name: "搜尋" }).click();
  else await page.keyboard.press("/");
  const input = page.getByPlaceholder(/搜尋全文/);
  await input.fill("qzxv");
  await expect(page.getByText("找不到「qzxv」")).toBeVisible();
  await input.fill("池化");
  await expect(page.getByRole("option").first()).toContainText("ReLU 與池化");
});

test("feeds and sitemap are served", async ({ request }) => {
  const feed = await request.get("/en/feed.xml");
  expect(feed.ok()).toBe(true);
  const xml = await feed.text();
  expect(xml).toContain("<rss");
  expect(xml).toContain("cnn-from-scratch");
  expect((await request.get("/sitemap.xml")).ok()).toBe(true);
});

// Next replaces `alternates` and `openGraph` wholesale when a page sets them, which once cost article
// pages their RSS link and list pages their hreflang. Every kind of page has to carry the full set.
for (const path of ["/zh", "/en/posts", "/zh/tags", "/en/tags/robotics", "/en/posts/lite3-walking"]) {
  test(`search engines get canonical, hreflang, feed and Open Graph on ${path}`, async ({ page }) => {
    await page.goto(path);
    const href = (selector: string) => page.locator(selector).getAttribute("href");
    const other = path.startsWith("/zh") ? path.replace("/zh", "/en") : path.replace("/en", "/zh");
    expect(new URL((await href('link[rel="canonical"]'))!).pathname).toBe(path);
    expect(new URL((await href(`link[rel="alternate"][hreflang="${path.startsWith("/zh") ? "en" : "zh-Hant-TW"}"]`))!).pathname).toBe(other);
    expect(new URL((await href('link[rel="alternate"][hreflang="x-default"]'))!).pathname).toBe(path.replace(/^\/(zh|en)/, "/zh"));
    expect(await href('link[rel="alternate"][type="application/rss+xml"]')).toContain(`${path.slice(0, 3)}/feed.xml`);
    expect(new URL((await page.locator('meta[property="og:url"]').getAttribute("content"))!).pathname).toBe(path);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "paul.notebook");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("maths is drawn once: the TeX source kept for screen readers stays invisible", async ({ page }) => {
  await page.goto("/zh/posts/lite3-walking");
  const hidden = page.locator(".katex-mathml");
  expect(await hidden.count()).toBeGreaterThan(5);
  // KaTeX ships the MathML copy clipped to a pixel; without its stylesheet every formula shows up twice.
  for (const box of await hidden.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]))) {
    expect(Math.max(...box)).toBeLessThanOrEqual(1);
  }
});

test("an article describes itself to search engines as a BlogPosting with an image", async ({ page }) => {
  await page.goto("/en/posts/lite3-walking");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ "@type": "BlogPosting", inLanguage: "en", keywords: expect.stringContaining("robotics") });
  // The absolute URL carries the canonical origin, which is not where the test server listens.
  expect((await page.request.get(new URL(ld.image).pathname)).headers()["content-type"]).toBe("image/png");
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

test("a transformer trains in the page and learns to reverse digits", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/en/posts/transformer-from-scratch");
  await expect(page.getByTestId("tf-steps")).toHaveText("0");
  await expect(page.getByTestId("tf-reading")).toContainText("Before training");
  await page.getByTestId("tf-train").click();
  await expect(page.getByTestId("tf-accuracy")).toHaveText("100", { timeout: 45_000 });
  await page.getByTestId("tf-train").click(); // pause

  // The live answer on the task card is now right, and the caption explains the map that produced it.
  await expect(page.getByTestId("tf-output")).toHaveText("951413");
  await expect(page.getByTestId("tf-reading")).toContainText("“9”");

  // A fresh random problem is answered correctly too: it learned the rule, not the example.
  await page.getByRole("button", { name: "Another one" }).click();
  await expect(page.getByTestId("tf-output").locator(".text-signal-2")).toHaveCount(0);
  await expect(page.getByTestId("tf-output").locator(".text-signal")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("phone header: menu left, mark centred, search right; drawer holds navigation and preferences", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/en/posts/cnn-from-scratch");
  const menu = page.getByRole("button", { name: "Menu" });
  const logo = page.getByRole("link", { name: /paul\.notebook/ }).first();
  const width = page.viewportSize()!.width;
  const m = (await menu.boundingBox())!;
  const l = (await logo.boundingBox())!;
  expect(m.x).toBeLessThan(40);
  const sb = (await page.getByRole("button", { name: "Search" }).boundingBox())!;
  expect(width - (sb.x + sb.width)).toBeLessThan(40);
  expect(Math.abs(l.x + l.width / 2 - width / 2)).toBeLessThan(2);

  await menu.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("link", { name: "Posts" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Dark" })).toBeVisible();
  await drawer.getByRole("link", { name: /English|中文/ }).first().waitFor();
  await drawer.getByRole("link", { name: "Tags" }).click();
  await expect(page).toHaveURL(/\/en\/tags$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a HydraNet learns to box and mask emoji fruit in the page", async ({ page }) => {
  const response = await page.goto("/en/posts/hydranet-fruit");
  // The article is a draft until Paul publishes it; drafts are left out of production builds.
  test.skip(response?.status() === 404, "hydranet-fruit is still a draft");
  test.setTimeout(120_000);
  const errors = watchErrors(page);

  await expect(page.locator("[data-instrument]")).toHaveCount(3);
  await expect(page.getByTestId("hy-seen")).toHaveText("0");
  await expect(page.getByTestId("hy-reading")).toContainText("Not learned yet");
  await page.getByTestId("hy-train").click();
  // Works with emoji or with the shape fallback (headless Linux has no colour emoji font).
  await expect.poll(async () => Number(await page.getByTestId("hy-box").textContent()), { timeout: 90_000 }).toBeGreaterThan(0.6);
  // The two heads do not learn at the same pace, and on the shape fallback the mask trails the box: wait for it
  // too instead of reading it the moment the box is good enough (that failed on CI and, once, locally).
  await expect.poll(async () => Number(await page.getByTestId("hy-mask").textContent()), { timeout: 90_000 }).toBeGreaterThan(0.4);
  await page.getByTestId("hy-train").click();
  expect(errors).toEqual([]);
});

test("the Lite3 walks in the page and falls over when its joint angles are blindfolded", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const response = await page.goto("/zh/posts/lite3-walking");
  expect(response?.status()).toBe(200);
  test.setTimeout(120_000);
  const errors = watchErrors(page);

  // About 4.5 MB of simulator: none of it may load before the reader asks.
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => /lite3\/|mujoco/.test(url))).toEqual([]);

  await page.getByRole("button", { name: /載入模擬器/ }).first().click();
  const remote = page.locator('[data-stage="remote"]'), senses = page.locator('[data-stage="senses"]');
  await expect(remote).toHaveAttribute("data-here", "true", { timeout: 60_000 });
  await expect(page.getByTestId("lite3-forward")).toContainText(/→ 0\.[45]\d/, { timeout: 30_000 });

  // One robot, one canvas: it moves to whichever instrument is on screen.
  await senses.scrollIntoViewIfNeeded();
  await senses.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(senses).toHaveAttribute("data-here", "true", { timeout: 20_000 });
  await expect(page.getByTestId("lite3-stage")).toHaveCount(1);
  await page.getByRole("button", { name: /蒙住: 關節角度/ }).click();
  await expect(senses).toContainText("倒了", { timeout: 15_000 });

  // A 400 N shove always topples it (measured: everything from 275 N up does).
  const push = page.locator('[data-stage="push"]');
  await push.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect(push).toHaveAttribute("data-here", "true", { timeout: 20_000 });
  await page.locator('[data-instrument="lite3 / push"]').getByRole("slider").focus();
  await page.keyboard.press("End");
  await page.getByTestId("lite3-push-away").click();
  await expect(page.getByTestId("lite3-push-log")).toContainText("400 N", { timeout: 5_000 });
  await expect(page.getByTestId("lite3-push-log")).toContainText("倒了", { timeout: 15_000 });
  await expect(page.locator("[data-instrument]")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("a diffusion model trains in the page and its instruments share it", async ({ page }) => {
  const response = await page.goto("/zh/posts/diffusion-points");
  // The article is a draft until Paul publishes it; drafts are left out of production builds.
  test.skip(response?.status() === 404, "diffusion-points is still a draft");
  test.setTimeout(120_000);
  const errors = watchErrors(page);

  await expect(page.locator("[data-instrument]")).toHaveCount(5);
  await expect(page.getByTestId("diffusion-steps")).toHaveText("0");
  await page.getByTestId("diffusion-train").click();
  await expect.poll(async () => Number((await page.getByTestId("diffusion-steps").textContent())!.replace(/,/g, "")), { timeout: 90_000 }).toBeGreaterThan(200);
  await page.getByTestId("diffusion-train").click();

  // The step-by-step instrument samples from the model trained above, not from one of its own.
  await page.getByTestId("diffusion-sample").scrollIntoViewIfNeeded();
  await page.getByTestId("diffusion-sample").click();
  await expect(page.locator('[data-instrument="diffusion / steps"]')).toContainText(/訓練了 [\d,]{3,} 步/);

  // Choosing another fruit throws the model away: it knows nothing about the new one.
  await page.locator('[data-instrument="diffusion / train"]').getByRole("button", { name: "草莓" }).first().click();
  await expect(page.getByTestId("diffusion-steps")).toHaveText("0");
  expect(errors).toEqual([]);
});
