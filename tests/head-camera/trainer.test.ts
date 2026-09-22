import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Trainer } from "@/content/posts/head-camera/components/model";

/**
 * The page's Trainer must be the research script's recipe, draw for draw: the fixture is what the script saved after 200
 * steps (closed+shake, HC_AUX=1 HC_PHOTO=1 HC_STEPS=200 HC_SEEDS=11 HC_SAVE=…; see docs/research/head-camera). 200 steps
 * keeps the 0.7 learning-rate switch inside the test. The tolerance is for the CPU, not the recipe: the fixture was saved on
 * an Apple M-series, and CI's x86 runner rounds Math.exp and a fused multiply-add differently; after 200 steps that is
 * 1e-9 in the biases (measured 9.9e-10 on b3 in CI), while a wrong recipe is off by 1e-3 or more.
 */
it("trains exactly what the research script trained", () => {
  const want = JSON.parse(readFileSync("tests/fixtures/head-camera-trainer-200.json", "utf8"));
  const trainer = new Trainer(11, 200);
  for (let i = 0; i < 200; i++) trainer.train();
  for (const [name, m] of Object.entries(want.params) as [string, { data: number[] }][]) {
    const got = trainer.params[name].data;
    let worst = 0;
    for (let i = 0; i < m.data.length; i++) worst = Math.max(worst, Math.abs(got[i] - m.data[i]));
    expect(worst, name).toBeLessThan(1e-7);
  }
}, 60_000);
