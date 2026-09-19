import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/ml";
import { IDENTITY, ROOM, compose3, fromEuler, icp3, inverse3, rotationAngle, sweep } from "@/content/posts/slam-2d/components/lidar3d/icp3";

describe("3-D lidar", () => {
  it("recovers a six-degree-of-freedom motion between two sweeps", () => {
    const rng = mulberry32(1), a = fromEuler(0, 0, 0.2, [6, 5, 0.6]), motion = fromEuler(0.03, -0.04, 0.12, [0.35, -0.2, 0.05]);
    const b = compose3(a, motion), m = icp3(sweep(ROOM, a, rng), sweep(ROOM, b, rng), IDENTITY);
    const err = compose3(inverse3(motion), m.pose);
    expect(Math.hypot(...err.t)).toBeLessThan(0.03);
    expect(rotationAngle(err)).toBeLessThan(0.01);
  });
});

// LIDAR3D_BENCH=1 pnpm vitest run tests/ml/lidar3d.test.ts -t bench --silent=false --reporter=verbose
describe.runIf(!!process.env.LIDAR3D_BENCH)("bench", () => {
  it("bench", () => {
    const rng = mulberry32(3);
    for (const stride of [1, 3, 6]) {
      let ms = 0, te = 0, re = 0, n = 0, sweepMs = 0, pts = 0;
      for (let k = 0; k < 12; k++) {
        const a = fromEuler(0, 0, rng() * 6.28, [2 + rng() * 12, 2 + rng() * 8, 0.6]);
        const motion = fromEuler((rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.3, [(rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.1]);
        const t0 = performance.now(), A = sweep(ROOM, a, rng), B = sweep(ROOM, compose3(a, motion), rng);
        sweepMs += (performance.now() - t0) / 2; pts += A.points.filter((v) => !Number.isNaN(v)).length / 3;
        const m = icp3(A, B, IDENTITY, { stride }), err = compose3(inverse3(motion), m.pose);
        ms += m.ms; te += Math.hypot(...err.t); re += rotationAngle(err); n++;
      }
      console.log(`stride ${stride}: ${(pts / n).toFixed(0)} points/sweep, sweep ${(sweepMs / n).toFixed(0)} ms, ICP ${(ms / n).toFixed(0)} ms, error ${(te / n * 100).toFixed(1)} cm ${(re / n * 57.3).toFixed(2)}°`);
    }
    // Lidar odometry: chain ICP along a path and see how far the estimate drifts with no loop closure at all.
    let truth = fromEuler(0, 0, 0, [2, 1.5, 0.6]), est = truth, prev = sweep(ROOM, truth, rng), total = 0, ms = 0;
    for (let k = 0; k < 120; k++) {
      const turn = k % 30 > 24 ? 0.26 : 0, step = fromEuler(0.01 * Math.sin(k), 0.015 * Math.cos(k * 0.7), turn, [turn ? 0.05 : 0.3, 0, 0]);
      truth = compose3(truth, step);
      const cur = sweep(ROOM, truth, rng), m = icp3(prev, cur, step.t[0] > 0.1 ? fromEuler(0, 0, 0, [0.25, 0, 0]) : IDENTITY, { stride: 3 });
      est = compose3(est, m.pose); prev = cur; total += Math.hypot(...step.t); ms += m.ms;
    }
    const drift = compose3(inverse3(truth), est);
    console.log(`lidar odometry over ${total.toFixed(0)} m, 120 sweeps: drift ${Math.hypot(...drift.t).toFixed(2)} m, ${(rotationAngle(drift) * 57.3).toFixed(1)}°, ${(ms / 120).toFixed(0)} ms per sweep`);
  }, 1_200_000);
});
