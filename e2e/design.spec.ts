import { expect, test } from "@playwright/test";

/*
 * DESIGN.md §2 says `--input` is the edge of a pressable thing and holds 3:1 against every surface. That is a claim
 * about what the reader sees, so it is checked here rather than trusted.
 *
 * It has been broken once: the cva base in components/ui/button.tsx carried `border-transparent` and the outline
 * variant added `border-input`, two border-colour utilities whose winner is decided by CSS source order. `<Button>`
 * survived because it pipes through `cn()`, and the dark theme survived because `dark:border-input` sorts later —
 * so the only casualties were bare `buttonVariants({ variant: "outline" })` call sites on the light theme, which is
 * where the home page's secondary call to action lives.
 */
const PAGES = [
  { path: "/zh", name: /所有文章/ },
  { path: "/en", name: /All posts/ },
  // Outside both locales the 404 speaks both languages, and its English button is the outline one.
  { path: "/nope", name: /Back home/ },
];

/** sRGB relative luminance of an `rgb()`/`rgba()` string composited over `over`. */
function luminance(colour: string, over: [number, number, number]) {
  const [r, g, b, a = 1] = colour.match(/[\d.]+/g)!.map(Number);
  const mix = [r, g, b].map((channel, i) => channel * a + over[i] * (1 - a));
  const [lr, lg, lb] = mix.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

for (const theme of ["light", "dark"] as const) {
  for (const { path, name } of PAGES) {
    test(`outline buttons keep a visible edge: ${path} (${theme})`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const button = page.getByRole("link", { name }).first();
      await expect(button).toBeVisible();

      const { border, background } = await button.evaluate((element) => {
        const style = getComputedStyle(element);
        let behind = element.parentElement;
        let surface = "rgba(0, 0, 0, 0)";
        while (behind && /rgba\(0, 0, 0, 0\)/.test(surface)) {
          surface = getComputedStyle(behind).backgroundColor;
          behind = behind.parentElement;
        }
        return { border: style.borderTopColor, background: surface };
      });

      expect(border, "an outline button with no border colour is invisible on the light theme").not.toMatch(/rgba\(.*,\s*0\)/);
      const surface = background.match(/[\d.]+/g)!.map(Number) as [number, number, number];
      const [light, dark] = [luminance(border, surface), luminance(background, surface)].sort((a, b) => b - a);
      expect((light + 0.05) / (dark + 0.05), `${border} on ${background}`).toBeGreaterThanOrEqual(3);
    });
  }
}
