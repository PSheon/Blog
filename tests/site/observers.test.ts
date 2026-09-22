import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * An IntersectionObserver hands its callback a batch of entries, oldest first. Under load one batch can carry "left the
 * screen" and then "came back"; a callback that reads only the first entry decides the figure is off screen while it is
 * in plain sight, and the figure stops. (It made one e2e test fail about once in forty runs.) Read the last entry.
 */
it("no IntersectionObserver callback reads only the first entry of a batch", () => {
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(name)) files.push(p); } };
  ["components", "content", "lib", "app"].forEach(walk);
  const offenders = files.filter((f) => /IntersectionObserver\(\s*\(\s*\[/.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});
