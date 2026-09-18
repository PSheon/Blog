import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  "/zh",
  "/en/posts",
  "/zh/tags",
  "/zh/posts/cnn-from-scratch",
  "/en/posts/ai-flappy-bird",
  "/zh/posts/trading-agent",
  "/en/posts/transformer-from-scratch",
  "/zh/posts/hydranet-fruit",
  "/en/posts/lite3-walking",
];

for (const theme of ["dark", "light"] as const) {
  for (const path of pages) {
    test(`axe: ${path} (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      // Let instruments mount and paint before judging contrast.
      await page.waitForTimeout(600);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× e.g. ${v.nodes[0].html.slice(0, 120)}`);
      expect(summary).toEqual([]);
    });
  }
}
