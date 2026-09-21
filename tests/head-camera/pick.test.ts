import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NO_SHIFT } from "@/content/posts/head-camera/components/model";
import { PickPolicy, type PickSaved, evaluatePick, feelOf, pickPicture, pickView, teacher, PICK_HOME, pickAct, type PickState } from "@/content/posts/head-camera/components/pick";

const load = (name: string): PickSaved => JSON.parse(readFileSync(`public/posts/head-camera/pick-${name}.json`, "utf8"));

/** The page's port of pick and place must compute what the research script computed when it saved these checkpoints. */
describe("pick-and-place checkpoints", () => {
  for (const name of ["shaken", "fixed", "open"]) {
    it(`${name}: the script's golden outputs`, () => {
      const saved = load(name), policy = new PickPolicy(saved);
      for (const g of saved.golden) {
        const out = policy.run(pickPicture(pickView(g.state, { ...NO_SHIFT, pitch: (g.pitch * Math.PI) / 180 })), policy.kind === "closed" ? feelOf(g.state) : []).out;
        out.forEach((v, i) => expect(v).toBeCloseTo(g.out[i], 9));
      }
    });
    it(`${name}: evaluatePick() reproduces the script's success rate`, () => {
      const saved = load(name);
      expect(evaluatePick(new PickPolicy(saved), { shift: NO_SHIFT }, 200, 99).success).toBeCloseTo(saved.meta.asTrained, 10);
    }, 300_000);
  }
  it("the teacher does the whole job", () => {
    const s: PickState = { hand: [...PICK_HOME], closed: false, holding: false, block: [0.3, -0.12], pad: [0.46, 0.14] };
    let result: string | null = null;
    for (let t = 0; t < 90 && result !== "placed"; t++) result = pickAct(s, teacher(s));
    expect(result).toBe("placed");
  });
});
