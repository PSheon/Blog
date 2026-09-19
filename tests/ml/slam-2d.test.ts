import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/ml";
import { type Edge, diagonal, graphError, optimise, solveCholesky } from "@/content/posts/slam-2d/components/graph";
import { icp } from "@/content/posts/slam-2d/components/icp";
import { type Pose, between, compose, inverse, transformPoints, wrap } from "@/content/posts/slam-2d/components/se2";
import { resemblance } from "@/content/posts/slam-2d/components/place";
import { DEFAULTS, Slam } from "@/content/posts/slam-2d/components/slam";
import { RING, gaussian, scan } from "@/content/posts/slam-2d/components/world";

const close = (a: Pose, b: Pose, tol = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol);
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol);
  expect(Math.abs(wrap(a.theta - b.theta))).toBeLessThan(tol);
};

describe("SE(2)", () => {
  const a = { x: 1, y: 2, theta: 0.7 }, b = { x: -0.5, y: 0.3, theta: -2.9 };
  it("compose, inverse and between agree with each other", () => {
    close(compose(a, inverse(a)), { x: 0, y: 0, theta: 0 });
    close(compose(a, between(a, b)), b);
  });
  it("moves points the same way it moves frames", () => {
    const p = transformPoints(a, Float64Array.from([1, 0]));
    expect(p[0]).toBeCloseTo(1 + Math.cos(0.7));
    expect(p[1]).toBeCloseTo(2 + Math.sin(0.7));
  });
});

describe("scanner", () => {
  it("measures the distance to the wall straight ahead", () => {
    const s = scan(RING, { x: 2, y: 6, theta: Math.PI }, () => 0.5, 0); // facing the west wall, 2 m away
    expect(s.ranges[0]).toBeCloseTo(2, 9);
  });
});

describe("ICP", () => {
  it("recovers a known motion between two scans of the same place", () => {
    const rng = mulberry32(1), a = { x: 2, y: 2, theta: 0.2 }, b = { x: 2.4, y: 2.25, theta: 0.45 };
    const m = icp(scan(RING, a, rng).points, scan(RING, b, rng).points, { x: 0, y: 0, theta: 0 });
    const truth = between(a, b);
    expect(Math.hypot(m.pose.x - truth.x, m.pose.y - truth.y)).toBeLessThan(0.03);
    expect(Math.abs(wrap(m.pose.theta - truth.theta))).toBeLessThan(0.01);
    expect(m.inliers).toBeGreaterThan(0.8);
  });
});

describe("place recognition", () => {
  it("recognises the same spot facing another way, reads off the turn, and tells it from a different spot", () => {
    const rng = mulberry32(2), here = scan(RING, { x: 18, y: 2, theta: 0.3 }, rng).panorama;
    const turned = resemblance(here, scan(RING, { x: 18.2, y: 2.1, theta: 0.3 + 1.2 }, rng).panorama);
    expect(turned.score).toBeGreaterThan(0.75);
    expect(Math.abs(wrap(turned.heading - 1.2))).toBeLessThan(0.1);
    expect(resemblance(here, scan(RING, { x: 2, y: 12, theta: 0.3 }, rng).panorama).score).toBeLessThan(0.6);
  });
});

describe("pose graph", () => {
  it("solves a linear system by Cholesky", () => {
    const x = solveCholesky(Float64Array.from([4, 2, 2, 3]), Float64Array.from([10, 8]), 2);
    expect(x[0]).toBeCloseTo(1.75);
    expect(x[1]).toBeCloseTo(1.5);
  });

  it("pulls a drifted square back into shape once the loop is closed", () => {
    // Four sides of a 4 m square; odometry believes every corner is 85° instead of 90°.
    const truth: Pose[] = [], poses: Pose[] = [], edges: Edge[] = [];
    let t: Pose = { x: 0, y: 0, theta: 0 }, p: Pose = { x: 0, y: 0, theta: 0 };
    for (let i = 0; i <= 16; i++) {
      truth.push(t); poses.push({ ...p });
      if (i === 16) break;
      const turn = i % 4 === 3 ? Math.PI / 2 : 0, z = { x: 1, y: 0, theta: turn ? turn - 0.087 : 0 };
      edges.push({ from: i, to: i + 1, z, information: diagonal(100, 100, 400), kind: "odometry" });
      t = compose(t, { x: 1, y: 0, theta: turn }); p = compose(p, z);
    }
    const drift = Math.hypot(poses[16].x - truth[16].x, poses[16].y - truth[16].y);
    edges.push({ from: 0, to: 16, z: between(truth[0], truth[16]), information: diagonal(2500, 2500, 10000), kind: "loop" });
    const history = optimise(poses, edges);
    expect(history[history.length - 1]).toBeLessThan(history[0] / 20);
    expect(Math.hypot(poses[16].x - truth[16].x, poses[16].y - truth[16].y)).toBeLessThan(drift / 10);
    expect(graphError(poses, edges)).toBeCloseTo(history[history.length - 1]);
  });
});

/** Drive the ring with drifting odometry; returns how far the estimate is from the truth along the way. */
function drive(options = DEFAULTS, laps = 2, seed = 1) {
  const rng = mulberry32(seed), slam = new Slam(options);
  const route: [number, number][] = [[2, 2], [18, 2], [18, 12], [2, 12]];
  let truth: Pose = { x: 2, y: 2, theta: 0 }, target = 1;
  // SLAM's origin is wherever the first keyframe was taken, so measure the truth from there too.
  let start: Pose | null = null;
  const truths: Pose[] = [], atKeyframe: Pose[] = [];
  const bias = Number(process.env.SLAM_BIAS ?? 0.006); // the left wheel is a little bigger than the odometry thinks: a steady pull to one side
  let closureMs = 0, steps = 0, snapshot: Pose[] = [], snap: { at: number; before: number; after: number; endBefore: number; endAfter: number } | null = null;
  for (let reached = 0; reached < laps * 4; steps++) {
    const [tx, ty] = route[target], heading = Math.atan2(ty - truth.y, tx - truth.x), err = wrap(heading - truth.theta);
    const v = Math.abs(err) > 0.4 ? 0.02 : 0.1, w = Math.max(-0.08, Math.min(0.08, err));
    const moved: Pose = { x: v, y: 0, theta: w };
    truth = compose(truth, moved);
    const odo: Pose = { x: v * (1 + 0.02 * gaussian(rng)), y: 0.002 * gaussian(rng), theta: w + bias * v + 0.003 * gaussian(rng) };
    const before = slam.keyframes.length, t0 = performance.now();
    const seen = scan(RING, truth, rng);
    slam.step(odo, seen.points, seen.panorama);
    if (slam.keyframes.length > before) {
      closureMs = Math.max(closureMs, performance.now() - t0);
      start ??= truth;
      atKeyframe.push(between(start, truth));
      if (!snap && slam.closures.length === 1) {
        const err = (poses: Pose[]) => poses.map((p, i) => Math.hypot(p.x - atKeyframe[i].x, p.y - atKeyframe[i].y));
        const b = err(snapshot), a = err(slam.keyframes.slice(0, snapshot.length).map((k) => k.pose)), mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
        snap = { at: slam.keyframes.length, before: mean(b), after: mean(a), endBefore: b[b.length - 1], endAfter: a[a.length - 1] };
      }
      snapshot = slam.keyframes.map((k) => ({ ...k.pose }));
    }
    truths.push(truth);
    if (Math.hypot(tx - truth.x, ty - truth.y) < 0.4) { target = (target + 1) % 4; reached++; }
  }
  const errors = slam.keyframes.map((k, i) => Math.hypot(k.pose.x - atKeyframe[i].x, k.pose.y - atKeyframe[i].y));
  return { slam, errors, mean: errors.reduce((a, b) => a + b, 0) / errors.length, max: Math.max(...errors), worstStepMs: closureMs, steps, atKeyframe, snap };
}

describe("SLAM on the ring", () => {
  it("keeps the map together where dead reckoning falls apart", () => {
    const dead = drive({ ...DEFAULTS, loopClosure: false }), full = drive();
    expect(full.slam.closures.length).toBeGreaterThan(0);
    expect(full.mean).toBeLessThan(dead.mean / 3);
  }, 120_000);
});

// SLAM_BENCH=1 pnpm vitest run tests/ml/slam-2d.test.ts -t bench --silent=false --reporter=verbose
describe.runIf(!!process.env.SLAM_BENCH)("bench", () => {
  it("bench", () => {
    for (const [name, o] of [["dead reckoning", { ...DEFAULTS, loopClosure: false }], ["scan-matched odometry only", { ...DEFAULTS, loopClosure: false, scanMatchOdometry: true }], ["loop closure", DEFAULTS], ["both", { ...DEFAULTS, scanMatchOdometry: true }], ["appearance candidates", { ...DEFAULTS, candidates: "appearance" }]] as const)
      for (const seed of [1, 2, 3]) {
        const r = drive(o, 2, seed), wrong = r.slam.edges.filter((e) => e.kind === "loop").filter((e) => { const t = between(r.atKeyframe[e.from], r.atKeyframe[e.to]); return Math.hypot(t.x - e.z.x, t.y - e.z.y) > 0.3; }).length;
        console.log(`${name.padEnd(26)} seed ${seed}  keyframes ${r.slam.keyframes.length}  closures ${r.slam.closures.length} (wrong ${wrong})  error mean ${r.mean.toFixed(2)} m  max ${r.max.toFixed(2)} m  final ${r.errors[r.errors.length - 1].toFixed(2)} m  worst step ${r.worstStepMs.toFixed(0)} ms${r.snap ? `  | first closure at keyframe ${r.snap.at}: mean ${r.snap.before.toFixed(2)}→${r.snap.after.toFixed(2)} m, newest pose ${r.snap.endBefore.toFixed(2)}→${r.snap.endAfter.toFixed(2)} m` : ""}`);
      }
  }, 1_200_000);
});
