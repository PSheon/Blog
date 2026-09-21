/**
 * The head-camera world and policy, exactly as the research script (docs/research/head-camera/spike.test.ts.txt) trains
 * and measures them: the same arm, bench, camera, picture and network. tests/head-camera/model.test.ts loads the saved
 * weights and checks this file reproduces the script's outputs to 1e-9.
 */
import { Adam, Mat, Tape, mulberry32 } from "@/lib/ml";
import { type Box, type CameraShift, type Joints, NO_SHIFT, PARAMS, renderBoxes, skeleton, solveIK, tipOf, type Vec3 } from "@/content/posts/pcb-flip-vla/components/sim";

export { NO_SHIFT, type CameraShift, type Joints, type Vec3 };
export const SIZE = 32, K = 8;
const HALF = SIZE / 2;
/** A humanoid's arm hangs from a shoulder beside its head: the camera is 22 cm to the arm's left, 62 cm up. */
export const HEAD = { eye: [-0.12, 0.22, 0.62] as Vec3, target: [0.36, 0, 0.02] as Vec3, fov: 58 };
/** The hand's height above the bench, the largest step, how close counts as there, and for how many steps. */
export const Z = 0.055, MAX_STEP = 0.025, TOL = 0.03, HOLD = 3;
export const AREA = { x: [0.22, 0.5], y: [-0.22, 0.22] } as const;
const CENTRE = [0.36, 0], SPAN = [0.14, 0.22];
export type XY = [number, number];
export type Kind = "open" | "closed";

const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const flat = (c: Vec3, h: Vec3, top: [number, number, number]): Box => ({ c, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], h, top });

export const armFor = (tip: XY): Joints | null => solveIK([tip[0], tip[1], Z], 0);
export const reachable = (p: XY) => armFor(p) !== null;
export const HOME: XY = (() => { const t = tipOf(PARAMS.home as unknown as Joints); return [t[0], t[1]]; })();
/** Joint positions for drawing: shoulder, elbow, wrist, tip. */
export const bones = (tip: XY): Vec3[] | null => { const q = armFor(tip); return q ? skeleton(q) : null; };

/** The boxes the head camera sees. The block is 4 cm; the hand is the one cyan thing in the world. */
export function scene(tip: XY, block: XY): Box[] {
  const boxes: Box[] = [flat([0.34, 0, -0.01], [0.4, 0.36, 0.01], [196, 198, 208]), flat([block[0], block[1], 0.02], [0.02, 0.02, 0.02], [214, 60, 60])];
  const q = armFor(tip);
  if (!q) return boxes;
  const [shoulder, elbow, wrist, end] = skeleton(q), up: Vec3 = [0, 0, 1];
  const link = (from: Vec3, to: Vec3, thick: number, top: [number, number, number]) => {
    const u = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]), v = unit(cross(up, u)), n = cross(u, v);
    boxes.push({ c: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], u, v, n, h: [Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / 2, thick, thick], top });
  };
  boxes.push(flat([0, 0, shoulder[2] / 2], [0.035, 0.035, shoulder[2] / 2], [52, 56, 70]));
  link(shoulder, elbow, 0.016, [240, 140, 40]); link(elbow, wrist, 0.014, [240, 140, 40]);
  link(wrist, end, 0.014, [240, 140, 40]);
  boxes.push(flat([end[0], end[1], end[2]], [0.022, 0.022, 0.014], [60, 200, 230]));
  return boxes;
}

/** What the head camera sees, as RGB bytes (`size` px square). */
export const view = (tip: XY, block: XY, shift: CameraShift, size = SIZE) => renderBoxes(scene(tip, block), HEAD, shift, size, 2);

/** Channel-first 0…1, what the network reads. `noise` and `dim` are the disturbances of run 8. */
export function picture(bytes: Uint8Array, noise = 0, dim = 1, rng: () => number = Math.random): Float64Array {
  const n = SIZE * SIZE, out = new Float64Array(3 * n);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    let v = (bytes[i * 3 + c] / 255) * dim;
    if (noise) v += noise * gauss();
    out[c * n + i] = Math.max(0, Math.min(1, v));
  }
  return out;
}

const clip = (v: number) => Math.max(-1, Math.min(1, v));
/** A step towards a point: what look-once does after it has named a place. */
export const towards = (tip: XY, goal: XY): XY => [clip((goal[0] - tip[0]) / MAX_STEP), clip((goal[1] - tip[1]) / MAX_STEP)];
/** Apply an action; a step the arm cannot reach is not taken. */
export function advance(tip: XY, action: XY): XY {
  const next: XY = [tip[0] + clip(action[0]) * MAX_STEP, tip[1] + clip(action[1]) * MAX_STEP];
  return reachable(next) ? next : tip;
}
/** Keep a dragged block inside the area training drew blocks from, and within the arm's reach; otherwise it stays put. */
export function onBench(p: XY, was: XY): XY {
  const q: XY = [Math.max(AREA.x[0], Math.min(AREA.x[1], p[0])), Math.max(AREA.y[0], Math.min(AREA.y[1], p[1]))];
  return reachable(q) ? q : was;
}

export type Saved = { meta: { kind: Kind; seed: number; steps: number }; params: Record<string, { rows: number; cols: number; data: number[] }>; golden: { tip: XY; block: XY; pitch: number; out: XY }[] };

/** The trained network, forward only. Same layers as the script: conv, pool, conv, 8 spatial-softmax keypoints, dense, dense. */
export class Policy {
  private readonly P: Record<string, Mat>;
  private readonly pos = new Mat(HALF, 1, Float64Array.from({ length: HALF }, (_, i) => ((i + 0.5) / HALF) * 2 - 1));
  constructor(readonly saved: Saved) {
    this.P = Object.fromEntries(Object.entries(saved.params).map(([k, m]) => [k, new Mat(m.rows, m.cols, Float64Array.from(m.data))]));
  }
  get kind(): Kind { return this.saved.meta.kind; }
  /** The action (closed) or the block's place on the bench (open), and the eight keypoints in the picture's −1…1 (y down). */
  run(image: Float64Array): { out: XY; keypoints: XY[] } {
    const P = this.P, t = new Tape(), x = new Mat(3, SIZE * SIZE, image);
    const f1 = t.maxPool2(t.relu(t.conv2d(x, P.k1, P.b1, { h: SIZE, w: SIZE, k: 3, inputGrad: false })), { h: SIZE, w: SIZE });
    const f2 = t.relu(t.conv2d(f1, P.k2, P.b2, { h: HALF, w: HALF, k: 3 }));
    const maps = t.scale(t.conv2d(f2, P.k3, P.b3, { h: HALF, w: HALF, k: 1 }), HALF);
    const kx = t.matmul(t.softmax(t.marginal(maps, { h: HALF, w: HALF, axis: "x" })), this.pos), ky = t.matmul(t.softmax(t.marginal(maps, { h: HALF, w: HALF, axis: "y" })), this.pos);
    const h = t.relu(t.addRow(t.matmul(t.concatCols([t.transpose(kx), t.transpose(ky)]), P.w1), P.c1));
    const o = t.addRow(t.matmul(h, P.w2), P.c2).data;
    return { out: [o[0], o[1]], keypoints: Array.from({ length: K }, (_, k) => [kx.data[k], ky.data[k]] as XY) };
  }
  /** open's answer, in metres on the bench. */
  static place(out: XY): XY { return [CENTRE[0] + out[0] * SPAN[0], CENTRE[1] + out[1] * SPAN[1]]; }
}

/** The same pinhole as renderBoxes, for a point: pixel coordinates in −1…1, y up. */
export function project(p: Vec3, shift: CameraShift): XY {
  const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const turn = (a: Vec3, k: Vec3, angle: number): Vec3 => add(add([a[0] * Math.cos(angle), a[1] * Math.cos(angle), a[2] * Math.cos(angle)], cross(k, a), Math.sin(angle)), k, dot(k, a) * (1 - Math.cos(angle)));
  const up0: Vec3 = [0, 0, 1], eye = add(HEAD.eye, [shift.dx, shift.dy, shift.dz]);
  let f = unit(add(HEAD.target, HEAD.eye, -1)); f = turn(f, up0, shift.yaw); f = turn(f, unit(cross(f, up0)), shift.pitch);
  const right = unit(cross(f, up0)), up = cross(right, f), focal = 1 / Math.tan(((HEAD.fov / 2) * Math.PI) / 180), d = add(p, eye, -1), z = dot(d, f);
  return [(focal * dot(d, right)) / z, (focal * dot(d, up)) / z];
}

/** Anywhere in the training area the arm can reach. */
export function somewhere(rng: () => number): XY {
  for (;;) { const p: XY = [AREA.x[0] + rng() * (AREA.x[1] - AREA.x[0]), AREA.y[0] + rng() * (AREA.y[1] - AREA.y[0])]; if (reachable(p)) return p; }
}

/**
 * The recipe the reader trains in the page: keep looking, the camera shaken ±10° (and ±3 cm) for every picture, noise
 * σ 0…0.1 and light × 0.6…1.2 for every picture, and the aux head that says where hand and block are in the picture.
 * Draw for draw and float for float the research script's closed+shake with HC_AUX=1 HC_PHOTO=1 (run 9), which
 * tests/head-camera/trainer.test.ts checks against weights the script saved.
 */
export class Trainer {
  readonly params: Record<string, Mat> = {};
  private readonly adam: Adam;
  private readonly pos = new Mat(HALF, 1, Float64Array.from({ length: HALF }, (_, i) => ((i + 0.5) / HALF) * 2 - 1));
  private readonly data: () => number;
  step = 0;

  constructor(seed: number, readonly steps = 10_000, readonly batch = 16) {
    const rng = mulberry32(seed);
    const he = (rows: number, fanIn: number) => { const m = new Mat(rows, fanIn), s = Math.sqrt(6 / fanIn); for (let i = 0; i < m.data.length; i++) m.data[i] = (rng() * 2 - 1) * s; return m; };
    const P = this.params, inputs = 2 * K, HIDDEN = 32;
    P.k1 = he(8, 27); P.b1 = new Mat(1, 8); P.k2 = he(16, 72); P.b2 = new Mat(1, 16); P.k3 = he(K, 16); P.b3 = new Mat(1, K);
    P.w1 = he(inputs, HIDDEN); for (let i = 0; i < P.w1.data.length; i++) P.w1.data[i] *= Math.sqrt(HIDDEN / inputs); P.c1 = new Mat(1, HIDDEN);
    P.w2 = he(HIDDEN, 2); for (let i = 0; i < P.w2.data.length; i++) P.w2.data[i] *= Math.sqrt(2 / HIDDEN); P.c2 = new Mat(1, 2);
    P.wa = he(2 * K, 4); for (let i = 0; i < P.wa.data.length; i++) P.wa.data[i] *= Math.sqrt(4 / (2 * K)); P.ca = new Mat(1, 4);
    this.adam = new Adam(P);
    this.data = mulberry32(7 + seed);
  }

  private sample() {
    const rng = this.data, deg = Math.PI / 180, block = somewhere(rng);
    const shift: CameraShift = { yaw: (rng() * 2 - 1) * 10 * deg, pitch: (rng() * 2 - 1) * 10 * deg, dx: 0, dy: (rng() * 2 - 1) * 10 * 0.003, dz: (rng() * 2 - 1) * 10 * 0.003 };
    const noise = rng() * 0.1, dim = 0.6 + rng() * 0.6;
    // Half the hands are near their block: that is where the step is not just "full speed that way".
    let tip = somewhere(rng);
    if (rng() < 0.5) for (let k = 0; k < 20; k++) { const p: XY = [block[0] + (rng() - 0.5) * 0.12, block[1] + (rng() - 0.5) * 0.12]; if (reachable(p)) { tip = p; break; } }
    const image = picture(view(tip, block, shift), noise, dim, rng);
    const h = project([tip[0], tip[1], Z], shift), b = project([block[0], block[1], 0.04], shift);
    return { image, want: towards(tip, block), where: [h[0], -h[1], b[0], -b[1]] };
  }

  /** One optimiser step on a fresh batch; the mean action loss. */
  train(): number {
    const P = this.params, lr = this.step + 1 < this.steps * 0.7 ? 3e-3 : 1e-3; // the script counts steps from 1
    for (const p of Object.values(P)) p.grad.fill(0);
    let loss = 0;
    for (let s = 0; s < this.batch; s++) {
      const { image, want, where } = this.sample(), t = new Tape(), x = new Mat(3, SIZE * SIZE, image);
      const f1 = t.maxPool2(t.relu(t.conv2d(x, P.k1, P.b1, { h: SIZE, w: SIZE, k: 3, inputGrad: false })), { h: SIZE, w: SIZE });
      const f2 = t.relu(t.conv2d(f1, P.k2, P.b2, { h: HALF, w: HALF, k: 3 }));
      const maps = t.scale(t.conv2d(f2, P.k3, P.b3, { h: HALF, w: HALF, k: 1 }), HALF);
      const kx = t.matmul(t.softmax(t.marginal(maps, { h: HALF, w: HALF, axis: "x" })), this.pos), ky = t.matmul(t.softmax(t.marginal(maps, { h: HALF, w: HALF, axis: "y" })), this.pos);
      const keys = t.concatCols([t.transpose(kx), t.transpose(ky)]), h = t.relu(t.addRow(t.matmul(keys, P.w1), P.c1));
      const seen = t.addRow(t.matmul(t.concatCols([t.transpose(kx), t.transpose(ky)]), P.wa), P.ca);
      loss += t.mse(t.addRow(t.matmul(h, P.w2), P.c2), want, undefined, 1 / this.batch);
      t.mse(seen, where, undefined, 1 / this.batch);
      t.backward();
    }
    this.adam.step(lr);
    this.step++;
    return loss / this.batch;
  }

  /** The weights in the saved-checkpoint format, so Policy can run them. */
  save(seed: number): Saved {
    return { meta: { kind: "closed", seed, steps: this.step }, params: Object.fromEntries(Object.entries(this.params).map(([k, m]) => [k, { rows: m.rows, cols: m.cols, data: Array.from(m.data) }])), golden: [] };
  }
}

/**
 * Success rate of a keep-looking policy, measured as the research script measures it: from home, 40 steps, within 3 cm
 * for 3 steps running, blocks drawn from `seed`. The camera is turned by `shift`; nothing else is disturbed.
 */
export function evaluate(policy: Policy, shift: CameraShift, episodes: number, seed: number): number {
  const rng = mulberry32(seed);
  let wins = 0;
  for (let e = 0; e < episodes; e++) {
    const block = somewhere(rng);
    let tip: XY = [...HOME], held = 0;
    for (let t = 0; t < 40 && held < HOLD; t++) {
      tip = advance(tip, policy.run(picture(view(tip, block, shift))).out);
      held = Math.hypot(tip[0] - block[0], tip[1] - block[1]) < TOL ? held + 1 : 0;
    }
    if (held >= HOLD) wins++;
  }
  return wins / episodes;
}

/**
 * What "look once" computes: where on the plane z = h the camera it BELIEVES it has (unturned) would put this pixel.
 * Newton on the 2 × 2 problem, as in the research script.
 */
export function backProject(pixel: XY, h: number): XY {
  let guess: XY = [0.36, 0];
  for (let k = 0; k < 20; k++) {
    const at = project([guess[0], guess[1], h], NO_SHIFT), e = 1e-4, ax = project([guess[0] + e, guess[1], h], NO_SHIFT), ay = project([guess[0], guess[1] + e, h], NO_SHIFT);
    const j = [(ax[0] - at[0]) / e, (ay[0] - at[0]) / e, (ax[1] - at[1]) / e, (ay[1] - at[1]) / e], det = j[0] * j[3] - j[1] * j[2], rx = pixel[0] - at[0], ry = pixel[1] - at[1];
    guess = [guess[0] + (j[3] * rx - j[1] * ry) / det, guess[1] + (-j[2] * rx + j[0] * ry) / det];
  }
  return guess;
}
