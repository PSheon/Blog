import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

export const pages = [
  "/zh",
  "/en/posts",
  "/zh/tags",
  "/zh/posts/cnn-from-scratch",
  "/en/posts/ai-flappy-bird",
  "/zh/posts/trading-agent",
  "/en/posts/transformer-from-scratch",
  "/zh/posts/hydranet-fruit",
  "/en/posts/lite3-walking",
  "/zh/posts/diffusion-points",
  "/en/posts/diffusion-points",
  "/zh/posts/slam-2d",
  "/en/posts/slam-2d",
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

/*
 * What axe does not look at: whether a control looks pressable and is big enough to press. Every article brings
 * its own buttons, so this runs on the same pages. The rules are written down in docs/DESIGN.md ("Interaction").
 */
for (const path of pages) {
  test(`controls show the hand, are 24 px or larger and have a name: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(600);
    const problems = await page.evaluate(() => {
      const controls = 'a[href], button, summary, select, input:not([type=hidden]), label[for], [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=option]';
      const found: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(controls)) {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        const box = el.getBoundingClientRect(), cs = getComputedStyle(el);
        // 1 × 1 is the skip link while it waits, clipped, for keyboard focus.
        if (box.width <= 1 || box.height <= 1 || cs.visibility === "hidden" || cs.pointerEvents === "none" || el.closest("[aria-hidden=true]")) continue;
        const where = `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" in ${el.closest("[data-instrument]")?.getAttribute("data-instrument") ?? "page"}`;
        const disabled = (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
        const typed = el.matches("input[type=text], input[type=search], input[type=number], input:not([type])");
        if (!disabled && !typed && cs.cursor !== "pointer") found.push(`cursor is "${cs.cursor}": ${where}`);
        const name = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || el.textContent?.trim() || ((el as HTMLInputElement).labels?.length ? "labelled" : "") || el.getAttribute("placeholder");
        if (!name) found.push(`no accessible name: ${where}`);
        // WCAG 2.2 SC 2.5.8. Exempt: links inside a sentence; a slider's hidden input (its 24 px control row is the
        // target); a checkbox inside its label (the label is). A ::before hit area counts, so probe the page.
        const exempt = (el.tagName === "A" && cs.display === "inline") || el.closest("[data-slot=slider]") || (el.tagName === "INPUT" && el.closest("label"));
        if (!exempt && (box.width < 24 || box.height < 24)) {
          const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
          const hits = (dx: number, dy: number) => { const t = document.elementFromPoint(cx + dx, cy + dy); return !!t && el.contains(t); };
          if (!(hits(-11, -11) && hits(11, 11))) found.push(`target ${Math.round(box.width)}×${Math.round(box.height)}: ${where}`);
        }
      }
      return [...new Set(found)];
    });
    expect(problems).toEqual([]);
  });
}
