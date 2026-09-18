import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { type Knobs, Lite3Sim } from "@/content/posts/lite3-walking/components/sim";

/** Walk for `seconds` with some knobs changed; mean forward speed and when it fell. */
function walk(sim: Lite3Sim, knobs: Partial<Knobs>, seconds = 10) {
  Object.assign(sim.knobs, { command: [0.5, 0, 0], kp: 30, kd: 1, blind: null, latency: 0, noise: 0, friction: 1 }, knobs);
  sim.reset();
  sim.advance(seconds * 1000);
  return { vx: sim.position[0] / seconds, fellAt: sim.fellAt };
}

describe("Lite3 simulator", () => {
  let sim: Lite3Sim;
  beforeAll(async () => {
    sim = await Lite3Sim.load(async (path) => new Uint8Array(await readFile(`public/lite3/${path}`)));
  }, 30_000);

  // Expected values are the measurements in docs/research/2026-09-18-lite3-spike.md, redone with the
  // convex-hull collision meshes that ship in public/lite3. The physics is deterministic.
  it("walks at the commanded half metre per second and resets to the same run", () => {
    expect(walk(sim, {})).toEqual({ vx: expect.closeTo(0.47, 2), fellAt: null });
    const again = walk(sim, {});
    expect(again.vx).toBe(walk(sim, {}).vx);
  });

  it("slows down, but stays up, as its observations get older", () => {
    expect([2, 4, 6].map((latency) => walk(sim, { latency }))).toEqual([
      { vx: expect.closeTo(0.42, 2), fellAt: null },
      { vx: expect.closeTo(0.34, 2), fellAt: null },
      { vx: expect.closeTo(0.26, 2), fellAt: null },
    ]);
  });

  it("barely notices a slippery floor until μ 0.01", () => {
    expect(walk(sim, { friction: 0.05 })).toEqual({ vx: expect.closeTo(0.44, 2), fellAt: null });
    expect(walk(sim, { friction: 0.01 })).toEqual({ vx: expect.closeTo(0.24, 2), fellAt: null });
  });

  it("slips more on a slippery floor", () => {
    const slip = (friction: number) => (walk(sim, { friction }), sim.footSlip);
    // Python MuJoCo on the original meshes gave 0.12, 0.27 and 0.47 m/s.
    expect([1, 0.05, 0.01].map(slip)).toEqual([expect.closeTo(0.12, 2), expect.closeTo(0.26, 2), expect.closeTo(0.44, 2)]);
  });

  it("shrugs off ±0.2 of sensor noise and goes down at once under ±0.8", () => {
    expect(walk(sim, { noise: 0.2 })).toEqual({ vx: expect.closeTo(0.42, 2), fellAt: null });
    expect(walk(sim, { noise: 0.8 }, 2).fellAt).toBeLessThan(0.6);
  });

  it("depends on each sense differently", () => {
    expect(walk(sim, { blind: "gyro" }).fellAt).toBeNull();
    expect(walk(sim, { blind: "gravity" }, 3).fellAt).toBeCloseTo(0.82, 2);
    expect(walk(sim, { blind: "jointPos" }, 2).fellAt).toBeCloseTo(0.28, 2);
    expect(walk(sim, { blind: "jointVel" })).toEqual({ vx: expect.closeTo(1.26, 2), fellAt: null }); // asked for 0.5
    expect(walk(sim, { blind: "lastAction" })).toEqual({ vx: expect.closeTo(0, 2), fellAt: null });
  });

  it("survives a 150 N shove from either side and not a 300 N one", () => {
    const shove = (newtons: number) => {
      walk(sim, {}, 2);
      sim.push(newtons);
      sim.advance(3000);
      return sim.fallen;
    };
    // Between 200 and 250 N the outcome depends on the side and on where in the stride the shove lands.
    expect([150, -150, 300, -300].map(shove)).toEqual([false, false, true, true]);
  });
});
