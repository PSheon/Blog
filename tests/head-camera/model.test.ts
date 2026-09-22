import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NO_SHIFT, Policy, evaluate, picture, view } from "@/content/posts/head-camera/components/model";

/** The page's model module must compute what the research script computed when it saved these weights (its golden outputs). */
describe("head-camera checkpoints", () => {
  // fixed.json is keep-looking trained with the camera never moved (fig. 04's left side).
  for (const [file, kind] of [["closed", "closed"], ["fixed", "closed"]] as const) {
    it(`${file} reproduces the script's outputs`, () => {
      const saved = JSON.parse(readFileSync(`public/posts/head-camera/${file}.json`, "utf8"));
      const policy = new Policy(saved);
      expect(policy.kind).toBe(kind);
      for (const g of saved.golden) {
        const out = policy.run(picture(view(g.tip, g.block, { ...NO_SHIFT, pitch: (g.pitch * Math.PI) / 180 }))).out;
        expect(out[0]).toBeCloseTo(g.out[0], 9);
        expect(out[1]).toBeCloseTo(g.out[1], 9);
      }
    });
  }

  it("evaluate() scores the keep-looking checkpoint as the script did (run 9, seed 11: 98.5 %)", () => {
    const policy = new Policy(JSON.parse(readFileSync("public/posts/head-camera/closed.json", "utf8")));
    expect(evaluate(policy, NO_SHIFT, 200, 99)).toBeCloseTo(0.985, 10);
  }, 60_000);
});
