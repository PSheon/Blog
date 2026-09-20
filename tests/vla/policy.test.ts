import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collect, encode, IDLE_TOKENS, type Manifest, PARAMS, PolicyNet, proprioOf, render, World } from "@/content/posts/pcb-flip-vla/components/sim";

const golden = JSON.parse(readFileSync("tests/fixtures/vla-golden.json", "utf8")) as { checkpoint: string; cases: { seed: number; step: number; logits: number[]; tokens: number[] }[] };
const manifest = JSON.parse(readFileSync(`public/vla/${golden.checkpoint}.json`, "utf8")) as Manifest, bin = readFileSync(`public/vla/${golden.checkpoint}.bin`);
const net = new PolicyNet(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const token = (a: number[]) => [a[0], a[1], a[2], a[3], PARAMS.bins + a[4]];

describe("the TypeScript forward pass", () => {
  it("gives PyTorch's logits and PyTorch's five tokens for the same moment of the same episode", () => {
    for (const c of golden.cases) {
      // The inputs are grown again from the seed: the same expert episode the PyTorch side read from disk.
      const t = collect(c.seed, { mode: "bc" }), k = manifest.frames;
      const frames = Array.from({ length: k }, (_, i) => t.frames[Math.max(0, c.step - (k - 1 - i))]);
      const history = [3, 2, 1].map((h) => (c.step - h >= 0 ? token(t.taken[c.step - h]) : IDLE_TOKENS));
      const out = net.act(frames, t.instruction, t.proprio[c.step], history);
      let worst = 0;
      c.logits.forEach((v, i) => { worst = Math.max(worst, Math.abs(out.logits[0][i] - v)); });
      expect(worst).toBeLessThan(2e-3);
      expect(out.tokens).toEqual(c.tokens);
    }
  }, 60_000);

  it("reads the world the way the rollout does", () => {
    const w = new World(100001), frame = render(w);
    const out = net.act([frame, frame, frame, frame], encode(w.task), proprioOf(w), [IDLE_TOKENS, IDLE_TOKENS, IDLE_TOKENS]);
    expect(out.tokens).toHaveLength(5);
    expect(out.tokens[4]).toBeGreaterThanOrEqual(PARAMS.bins);
    expect(out.attention).toHaveLength(4);
  });
});
