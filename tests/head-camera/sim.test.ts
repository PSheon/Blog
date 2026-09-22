import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type Action, binOf, deltaOf, encode, expert, nestCentre, NO_SHIFT, PARAMS, render, sentence, solveIK, STILL, tipOf, VOCAB, World,
} from "@/content/posts/head-camera/components/sim";

const run = (seed: number, slip: number, each?: (w: World) => void) => {
  const w = new World(seed); w.slipRate = slip;
  while (!w.success && !w.failed) { w.step(expert(w).action); each?.(w); }
  return w;
};

describe("arm", () => {
  it("inverse kinematics undoes forward kinematics", () => {
    for (const target of [[0.3, 0.1, 0.05], [0.36, -0.13, 0.1], [0.25, 0, 0.2]] as [number, number, number][]) {
      const q = solveIK(target, 0);
      expect(q).not.toBeNull();
      tipOf(q!).forEach((v, k) => expect(v).toBeCloseTo(target[k], 9));
    }
    expect(solveIK([0.9, 0, 0.1], 0)).toBeNull();
  });

  it("can reach every pose any instruction can ask for: bite point, hover and lift, for both trays at the edges of the funnel", () => {
    const f = PARAMS.funnel.offset, back = PARAMS.board.depth / 2;
    for (const nest of [0, 1]) for (const dr of [-f, f]) for (const dt of [-f, f]) for (const z of [PARAMS.railZ, PARAMS.hoverZ, PARAMS.liftZ + 0.02]) {
      const c = nestCentre(nest), a = PARAMS.nestAngle[nest], r = Math.hypot(c[0], c[1]) + dr - back, angle = a + dt / PARAMS.nestRadius;
      for (const roll of [0, Math.PI, -Math.PI]) expect(solveIK([r * Math.cos(angle), r * Math.sin(angle), z], roll)).not.toBeNull();
    }
  });

  it("has a bin that means exactly 'do not move', and bins that round-trip", () => {
    expect(deltaOf(0, STILL)).toBe(0);
    for (let joint = 0; joint < 4; joint++) for (let bin = 0; bin < PARAMS.bins; bin++) expect(binOf(joint, deltaOf(joint, bin))).toBe(bin);
    expect(binOf(3, 10)).toBe(PARAMS.bins - 1);
  });
});

describe("language", () => {
  it("says both kinds of instruction, in both languages, inside the vocabulary", () => {
    expect(sentence(encode({ nest: 0, side: false }))).toBe("把左邊的板子翻到背面朝上");
    expect(sentence(encode({ nest: 1, side: null }))).toBe("把右邊的板子翻面");
    expect(sentence(encode({ nest: 1, side: true }), true)).toBe("turn the right board so that the component side is up");
    expect(encode({ nest: 0, side: null })).toHaveLength(6);
    expect(VOCAB.length).toBeLessThan(20);
  });
});

describe("world", () => {
  it("is the same episode for the same seed", () => {
    const trace = (seed: number) => { const states: string[] = []; run(seed, 0.05, (w) => states.push(JSON.stringify([w.q, w.boards, w.hold, w.closed]))); return states; };
    expect(trace(11)).toEqual(trace(11));
    expect(trace(11)).not.toEqual(trace(12));
  });

  it("asks for nothing about one time in five, and then the right thing to do is nothing", () => {
    let noop = 0;
    for (let seed = 1; seed <= 2000; seed++) { const w = new World(seed); if (w.boards[w.task.nest].up === w.wanted) noop++; }
    expect(noop / 2000).toBeGreaterThan(0.15);
    expect(noop / 2000).toBeLessThan(0.25);
  });

  it("only holds a board gripped near the middle of its edge", () => {
    const w = new World(3), index = w.task.nest, { centre, heading } = w.pose(index), back = PARAMS.board.depth / 2 - PARAMS.bite;
    const at = (off: number) => solveIK([centre[0] - Math.cos(heading) * back - Math.sin(heading) * off, centre[1] - Math.sin(heading) * back + Math.cos(heading) * off, centre[2]], 0)!;
    const close: Action = [STILL, STILL, STILL, STILL, 1], open: Action = [STILL, STILL, STILL, STILL, 0];
    w.q = at(0.03); w.step(close);
    expect(w.events).toContain("missed");
    expect(w.hold).toBeNull();
    w.step(open);
    const again = w.pose(index), back2 = PARAMS.board.depth / 2 - PARAMS.bite;
    w.q = solveIK([again.centre[0] - Math.cos(again.heading) * back2, again.centre[1] - Math.sin(again.heading) * back2, again.centre[2]], 0)!;
    w.step(close);
    expect(w.events).toContain("grasped");
    expect(w.hold?.board).toBe(index);
  });

  it("jams a roll that would drive the board into the rails, and lets it turn once lifted", () => {
    const w = new World(3); w.slipRate = 0;
    while (!w.hold) w.step(expert(w).action);
    const rollUp: Action = [STILL, STILL, STILL, PARAMS.bins - 1, 1], before = w.q[3];
    w.step(rollUp);
    expect(w.events).toContain("jammed");
    expect(w.q[3]).toBe(before);
    while (tipOf(w.q)[2] < PARAMS.liftZ - 0.006) w.step(expert(w).action);
    w.step(rollUp);
    expect(w.q[3]).toBeGreaterThan(before);
  });

  it("lands a dropped board turned if it was past a quarter turn, and loses a board dropped away from its tray", () => {
    for (const [turns, turned] of [[1, false], [6, true]] as const) {
      const w = new World(3); w.slipRate = 0;
      const up = w.boards[w.task.nest].up;
      while (!w.hold || tipOf(w.q)[2] < PARAMS.liftZ - 0.006) w.step(expert(w).action);
      for (let k = 0; k < turns; k++) w.step([STILL, STILL, STILL, PARAMS.bins - 1, 1]);
      w.step([STILL, STILL, STILL, STILL, 0]);
      expect(w.events).toContain("dropped");
      expect(w.boards[w.task.nest].up).toBe(turned ? !up : up);
    }
    const w = new World(3); w.slipRate = 0;
    while (!w.hold || tipOf(w.q)[2] < PARAMS.liftZ - 0.006) w.step(expert(w).action);
    for (let k = 0; k < 6; k++) w.step([w.task.nest === 0 ? PARAMS.bins - 1 : 0, STILL, STILL, STILL, 1]);
    w.step([STILL, STILL, STILL, STILL, 0]);
    expect(w.events).toContain("lost");
    expect(w.failed).toBe(true);
  });
});

describe("expert", () => {
  // Measured first (docs/research/pcb-flip-vla/expert-probe, 1000 seeds each): 100, 100, 100, 98.9, 88.5 % at 0, 1, 2, 5, 10 % slip. The floors leave a margin.
  it("always succeeds without slip, and still does at the default; recovers from most drops even at 10 %", () => {
    const rate = (slip: number, n: number) => { let ok = 0; for (let seed = 1; seed <= n; seed++) if (run(seed, slip).success) ok++; return ok / n; };
    expect(rate(0, 400)).toBe(1);
    expect(rate(PARAMS.slip, 400)).toBeGreaterThanOrEqual(0.995);
    expect(rate(0.05, 400)).toBeGreaterThanOrEqual(0.96);
    expect(rate(0.1, 400)).toBeGreaterThanOrEqual(0.8);
  }, 120_000);

  it("recovers when shoved, when the board is nudged, and when someone turns the board back", () => {
    let ok = 0; const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const w = new World(seed); w.slipRate = 0;
      for (let k = 0; !w.success && !w.failed; k++) {
        w.step(expert(w).action);
        if (k === 8) w.shoveArm(); if (k === 14) w.nudgeBoard(w.task.nest); if (k === 30 && w.task.side !== null) w.turnBoard(w.task.nest);
      }
      if (w.success) ok++;
    }
    expect(ok / n).toBeGreaterThanOrEqual(0.97);
  }, 120_000);

  it("leaves the other board alone", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const before = new World(seed), other = (1 - before.task.nest) as 0 | 1, was = { ...before.boards[other] };
      expect(run(seed, 0).boards[other]).toEqual(was);
    }
  });
});

describe("what the model sees", () => {
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

  it("is 48 × 48 × 3 bytes, identical every time, and different when the camera is knocked", () => {
    const w = new World(7), a = render(w), b = render(new World(7));
    expect(a).toHaveLength(PARAMS.image * PARAMS.image * 3);
    expect(hash(a)).toBe(hash(b));
    expect(hash(render(w, { ...NO_SHIFT, yaw: 0.087 }))).not.toBe(hash(a));
  });

  it("shows which side of a board is up: turning it changes the picture where the board is, green against copper", () => {
    const w = new World(7), before = render(w);
    w.turnBoard(0);
    const after = render(w);
    let changed = 0, greenToCopper = 0;
    for (let i = 0; i < before.length; i += 3) {
      if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) > 60) { changed++; if (Math.sign(before[i] - before[i + 1]) !== Math.sign(after[i] - after[i + 1])) greenToCopper++; }
    }
    expect(changed).toBeGreaterThan(25); // the board covers a few dozen of the 2304 pixels
    expect(changed).toBeLessThan(200);
    expect(greenToCopper / changed).toBeGreaterThan(0.6);
  });
});
