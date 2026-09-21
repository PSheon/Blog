import { type Page, expect, test as base } from "@playwright/test";

/**
 * An article's instruments hydrate a moment after the page (their code is a chunk of its own), and a click that
 * lands before that is lost. A reader never clicks within 200 ms of the page appearing; a test does. So every
 * navigation here waits until each instrument in the page has come alive.
 */
const test = base.extend({
  page: async ({ page }, run) => {
    const goto = page.goto.bind(page), reload = page.reload.bind(page);
    const alive = () => page.waitForFunction(() => [...document.querySelectorAll("[data-lab]")].every((lab) => {
      const first = lab.firstElementChild;
      return !first || Object.keys(first).some((key) => key.startsWith("__reactFiber"));
    }), null, { timeout: 20_000 });
    page.goto = async (...args) => { const response = await goto(...args); await alive(); return response; };
    page.reload = async (...args) => { const response = await reload(...args); await alive(); return response; };
    await run(page);
  },
});

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
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/zh/tags/from-scratch</loc>");
  // A tag with one article is left out, and its page asks not to be indexed.
  expect(sitemap).not.toContain("/zh/tags/llm</loc>");
  expect(await (await request.get("/zh/tags/llm")).text()).toContain('content="noindex, follow"');
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
    // Every page shares with a picture: its own card for the home page and an article, the site's for the rest.
    const card = new URL((await page.locator('meta[property="og:image"]').first().getAttribute("content"))!).pathname;
    expect(card).toBe(path.includes("/posts/") ? `${path}/opengraph-image` : `${path.slice(0, 3)}/opengraph-image`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{20,}/);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("a URL that matches nothing gets the site's own 404, in the language of the URL", async ({ page }) => {
  // A page that matches no route, an article that does not exist, a tag nobody used: all three end in the same 404.
  for (const [url, title, other, home] of [
    ["/zh/no-such-page/at-all", "找不到這一頁", "Page not found", "/zh"],
    ["/en/posts/pcb-flip-", "Page not found", "找不到這一頁", "/en"],
    ["/en/tags/no-such-tag", "Page not found", "找不到這一頁", "/en"],
  ] as const) {
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(404);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(title);
    await expect(heading).not.toContainText(other); // it used to say both at once
    await expect(page.getByTestId("not-found").getByRole("link")).toHaveAttribute("href", home);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

test("URLs outside both locales get the site's own 404 too, styled and themed", async ({ page }) => {
  for (const url of ["/no-such-page", "/no-such/page/at-all"]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(404);
    // Nothing in such a URL says which language the reader wants, so this one speaks both.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("找不到這一頁");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
    // The framework's fallback is black on white; ours carries the stylesheet and the default dark theme.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(7, 9, 24)");
  }
});

test("the home page describes the blog to search engines and has an icon iOS can use", async ({ page }) => {
  await page.goto("/en");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld).toMatchObject({ "@type": "Blog", inLanguage: "en", author: { "@type": "Person" } });
  expect(ld.blogPost.length).toBeGreaterThan(3);
  const icon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await page.request.get(icon!)).headers()["content-type"]).toBe("image/png");
});

test("on a phone the hero instrument is on the first screen and small controls are easy to hit", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await page.goto("/zh");
  const figure = await page.locator("figure[data-instrument]").first().boundingBox();
  expect(figure!.y).toBeLessThan(page.viewportSize()!.height * 0.5);

  // A sidenote marker is a 7×12 px digit; a tap 9 px off its centre still has to open the note.
  await page.goto("/zh/posts/diffusion-points");
  const marker = page.locator("button.sidenote-ref").first();
  await marker.scrollIntoViewIfNeeded();
  const box = (await marker.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 9, box.y + box.height / 2 + 8);
  await expect(marker).toHaveAttribute("aria-expanded", "true");
  // Sliders: the touchable row is at least 24 px tall, not the 12 px of the thumb.
  const control = await page.locator("[data-slot=slider] > div").first().boundingBox();
  expect(control!.height).toBeGreaterThanOrEqual(24);
});

test("on a phone the outline sticks under the header, names the section being read, and closes after a jump", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the outline is a side column on wide screens");
  await page.goto("/zh/posts/lite3-walking");
  const bar = page.getByTestId("toc-bar");
  await page.evaluate(() => window.scrollTo({ top: 2600, behavior: "instant" }));
  await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBe(56); // right under the 56 px header
  const toggle = bar.getByRole("button");
  await expect(toggle).not.toHaveText(/^本頁目錄\s*\+?$/);
  // Closed, the list takes no room and cannot be tabbed into; opening unfolds it over time instead of popping.
  const panel = bar.locator(".toc-panel");
  expect((await panel.boundingBox())!.height).toBe(0);
  await expect(panel).toHaveAttribute("inert", "");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await panel.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("grid-template-rows");
  await bar.getByRole("link", { name: "推它" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await panel.boundingBox())!.height).toBe(0);
  await expect(toggle).toContainText("推它", { timeout: 10_000 });
  // The heading lands below the bar, not underneath it.
  const heading = (await page.getByRole("heading", { name: "推它" }).boundingBox())!, box = (await bar.boundingBox())!;
  expect(heading.y).toBeGreaterThan(box.y + box.height);
});

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
  expect(response?.status()).toBe(200);
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
  expect(response?.status()).toBe(200);
  test.setTimeout(120_000);
  const errors = watchErrors(page);

  await expect(page.locator("[data-instrument]")).toHaveCount(5);
  await expect(page.getByTestId("diffusion-steps")).toHaveText("0");
  await page.getByTestId("diffusion-train").click();
  await expect.poll(async () => Number((await page.getByTestId("diffusion-steps").textContent())!.replace(/,/g, "")), { timeout: 90_000 }).toBeGreaterThan(200);
  await page.getByTestId("diffusion-train").click();

  // The step-by-step instrument samples from the model trained above, not from one of its own.
  // …and it refreshes by itself on scrolling into view: it once showed a run from before Train was pressed.
  await page.getByTestId("diffusion-sample").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("diffusion-steps-note")).toContainText(/訓練了 [\d,]{3,} 步/, { timeout: 20_000 });
  // An early guess of the result is a blob, and the instrument says that this is right.
  await page.getByTestId("diffusion-guess").click();
  await page.locator('[data-instrument="diffusion / steps"]').getByRole("slider").focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("diffusion-guess-hint")).toContainText("平均");

  // Choosing another fruit throws the model away: it knows nothing about the new one.
  await page.locator('[data-instrument="diffusion / train"]').getByRole("button", { name: "草莓" }).first().click();
  await expect(page.getByTestId("diffusion-steps")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("one visit is enough to read offline: the first page, an article reached by a link, and the app's start URL", async ({ page, context }) => {
  test.setTimeout(120_000);
  // Has the worker been handed this page and every script it loaded? (It sees none of them on a first visit.)
  const kept = () => page.evaluate(async () => {
    if (!(await caches.match(location.pathname))) return false;
    const scripts = performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.includes("/_next/static/") && url.endsWith(".js"));
    return scripts.length > 0 && (await Promise.all(scripts.map((url) => caches.match(url)))).every(Boolean);
  });
  await page.goto("/en");
  await expect.poll(kept, { timeout: 30_000 }).toBe(true);
  // A client-side navigation fetches an RSC payload, not the HTML that a reload asks for. That has to be kept too.
  await page.locator('main a[href="/en/posts/transformer-from-scratch"]').first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Transformer");
  await expect.poll(kept, { timeout: 30_000 }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Transformer");
  await page.getByTestId("tf-train").click();
  await expect.poll(async () => Number((await page.getByTestId("tf-steps").textContent())!.replace(/,/g, "")), { timeout: 60_000 }).toBeGreaterThan(20);

  // "/" is where the installed app starts. It is a redirect by language, which cannot be cached; the home page can.
  await page.goto("/");
  await expect(page.getByTestId("post-bento")).toBeVisible();

  // A page never visited has nothing cached: the reader gets the offline page, not the browser's error.
  await page.goto("/en/posts/ai-flappy-bird");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("offline");
  await context.setOffline(false);
});

test("the site can be installed: a manifest with icons, and a worker script that is never cached", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/", id: "/", lang: "zh-Hant-TW" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
});

test.describe("navigation progress", () => {
  // Requests answered by the service worker never reach page.route, so this one test runs without it.
  test.use({ serviceWorkers: "block" });

  test("a slow navigation shows a progress bar, which goes away on arrival", async ({ page }) => {
    // Hold back everything about the posts page, prefetches included, until the bar has been seen. A navigation
    // that is already prefetched is instant and, rightly, never shows it.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/en\/posts(\?|$)/, async (route) => { await gate; await route.continue(); });
    await page.goto("/en");
    await page.locator('main a[href="/en/posts"]').first().click();
    await expect(page.getByTestId("nav-progress")).toBeVisible();
    release();
    await expect(page).toHaveURL(/\/en\/posts$/);
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });
});

test("a car maps a corridor, closes the loop, and takes a failure mode from the comparison below", async ({ page }) => {
  const response = await page.goto("/zh/posts/slam-2d");
  expect(response?.status()).toBe(200);
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" }); // the hand-off below scrolls; don't make it a smooth scroll
  const errors = watchErrors(page);
  const number = async (id: string) => Number((await page.getByTestId(id).first().textContent())!.match(/[\d.]+/)![0]);

  await expect(page.locator("[data-instrument]")).toHaveCount(6);
  const autopilot = page.getByTestId("slam-autopilot"), idle = await autopilot.textContent();
  await autopilot.scrollIntoViewIfNeeded();
  // A click that lands before the lab has hydrated is lost (seen once on a slow CI runner: no lap in 150 s).
  // The label flips when autopilot is on, so click until it has.
  await expect(async () => {
    if ((await autopilot.textContent()) === idle) await autopilot.click();
    await expect(autopilot).not.toHaveText(idle!, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  // One lap on autopilot: the first loop closure pulls the estimate back onto the truth.
  await expect.poll(() => number("slam-closures"), { timeout: 150_000 }).toBeGreaterThan(0);
  await expect.poll(() => number("slam-error"), { timeout: 20_000 }).toBeLessThan(0.5);

  // The four outcomes are worked out in the page once they scroll into view.
  const cards = page.locator('[data-instrument="slam / four ways to fail"]');
  await cards.scrollIntoViewIfNeeded();
  await expect(cards).not.toContainText("計算中", { timeout: 120_000 });
  const withCamera = Number((await page.getByTestId("slam-outcome-camera").textContent())!.match(/([\d.]+) m/)![1]);
  const without = Number((await page.getByTestId("slam-outcome-drift").textContent())!.match(/([\d.]+) m/)![1]);
  expect(withCamera).toBeLessThan(0.5);
  expect(without).toBeGreaterThan(3);

  // A card hands its setting to the car at the top of the article.
  await page.getByTestId("slam-outcome-wrong").getByRole("button").click();
  await expect(page.getByTestId("slam-preset")).toContainText("認錯一次");
  expect(errors).toEqual([]);
});

test("loading the home page plays no page transition: a late-loading demo is not a navigation", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: number };
    w.__vt = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) document.startViewTransition = ((...args: Parameters<typeof original>) => (w.__vt++, original(...args))) as typeof document.startViewTransition;
  });
  await page.goto("/zh");
  // The hero demo arrives after hydration (next/dynamic). Wait for it, then for anything it might have set off.
  await expect(page.locator("main canvas").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(0);
});

test("the home index is a short bento: at most six tiles, each saying what its article is about on a phone", async ({ page, isMobile }) => {
  await page.goto("/zh");
  const tiles = page.getByTestId("post-bento").locator("> li");
  expect(await tiles.count()).toBeLessThanOrEqual(6);
  if (!isMobile) return;
  for (const tile of await tiles.all()) await expect(tile.locator("p.leading-relaxed")).toBeVisible();
});

test("a 3D figure follows the theme: switching to light re-inks a scene that was built in the dark", async ({ page, isMobile }) => {
  test.skip(isMobile, "the theme buttons are in the footer on wide screens and in the menu on a phone; one is enough");
  await page.goto("/zh/posts/slam-2d");
  const figure = page.locator('[data-instrument="slam / wheels"]'), canvas = figure.locator("canvas");
  await figure.scrollIntoViewIfNeeded();
  // The scene records the ink it is drawn in; it has to keep up with the CSS colour of its canvas.
  const drawn = () => canvas.getAttribute("data-ink"), page_ink = () => canvas.evaluate((el) => {
    const [r, g, b] = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number);
    return [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  });
  await page.getByRole("button", { name: "深色" }).first().click();
  await expect.poll(drawn, { timeout: 20_000 }).not.toBeNull();
  const dark = await drawn();
  expect(dark).toBe(await page_ink());
  await page.getByRole("button", { name: "淺色" }).first().click();
  await expect.poll(drawn, { timeout: 10_000 }).not.toBe(dark);
  expect(await drawn()).toBe(await page_ink());
});

test("pages are served with a content security policy, and nothing on an article trips it", async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  page.on("console", (m) => m.text().startsWith("CSP ") && violations.push(m.text()));
  const response = await page.goto("/zh/posts/diffusion-points"); // KaTeX, a module worker, three.js
  const policy = response!.headers()["content-security-policy"];
  for (const part of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'"]) expect(policy).toContain(part);
  expect(response!.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  await page.getByTestId("diffusion-train").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  expect(violations).toEqual([]);
});

test("a city of people runs in the page: the clock moves, the three heads differ, the Overseer follows and replays", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const response = await page.goto("/zh/posts/city-of-agents");
  expect(response?.status()).toBe(200);
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await expect(page.locator("[data-instrument]")).toHaveCount(5);

  // The two 2-D figures work the simulation out in the page. A fixed timetable sends everyone out in the same ten minutes.
  await page.getByTestId("modes-fsm").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("modes-fsm")).toContainText("100%", { timeout: 60_000 });
  await expect(page.getByTestId("modes-utility")).toContainText("%", { timeout: 60_000 });
  await expect(page.getByTestId("modes-utility")).not.toContainText("100%");

  // The Overseer: the table fills, a row follows a person, the record replays and comes back.
  await page.getByTestId("city-play").scrollIntoViewIfNeeded();
  const table = page.getByTestId("city-table");
  await expect(table.locator("button").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("city-events").locator("li").nth(3)).toBeVisible({ timeout: 30_000 });
  await table.locator("button").nth(1).click();
  await expect(page.getByRole("status").filter({ hasText: "正在跟拍" })).toBeVisible();
  const thumb = page.getByTestId("city-timeline").locator('input[type="range"]');
  await thumb.focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("city-live")).toBeEnabled();
  await page.getByTestId("city-live").click();
  await expect(page.getByTestId("city-live")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("the hero is four stations: each tab shows a different live model and the page does not move", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/zh");
  await expect(page.getByTestId("hero-prediction")).toHaveText("7", { timeout: 20_000 });
  const figure = page.locator("figure[data-instrument]").first(), height = async () => Math.round((await figure.locator("[role=tabpanel]").boundingBox())!.height);
  const before = await height();

  // Think: a Transformer trains from random weights until it writes the digits backwards.
  await page.getByTestId("hero-tab-think").click();
  await expect(page.getByTestId("hero-think-output")).toHaveText("951413", { timeout: 60_000 });
  expect(await height()).toBe(before);
  // Arrow keys move between the tabs, as a tablist should.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("hero-tab-generate")).toHaveAttribute("aria-selected", "true");
  await expect(figure.locator("[role=tabpanel] canvas:visible")).toHaveCount(1);
  expect(await height()).toBe(before);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("hero-tab-act")).toHaveAttribute("aria-selected", "true");
  await expect(figure.locator("figcaption a")).toHaveAttribute("href", "/zh/posts/ai-flappy-bird");
  expect(await height()).toBe(before);
  // The rail under the hero is the same control: a stop switches the instrument, and the instrument's tabs light the stop.
  await page.getByTestId("rail-think").click();
  await expect(page.getByTestId("hero-tab-think")).toHaveAttribute("aria-selected", "true");
  await expect(figure).toBeInViewport();
  await page.getByTestId("hero-tab-act").click();
  await expect(page.getByTestId("rail-act")).toHaveAttribute("aria-pressed", "true");
  // A stop is still a way to the articles of its kind.
  await expect(page.locator('nav a[href="/zh/tags/ai-agent"]')).toHaveCount(1);
  // Back to the classifier: it kept its state underneath.
  await page.getByTestId("hero-tab-see").click();
  await expect(page.getByTestId("hero-prediction")).toHaveText("7");
  expect(errors).toEqual([]);
});

for (const locale of ["zh", "en"] as const) {
  test(`the hero instrument fits its screen in ${locale}: no tab, panel or picture is cut off at any station`, async ({ page }) => {
    await page.goto(`/${locale}`);
    // The narrowest phones as well as whatever this project's viewport is: four English tab names in one line once
    // made the instrument 434 px wide on a 390 px screen.
    const widths = [page.viewportSize()!.width, 320];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      for (const key of ["see", "think", "generate", "act"]) {
        await page.getByTestId(`hero-tab-${key}`).click();
        const problems = await page.evaluate(() => {
          const figure = document.getElementById("hero-instrument")!, box = figure.querySelector(".overflow-hidden")!.getBoundingClientRect();
          const panel = figure.querySelector("[role=tabpanel]")!, p = panel.getBoundingClientRect(), found: string[] = [];
          if (box.left < -0.5 || box.right > window.innerWidth + 0.5) found.push(`instrument ${Math.round(box.left)}..${Math.round(box.right)} on a ${window.innerWidth} px screen`);
          if (document.documentElement.scrollWidth > window.innerWidth) found.push("the page scrolls sideways");
          for (const tab of figure.querySelectorAll("[role=tab]")) {
            const t = tab.getBoundingClientRect();
            if (t.right > box.right + 0.5 || t.left < box.left - 0.5 || tab.scrollWidth > tab.clientWidth + 1) found.push(`tab cut off: ${tab.textContent}`);
          }
          for (const el of panel.querySelectorAll("*")) {
            if (getComputedStyle(el).visibility === "hidden") continue;
            const b = el.getBoundingClientRect();
            if (b.width && b.height && (b.right > p.right + 1 || b.bottom > p.bottom + 1)) found.push(`${el.tagName.toLowerCase()} sticks out of the panel`);
          }
          return [...new Set(found)];
        });
        expect(problems, `${width} px, ${key}`).toEqual([]);
      }
    }
  });
}

test("three progress bars watch a job and disagree; a fourth learns", async ({ page }) => {
  const response = await page.goto("/zh/posts/task-scheduler");
  expect(response?.status()).toBe(200);
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await expect(page.locator("[data-instrument]")).toHaveCount(6);

  // The step-through: rule 2 hands tasks to workers; a running task can be made to fail and is ready again at once.
  const graph = page.getByTestId("graph-lab");
  await graph.scrollIntoViewIfNeeded();
  await graph.getByTestId("graph-step").click();
  await expect(graph.getByTestId("graph-status")).toContainText("規則 2");
  const running = graph.locator('[data-testid^="node-running-"]').first();
  await running.click();
  await expect(graph.getByTestId("graph-status")).toContainText("規則 4");

  // Failures: with one attempt in five failing, the averaged jobs report failed attempts and wasted time.
  const fail = page.getByTestId("fail-lab");
  await fail.scrollIntoViewIfNeeded();
  await expect(fail.getByRole("status")).toContainText("150", { timeout: 40_000 });
  await expect.poll(async () => Number.parseFloat(await fail.locator(".tabular").nth(2).innerText()), { timeout: 40_000 }).toBeGreaterThan(5); // failed attempts per job
  await page.getByTestId("race-start").scrollIntoViewIfNeeded();

  // The opener: the bars start at zero, and once the job is over all of them say 100.
  await expect(page.getByTestId("race-count")).toContainText("0%");
  await page.getByTestId("race-start").click();
  await expect(page.getByTestId("race-time")).toContainText("100%", { timeout: 40_000 });
  for (const bar of ["count", "work", "plan"]) await expect(page.getByTestId(`race-${bar}`)).toContainText("100%");

  // The averaged figures finish their 150 jobs; learning makes the forecast more honest than the plan alone.
  const learn = page.getByTestId("learn-lab");
  await learn.scrollIntoViewIfNeeded();
  await expect(learn.getByRole("status")).toContainText("150", { timeout: 40_000 });
  await page.getByTestId("learn-toggle").check();
  // Wait for the rerun that includes the learning bar to finish, then read the two averages.
  const value = async (bar: string) => Number.parseFloat(await learn.locator(`[data-testid="off-${bar}"][data-done="true"] .tabular`).innerText({ timeout: 40_000 }));
  const plan = await value("plan"), learned = await value("learn");
  expect(plan).toBeGreaterThan(5);
  expect(learned).toBeLessThan(plan * 0.7);
  expect(errors).toEqual([]);
});

test("a picture clears from noise on the reader's GPU, or the figure says why it cannot", async ({ page }) => {
  const response = await page.goto("/zh/posts/light-from-noise");
  // The article is a draft until Paul publishes it; drafts are left out of production builds.
  test.skip(response?.status() === 404, "light-from-noise is still a draft");
  const errors = watchErrors(page);
  const figure = page.locator('[data-instrument="light / converge"]');
  await figure.scrollIntoViewIfNeeded();
  const adapter = await page.evaluate(async () => ("gpu" in navigator ? Boolean(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()) : false));
  if (!adapter) {
    // CI has no GPU. Say so where a reader of the report will see it, and check what a reader without one is shown.
    test.info().annotations.push({ type: "NO WEBGPU ADAPTER", description: "the GPU path tracer did not run; checked the fallback picture, its message and the CPU paths" });
    await expect(figure.getByTestId("light-status")).toContainText(/WebGPU/);
    await expect(figure.getByTestId("light-canvas-fallback")).toBeVisible(); // the finished picture stands in
    // The one-path figure is the CPU's: it has to work over the fallback picture.
    const path = page.locator('[data-instrument="light / one path"]');
    await path.scrollIntoViewIfNeeded();
    await path.getByTestId("light-shoot-100").click();
    await expect.poll(async () => Number((await path.getByTestId("light-paths").textContent())!.replace(/\D/g, ""))).toBeGreaterThan(100);
    expect(errors).toEqual([]);
    return;
  }
  const spp = async () => Number((await figure.getByTestId("light-spp").textContent())!.replace(/\D/g, "") || 0);
  await page.waitForTimeout(600);
  expect(await spp()).toBe(1); // one sample to look at, then it waits for the reader
  await figure.getByTestId("light-toggle").click();
  await expect.poll(spp, { timeout: 30_000 }).toBeGreaterThan(64);
  await figure.getByTestId("light-toggle").click(); // pause: the count stops
  const held = await spp();
  await page.waitForTimeout(600);
  expect(await spp()).toBe(held);
  expect(errors).toEqual([]);
});
