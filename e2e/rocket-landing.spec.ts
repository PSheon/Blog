import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/*
 * № 015, rocket-landing. The one figure does three things a reader can tell apart: it flies the built-in autopilot,
 * it searches for a new set of ten numbers, and it teaches a network to copy them. All three run in the browser, so
 * what is checked here is that they finish and produce numbers — and that the autopilot really does change how many
 * engines it lights on the way down, which is the article's whole point.
 */
const ZH = "/zh/posts/rocket-landing", EN = "/en/posts/rocket-landing";
const FIGURE = 'figure[data-instrument="starship / flip and land"]';

test.beforeEach(async ({ request }) => {
  test.skip((await request.get(ZH)).status() === 404, "rocket-landing is still a draft");
});

test("fig. 01: the autopilot lands, and changes engine count on the way", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(ZH);
  const figure = page.locator(FIGURE);
  await figure.scrollIntoViewIfNeeded();
  // Picking a pilot drops the ship straight away, so the button is already showing "pause".
  await figure.getByRole("button", { name: "內建的自動駕駛" }).click();
  await expect(figure.getByTestId("lander-go")).toContainText("暫停");

  // Watch the thrust readout until it lands, collecting every distinct "n × m%" it shows.
  const thrust = figure.getByTestId("lander-thrust");
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        seen.add(((await thrust.textContent()) ?? "").replace(/\s+/g, " ").trim());
        return (await figure.getByTestId("lander-status").textContent()) ?? "";
      },
      { timeout: 120_000, intervals: [250] },
    )
    .toContain("降落成功");

  const counts = new Set([...seen].map((s) => s.split("×")[0].trim()).filter(Boolean));
  // Coasting, and at least two different numbers of engines lit: it decides this itself.
  expect(counts).toContain("0");
  expect([...counts].filter((c) => c !== "0").length).toBeGreaterThan(1);
  await expect(figure.getByTestId("lander-score")).toContainText("成功 1 次");
});

test("fig. 01: training finds ten numbers and reports how often they land", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(ZH);
  const figure = page.locator(FIGURE);
  await figure.scrollIntoViewIfNeeded();
  await figure.getByTestId("lander-train").click();
  const progress = figure.getByTestId("lander-progress");
  await expect(progress).toBeVisible({ timeout: 60_000 });
  await expect(progress).toContainText("35", { timeout: 60_000 });
  // Ten named constants, each with a value.
  await expect(progress.locator("li")).toHaveCount(10);
  await expect(figure.getByRole("button", { name: "你訓練出來的" })).toBeEnabled();
});

test("fig. 01: a network can be taught, and it says how well it does", async ({ page }) => {
  // Cloning plus six DAgger rounds in a worker: about ten seconds alone, longer with the suite running.
  test.setTimeout(240_000);
  await page.goto(ZH);
  const figure = page.locator(FIGURE);
  await figure.scrollIntoViewIfNeeded();
  await figure.getByTestId("lander-teach").click();
  const net = figure.getByTestId("lander-net");
  await expect(net).toBeVisible({ timeout: 120_000 });
  await expect(net).toContainText("DAgger", { timeout: 180_000 });
  await expect(net).toContainText("%");
  await expect(figure.getByRole("button", { name: "你教的神經網路" })).toBeEnabled();
});

test("the ship's geometry is not fetched until the figure is on screen", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(ZH, { waitUntil: "networkidle" });
  expect(requests.filter((url) => /rocket-landing\/\w+\.bin/.test(url)).length).toBeLessThanOrEqual(1);
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
