import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NO_SHIFT, Policy, picture, view } from "@/content/posts/head-camera/components/model";

/** The page's model module must compute what the research script computed when it saved these weights (its golden outputs). */
describe("head-camera checkpoints", () => {
  for (const kind of ["closed", "open"] as const) {
    it(`${kind} reproduces the script's outputs`, () => {
      const saved = JSON.parse(readFileSync(`public/posts/head-camera/${kind}.json`, "utf8"));
      const policy = new Policy(saved);
      expect(policy.kind).toBe(kind);
      for (const g of saved.golden) {
        const out = policy.run(picture(view(g.tip, g.block, { ...NO_SHIFT, pitch: (g.pitch * Math.PI) / 180 }))).out;
        expect(out[0]).toBeCloseTo(g.out[0], 9);
        expect(out[1]).toBeCloseTo(g.out[1], 9);
      }
    });
  }
});
