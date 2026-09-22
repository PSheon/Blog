import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * № 013, head-camera. While the article is a draft a production build leaves it out, the page is a 404, and every test
 * here skips itself; removing `draft: true` from both language files turns the file on. (The shared lists in
 * a11y.spec.ts and smoke.spec.ts cannot hold a page that does not exist yet.)
 */
const ZH = "/zh/posts/head-camera", EN = "/en/posts/head-camera";

test.beforeEach(async ({ request }) => {
  test.skip((await request.get(ZH)).status() === 404, "head-camera is still a draft");
});

test("fig. 01: the arm picks the block up and puts it on the pad, and again with the camera tilted 10°", async ({ page }) => {
  // Two whole episodes of a 48 px network, one step every 150 ms; with the whole suite running and WebGL in software an
  // episode that takes 6 s alone has taken over 40.
  test.setTimeout(240_000);
  await page.goto(ZH);
  const bench = page.getByTestId("headcam-pick");
  await bench.scrollIntoViewIfNeeded();
  // If the checkpoints or the 3D view failed to load, say so instead of timing out on the status.
  await expect(bench.locator("xpath=..").getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("headcam-pick-status")).toHaveText("放好了", { timeout: 90_000 });
  await expect(page.getByTestId("headcam-pick-count")).toHaveText("放好 1 次");
  // The picture-in-picture is the network's input: it has been painted, not left blank.
  const painted = await page.getByTestId("headcam-pick-eye").evaluate((c: HTMLCanvasElement) => new Set(c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data).size);
  expect(painted).toBeGreaterThan(20);
  await page.getByRole("slider", { name: "下傾" }).first().focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await page.getByTestId("headcam-pick-shuffle").click();
  await expect(page.getByTestId("headcam-pick-count")).toHaveText("放好 2 次", { timeout: 90_000 });
});

test("fig. 01: with the camera tilted 10° the never-shaken model does not place the block", async ({ page }) => {
  test.slow();
  await page.goto(ZH);
  await page.getByTestId("headcam-pick").scrollIntoViewIfNeeded();
  await page.getByTestId("headcam-pick-fixed").click();
  await page.getByRole("slider", { name: "下傾" }).first().focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
  await page.getByTestId("headcam-pick-shuffle").click();
  await page.waitForTimeout(12_000); // 80 steps: long enough for the shaken model to have finished twice over
  await expect(page.getByTestId("headcam-pick-status")).not.toHaveText("放好了");
});

test("fig. 02: a camera 5° off puts the blocks 8.8 cm away, and a straight camera puts them where they are", async ({ page }) => {
  await page.goto(ZH);
  const figure = page.getByTestId("headcam-offset").locator("xpath=..");
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toContainText("8.8");
  await figure.getByRole("slider", { name: "下傾" }).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await expect(figure).toContainText("0.0");
});

test("fig. 03: training starts in a worker, reports progress, and stops when asked", async ({ page }) => {
  await page.goto(ZH);
  const start = page.getByTestId("headcam-train");
  await start.scrollIntoViewIfNeeded();
  await start.click();
  const figure = page.getByTestId("headcam-probe").locator("xpath=../../../..");
  await expect(figure.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow", "0", { timeout: 30_000 });
  await figure.getByRole("button", { name: "停止" }).click();
  await expect(page.getByTestId("headcam-train")).toBeEnabled();
});

test("fig. 04: another scene moves the keypoints", async ({ page }) => {
  await page.goto(ZH);
  const shuffle = page.getByTestId("headcam-shuffle");
  await shuffle.scrollIntoViewIfNeeded();
  const dots = shuffle.locator("xpath=../..").locator("circle");
  await expect(dots).toHaveCount(16, { timeout: 15_000 });
  const before = await dots.first().getAttribute("cx");
  await shuffle.click();
  await expect.poll(async () => dots.first().getAttribute("cx")).not.toBe(before);
});

test("nothing heavy is fetched before the reader gets near an instrument", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(ZH, { waitUntil: "networkidle" });
  // fig. 01 is near the top, so its three checkpoints are wanted at once; the cut-down models further down are not.
  expect(requests.filter((url) => /head-camera\/(closed|fixed)\.json/.test(url))).toEqual([]);
});

for (const theme of ["dark", "light"] as const) {
  for (const path of [ZH, EN]) {
    test(`axe: ${path} (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await page.waitForTimeout(1500);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
}
