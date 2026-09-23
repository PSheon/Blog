import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/*
 * № 014, music-ai. The figures make sound, which CI cannot hear; what is checked here is everything around it —
 * that training really runs and produces a score, that a pick changes the model, and that the blind test keeps its
 * answers to itself until the reader has guessed.
 */
const ZH = "/zh/posts/music-ai", EN = "/en/posts/music-ai";

test.beforeEach(async ({ request }) => {
  test.skip((await request.get(ZH)).status() === 404, "music-ai is still a draft");
});

test("fig. 01: training writes a score and measures it", async ({ page }) => {
  // A hundred steps of a 65k-parameter Transformer in a worker: about 7 s alone, much more with the suite running.
  test.setTimeout(180_000);
  await page.goto(ZH);
  const figure = page.locator('figure[data-instrument="composer / train"]');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.getByRole("alert")).toHaveCount(0);
  await figure.getByTestId("music-train").click();
  // Step 0's noodling arrives before any training, then the first real snapshot.
  await expect(figure.getByRole("button", { name: /第 0 步/ })).toBeVisible({ timeout: 60_000 });
  await expect(figure.getByRole("button", { name: /第 100 步/ })).toBeVisible({ timeout: 120_000 });
  // The roll is drawn from what it wrote: notes, not an empty box.
  await expect(figure.locator("svg[role=img] rect").first()).toBeVisible();
  await expect(figure.getByTestId("music-report")).toContainText("%");
  await figure.getByRole("button", { name: "停止訓練" }).click();
  await expect(figure.getByTestId("music-train")).toBeVisible();
});

test("fig. 02: a pick tunes the model and the numbers say what changed", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(ZH);
  const figure = page.locator('figure[data-instrument="composer / judge"]');
  await figure.scrollIntoViewIfNeeded();
  await figure.getByTestId("music-judge-load").click();
  await expect(figure.getByTestId("music-pick-0")).toBeEnabled({ timeout: 60_000 });
  await figure.getByTestId("music-pick-0").click();
  await expect(figure.getByTestId("music-judge-stats")).toContainText("→", { timeout: 60_000 });
  await expect(figure.getByText(/你已經選了 1 次/)).toBeVisible();
});

test("fig. 03: the blind test hides the answers until all three are guessed", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(ZH);
  const figure = page.locator('figure[data-instrument="composer / blind"]');
  await figure.scrollIntoViewIfNeeded();
  await figure.getByTestId("music-blind-deal").click();
  await expect(figure.getByTestId("music-blind-play-2")).toBeVisible({ timeout: 60_000 });
  // Nothing on screen says who wrote what, and the rolls are not drawn yet ("對答案" is the button, "答案:" is the reveal).
  await expect(figure.getByText(/答案:/)).toHaveCount(0);
  await expect(figure.locator("svg[role=img]")).toHaveCount(0);
  await expect(figure.getByTestId("music-blind-reveal")).toBeDisabled();
  // The guesses live in a fieldset each; the timbre picker is a group too, so ask for the fieldsets.
  for (let i = 0; i < 3; i++) await figure.locator("fieldset").nth(i).getByRole("button", { name: "巴赫" }).click();
  await figure.getByTestId("music-blind-reveal").click();
  await expect(figure.getByTestId("music-blind-score")).toContainText("/ 3");
  await expect(figure.locator("svg[role=img]")).toHaveCount(3);
});

test("nothing heavy is fetched before the reader asks for it", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(ZH, { waitUntil: "networkidle" });
  // The chorales and the trained model arrive on Start training / Load, not with the article.
  expect(requests.filter((url) => /music-ai\/\w+\.bin/.test(url))).toEqual([]);
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
