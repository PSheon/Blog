import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/ml";
import { Car, autopilot, newAutopilot } from "@/content/posts/slam-2d/components/car";
import { type Pose, wrap } from "@/content/posts/slam-2d/components/se2";
import { RING } from "@/content/posts/slam-2d/components/world";

/** Drive on autopilot; report the longest standstill (s) and how far round the ring it got (laps, anticlockwise). */
function drive(start: Pose, seconds: number, seed: number) {
  const car = new Car(RING, start, mulberry32(seed)), pilot = newAutopilot();
  let moved = true, still = 0, worst = 0, swept = 0, prevAngle = Math.atan2(start.y - 7, start.x - 10);
  for (let k = 0; k < seconds * 30; k++) {
    const before = car.truth;
    car.step(autopilot(car.truth, car.lastScan.ranges, moved, pilot, 1 / 30), 1 / 30);
    moved = Math.hypot(car.truth.x - before.x, car.truth.y - before.y) > 1e-5;
    still = moved ? 0 : still + 1 / 30; worst = Math.max(worst, still);
    const angle = Math.atan2(car.truth.y - 7, car.truth.x - 10); swept += wrap(angle - prevAngle); prevAngle = angle;
  }
  return { worstStandstill: worst, laps: swept / (2 * Math.PI), start, end: car.truth };
}

// 200 random starts take two and a half minutes here and far longer on CI; 40 keep the everyday run short.
// PILOT_FULL=1 runs them all.
const STARTS = process.env.PILOT_FULL ? 200 : 40;

describe("autopilot", () => {
  it("keeps lapping from the start line", () => {
    const r = drive({ x: 2, y: 2, theta: 0 }, 240, 1);
    expect(r.laps).toBeGreaterThan(5);
    expect(r.worstStandstill).toBeLessThan(1.5);
  }, 60_000); // 2 s here, 5.6 s on a GitHub runner: over the 5 s default

  it("gets going from wherever a reader left the car, facing any way", () => {
    const rng = mulberry32(9), results: ReturnType<typeof drive>[] = [];
    while (results.length < STARTS) {
      const p = { x: 0.6 + rng() * 18.8, y: 0.6 + rng() * 12.8, theta: rng() * 6.28 };
      // Not inside the central block or one of the boxes along the corridor: a reader cannot drive in there.
      const solids = [[4, 4, 16, 10], [7, 0, 8, 1.2], [13, 2.8, 14, 4], [18.6, 5, 20, 6.5], [16, 8, 17, 9], [11, 12.6, 12.5, 14], [5.5, 10, 6.5, 11.2], [0, 7.5, 1.3, 8.5], [2.8, 3, 4, 4]];
      if (solids.some(([x0, y0, x1, y1]) => p.x > x0 - 0.4 && p.x < x1 + 0.4 && p.y > y0 - 0.4 && p.y < y1 + 0.4)) continue;
      const probe = new Car(RING, p, rng), at = probe.truth;
      probe.step({ throttle: 0.01, steer: 0 }, 0.03);
      if (probe.truth.x === at.x && probe.truth.y === at.y) continue; // started inside a wall's margin
      results.push(drive(p, 90, results.length));
    }
    const failed = results.filter((r) => r.laps < 1 || r.worstStandstill > 3);
    if (process.env.PILOT_DEBUG) failed.forEach((f) => console.log(`FAILED start (${f.start.x.toFixed(1)}, ${f.start.y.toFixed(1)}, ${f.start.theta.toFixed(1)}) end (${f.end.x.toFixed(1)}, ${f.end.y.toFixed(1)}, ${f.end.theta.toFixed(1)}) laps ${f.laps.toFixed(2)} standstill ${f.worstStandstill.toFixed(1)}`));
    expect(failed.length, `failed ${failed.length} of ${STARTS}; worst standstill ${Math.max(...results.map((r) => r.worstStandstill)).toFixed(1)} s, fewest laps ${Math.min(...results.map((r) => r.laps)).toFixed(2)}`).toBe(0);
  }, 300_000);
});
