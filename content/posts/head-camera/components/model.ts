/**
 * The head-camera world and policy, exactly as the research script (docs/research/head-camera/spike.test.ts.txt) trains
 * and measures them: the same arm, bench, camera, picture and network. tests/head-camera/model.test.ts loads the saved
 * weights and checks this file reproduces the script's outputs to 1e-9.
 */
import { Mat, Tape } from "@/lib/ml";
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

type Saved = { meta: { kind: Kind; seed: number; steps: number }; params: Record<string, { rows: number; cols: number; data: number[] }>; golden: { tip: XY; block: XY; pitch: number; out: XY }[] };

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
