import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/ml";
import { FlyNet } from "@/content/posts/fly-motion/components/model";
import { DT, GRID, STEPS, grating, randomClip } from "@/content/posts/fly-motion/components/stimulus";
import { TYPES, compile } from "@/content/posts/fly-motion/components/wiring";

describe("wiring", () => {
  it("compiles the connectome into 80 type pairs whose inputs are normalised per target", () => {
    const { taps, pairs } = compile();
    expect(pairs).toHaveLength(80);
    expect(taps.src).toHaveLength(520);
    const total = new Float64Array(TYPES.length);
    taps.weight.forEach((w, i) => (total[taps.dst[i]] += Math.abs(w)));
    total.forEach((t, i) => i >= 3 && expect(t, TYPES[i]).toBeCloseTo(1, 6)); // L1–L3 get little from this subnetwork
  });

  it("puts Mi9 and Mi4 on opposite sides of each T4 subtype, and erases that when symmetrised", () => {
    const centroid = (kind: "real" | "symmetric", pair: string) => {
      const { taps, pairs } = compile(kind), p = pairs.indexOf(pair);
      let r = 0, c = 0, n = 0;
      taps.pair.forEach((q, i) => {
        if (q !== p) return;
        const w = Math.abs(taps.weight[i]);
        r += taps.dr[i] * w; c += taps.dc[i] * w; n += w;
      });
      return [r / n, c / n];
    };
    for (const s of "abcd") {
      const [r9, c9] = centroid("real", `Mi9>T4${s}`), [r4, c4] = centroid("real", `Mi4>T4${s}`);
      expect(r9 * r4 + c9 * c4, `T4${s}`).toBeLessThan(-0.1);
      const [sr, sc] = centroid("symmetric", `Mi9>T4${s}`);
      expect(Math.hypot(sr, sc)).toBeLessThan(1e-9);
    }
  });
});

describe("stimulus", () => {
  it("drifts towards the angle it is given", () => {
    // Along +x, the next column is (u + 1, v − 1), √3 away. Pick the speed so the pattern moves exactly that far per step.
    const wavelength = 4 * Math.sqrt(3), frames = grating(0, wavelength, 1 / (DT * 4), 0.7);
    expect(frames).toHaveLength(STEPS);
    for (let u = 2; u < 8; u++) for (let v = 2; v < 8; v++) expect(frames[1][(u + 1) * GRID + v - 1]).toBeCloseTo(frames[0][u * GRID + v], 9);
    expect(Math.min(...frames[0])).toBeGreaterThanOrEqual(0);
    expect(Math.max(...frames[0])).toBeLessThanOrEqual(1);
  });
});

describe("FlyNet", () => {
  it("learns 156 numbers and nothing else", () => {
    expect(new FlyNet("real", mulberry32(1)).parameterCount()).toBe(156);
  });

  it("gets better at telling direction within a few hundred clips", () => {
    const rng = mulberry32(3), net = new FlyNet("real", mulberry32(1));
    const first = net.step(Array.from({ length: 8 }, () => randomClip(rng)));
    let last = first;
    for (let i = 0; i < 40; i++) last = net.step(Array.from({ length: 8 }, () => randomClip(rng)));
    expect(last).toBeLessThan(first);
  }, 60_000);
});

// FLY_BENCH=1 pnpm vitest run tests/ml/fly-motion.test.ts — prints learning curves and speed; not part of the normal run.
describe.runIf(!!process.env.FLY_BENCH)("bench", () => {
  it("learning curve", () => {
    const kind = (process.env.FLY_WIRING ?? "real") as "real", seed = Number(process.env.FLY_SEED ?? 1);
    const rng = mulberry32(seed), net = new FlyNet(kind, mulberry32(seed + 100), Number(process.env.FLY_REST ?? -0.1)), testRng = mulberry32(999);
    net.keepAlive = Number(process.env.FLY_ALIVE ?? 1);
    const test = Array.from({ length: 128 }, () => randomClip(testRng));
    let ms = 0;
    for (let step = 1; step <= 250; step++) {
      const clips = Array.from({ length: 16 }, () => randomClip(rng)), t0 = performance.now();
      const loss = net.step(clips);
      ms += performance.now() - t0;
      if (step % 50 === 0) console.log(`${kind} rest ${process.env.FLY_REST ?? -0.1} seed ${seed}  samples ${net.seen}  loss ${loss.toFixed(3)}  acc ${net.accuracy(test).toFixed(3)}  ${(net.seen / (ms / 1000)).toFixed(0)} samples/s`);
    }
    const angles = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
    const resp = angles.map((a) => { const sum = new Float64Array(8); for (let j = 0; j < 8; j++) net.detectors(grating(a, 4 + testRng() * 4, 1 + testRng() * 3, testRng() * 6.28)).forEach((v, i) => (sum[i] += v)); return sum; });
    console.log(["T4a", "T4b", "T4c", "T4d", "T5a", "T5b", "T5c", "T5d"].map((name, i) => {
      let x = 0, y = 0, n = 0;
      angles.forEach((a, k) => { x += resp[k][i] * Math.cos(a); y += resp[k][i] * Math.sin(a); n += resp[k][i]; });
      return `${name} PD ${((Math.atan2(y, x) * 180) / Math.PI + 360).toFixed(0) as unknown as number % 360}° DSI ${(Math.hypot(x, y) / Math.max(n, 1e-9)).toFixed(2)}`;
    }).join("  "));
  }, 600_000);
});
