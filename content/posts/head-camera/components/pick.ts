/**
 * Pick and place, as the research script (docs/research/head-camera/pick.test.ts.txt) trains and measures it: the world,
 * the teacher and the network's forward pass. tests/head-camera/pick.test.ts checks this port against the golden outputs
 * the script saved with each checkpoint, and that evaluate() reproduces the script's success rate.
 */
import { Mat, Tape, mulberry32 } from "@/lib/ml";
import { type Box, renderBoxes, skeleton, solveIK } from "@/content/posts/pcb-flip-vla/components/sim";
import { AREA, type CameraShift, HEAD, NO_SHIFT, type Vec3, type XY } from "./model";

export const PICK_SIZE = 48, K = 8;
const HALF = PICK_SIZE / 2;
/** Travel height, grasp height, largest steps, how close a grasp and a placement must be (3 cm: the hand hides the block). */
export const HIGH = 0.1, LOW = 0.035, STEP_XY = 0.025, STEP_Z = 0.02, GRAB_XY = 0.03, GRAB_Z = 0.01, PLACE_TOL = 0.03, MAX_STEPS = 90;
const CENTRE = [0.36, 0], SPAN = [0.14, 0.22], FUNNEL = 0.04, FLAT = 0.025, GRIP_XY = 0.022;
export const PICK_HOME: Vec3 = [0.36, 0, HIGH];
/**
 * Where the page lets the reader put the BLOCK. Training drew blocks from all of AREA, but measured on a 2 cm grid
 * (docs/research/head-camera/maps/) the side away from the head camera is the arm's shadow: coming from the middle, the
 * hand and forearm stand between camera and block, and its pixels are gone with the hand still 8 cm off. Inside this
 * rectangle every cell placed 4–5 of 5. The pad may go anywhere in AREA: it is flat, large, and seen past the hand.
 */
export const BLOCK_AREA = { x: [0.24, 0.5], y: [-0.1, 0.22] } as const;
export const inBlockArea = (p: XY): XY => [Math.max(BLOCK_AREA.x[0], Math.min(BLOCK_AREA.x[1], p[0])), Math.max(BLOCK_AREA.y[0], Math.min(BLOCK_AREA.y[1], p[1]))];
/** A layout for the page: the block inside BLOCK_AREA, the pad anywhere at least 12 cm from it. */
export function layout(rng: () => number): { block: XY; pad: XY } {
  for (;;) {
    const block: XY = [BLOCK_AREA.x[0] + rng() * (BLOCK_AREA.x[1] - BLOCK_AREA.x[0]), BLOCK_AREA.y[0] + rng() * (BLOCK_AREA.y[1] - BLOCK_AREA.y[0])];
    if (!usable(block)) continue;
    for (let k = 0; k < 50; k++) { const pad = anywhere(rng); if (Math.hypot(pad[0] - block[0], pad[1] - block[1]) > 0.12) return { block, pad }; }
  }
}

export interface PickState { hand: Vec3; closed: boolean; holding: boolean; block: XY; pad: XY }

const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const flat = (c: Vec3, h: Vec3, top: [number, number, number]): Box => ({ c, u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], h, top });
const clip = (v: number) => Math.max(-1, Math.min(1, v));
const reach = (x: number, y: number, z: number) => solveIK([x, y, z], 0) !== null;
/** Reachable both high and low, so it can be picked from and put down on. */
export const usable = (p: XY) => reach(p[0], p[1], HIGH) && reach(p[0], p[1], LOW);
export const pickBones = (hand: Vec3): Vec3[] | null => { const q = solveIK(hand, 0); return q ? skeleton(q) : null; };
export function anywhere(rng: () => number): XY {
  for (;;) { const p: XY = [AREA.x[0] + rng() * (AREA.x[1] - AREA.x[0]), AREA.y[0] + rng() * (AREA.y[1] - AREA.y[0])]; if (usable(p)) return p; }
}
/** A block and a pad at least 12 cm apart. */
export function apart(rng: () => number): [XY, XY] {
  const b = anywhere(rng);
  for (;;) { const t = anywhere(rng); if (Math.hypot(t[0] - b[0], t[1] - b[1]) > 0.12) return [b, t]; }
}

export function pickScene(s: PickState): Box[] {
  const boxes: Box[] = [flat([0.34, 0, -0.01], [0.4, 0.36, 0.01], [196, 198, 208]), flat([s.pad[0], s.pad[1], 0.001], [0.035, 0.035, 0.001], [70, 190, 90])];
  const q = solveIK(s.hand, 0);
  if (q) {
    const [shoulder, elbow, wrist, end] = skeleton(q), up: Vec3 = [0, 0, 1];
    const link = (from: Vec3, to: Vec3, thick: number) => {
      const u = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]), v = unit(cross(up, u)), n = cross(u, v);
      boxes.push({ c: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], u, v, n, h: [Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / 2, thick, thick], top: [240, 140, 40] });
    };
    boxes.push(flat([0, 0, shoulder[2] / 2], [0.035, 0.035, shoulder[2] / 2], [52, 56, 70]));
    link(shoulder, elbow, 0.016); link(elbow, wrist, 0.014);
    // The hand: a cyan palm above two jaws, wider apart when open.
    const [x, y, z] = end, gap = s.closed ? 0.022 : 0.034;
    boxes.push(flat([x, y, z + 0.03], [0.022, 0.03, 0.008], [60, 200, 230]));
    boxes.push(flat([x, y - gap, z + 0.01], [0.012, 0.004, 0.022], [60, 200, 230]), flat([x, y + gap, z + 0.01], [0.012, 0.004, 0.022], [60, 200, 230]));
    link(wrist, [x, y, z + 0.035], 0.014);
  }
  const b: Vec3 = s.holding ? [s.hand[0], s.hand[1], s.hand[2]] : [s.block[0], s.block[1], 0.02];
  boxes.push(flat(b, [0.02, 0.02, 0.02], [214, 60, 60]));
  return boxes;
}
export const pickView = (s: PickState, shift: CameraShift, size = PICK_SIZE) => renderBoxes(pickScene(s), HEAD, shift, size, 2);

/** Channel-first 0…1 at 48 px. */
export function pickPicture(bytes: Uint8Array, noise = 0, dim = 1, rng: () => number = Math.random): Float64Array {
  const n = PICK_SIZE * PICK_SIZE, out = new Float64Array(3 * n), gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { let v = (bytes[i * 3 + c] / 255) * dim; if (noise) v += noise * gauss(); out[c * n + i] = Math.max(0, Math.min(1, v)); }
  return out;
}

/**
 * The teacher: [dx, dy, dz, grip]. Always head for the goal (the block, or the pad once holding) and hold a height that
 * falls from HIGH to LOW as the goal comes near; grip (or let go) once low and close.
 */
export function teacher(s: PickState): number[] {
  const goal = s.holding ? s.pad : s.block, gx = goal[0] - s.hand[0], gy = goal[1] - s.hand[1], far = Math.hypot(gx, gy);
  if (!s.holding && s.closed) return [0, 0, 1, -1]; // closed on nothing: open and back up
  const height = LOW + (HIGH - LOW) * Math.min(1, Math.max(0, (far - FLAT) / FUNNEL));
  const move = [clip(gx / STEP_XY), clip(gy / STEP_XY), clip((height - s.hand[2]) / STEP_Z), 0];
  if (far < GRIP_XY && s.hand[2] < LOW + 0.008) move[3] = s.holding ? -1 : 1;
  return move;
}

/** One step of the world, in place. "placed" when the block is let go on the pad, "dropped" when let go anywhere else. */
export function pickAct(s: PickState, a: number[]): "placed" | "dropped" | "grasped" | null {
  const next: Vec3 = [s.hand[0] + clip(a[0]) * STEP_XY, s.hand[1] + clip(a[1]) * STEP_XY, Math.max(LOW - 0.005, Math.min(HIGH + 0.02, s.hand[2] + clip(a[2]) * STEP_Z))];
  if (reach(...next)) s.hand = next;
  if (s.holding) s.block = [s.hand[0], s.hand[1]];
  if (a[3] > 0.5 && !s.closed) {
    s.closed = true;
    if (Math.hypot(s.hand[0] - s.block[0], s.hand[1] - s.block[1]) < GRAB_XY && s.hand[2] < LOW + GRAB_Z) { s.holding = true; return "grasped"; }
  } else if (a[3] < -0.5 && s.closed) {
    s.closed = false;
    if (s.holding) { s.holding = false; return Math.hypot(s.block[0] - s.pad[0], s.block[1] - s.pad[1]) < PLACE_TOL ? "placed" : "dropped"; }
  }
  return null;
}

/** What keep-looking is told beside the picture: the hand's height and whether the gripper is closed. Not its x–y. */
export const feelOf = (s: PickState): number[] => [(s.hand[2] - (LOW + HIGH) / 2) / ((HIGH - LOW) / 2), s.closed ? 1 : -1];
const unnorm = (o: number[]): XY => [CENTRE[0] + o[0] * SPAN[0], CENTRE[1] + o[1] * SPAN[1]];

export type PickSaved = { meta: { kind: "open" | "closed"; size: number; seed: number; steps: number; shake: boolean; asTrained: number }; params: Record<string, { rows: number; cols: number; data: number[] }>; golden: { state: PickState; pitch: number; out: number[] }[] };

export class PickPolicy {
  private readonly P: Record<string, Mat>;
  private readonly pos = new Mat(HALF, 1, Float64Array.from({ length: HALF }, (_, i) => ((i + 0.5) / HALF) * 2 - 1));
  constructor(readonly saved: PickSaved) {
    if (saved.meta.size !== PICK_SIZE) throw new Error(`checkpoint is ${saved.meta.size} px, the page draws ${PICK_SIZE}`);
    this.P = Object.fromEntries(Object.entries(saved.params).map(([k, m]) => [k, new Mat(m.rows, m.cols, Float64Array.from(m.data))]));
  }
  get kind() { return this.saved.meta.kind; }
  run(image: Float64Array, feel: number[]): { out: number[]; keypoints: XY[] } {
    const P = this.P, t = new Tape(), S = PICK_SIZE, x = new Mat(3, S * S, image);
    const f1 = t.maxPool2(t.relu(t.conv2d(x, P.k1, P.b1, { h: S, w: S, k: 3, inputGrad: false })), { h: S, w: S });
    const f2 = t.relu(t.conv2d(f1, P.k2, P.b2, { h: HALF, w: HALF, k: 3 }));
    const maps = t.scale(t.conv2d(f2, P.k3, P.b3, { h: HALF, w: HALF, k: 1 }), HALF);
    const kx = t.matmul(t.softmax(t.marginal(maps, { h: HALF, w: HALF, axis: "x" })), this.pos), ky = t.matmul(t.softmax(t.marginal(maps, { h: HALF, w: HALF, axis: "y" })), this.pos);
    const keys = t.concatCols([t.transpose(kx), t.transpose(ky)]);
    const input = this.kind === "closed" ? t.concatCols([keys, new Mat(1, feel.length, Float64Array.from(feel))]) : keys;
    const h = t.relu(t.addRow(t.matmul(input, P.w1), P.c1));
    return { out: Array.from(t.addRow(t.matmul(h, P.w2), P.c2).data), keypoints: Array.from({ length: K }, (_, k) => [kx.data[k], ky.data[k]] as XY) };
  }
  /** look-once's answer: where it believes the block and the pad are. */
  static believed(out: number[]): { block: XY; pad: XY } { return { block: unnorm(out), pad: unnorm(out.slice(2)) }; }
}

/**
 * What a driver does next. keep-looking asks the network with a fresh picture. look-once took one picture at the start
 * (`belief`) and lets the teacher work from that belief with perfect joints, never looking again.
 */
export function decide(policy: PickPolicy, s: PickState, shift: CameraShift, belief: { block: XY; pad: XY } | null, look: { noise?: number; dim?: number } = {}): { action: number[]; keypoints: XY[] | null; bytes: Uint8Array | null } {
  if (policy.kind === "open") {
    if (!belief) throw new Error("look-once needs its belief");
    return { action: teacher({ ...s, block: s.holding ? [s.hand[0], s.hand[1]] : belief.block, pad: belief.pad }), keypoints: null, bytes: null };
  }
  const bytes = pickView(s, shift), r = policy.run(pickPicture(bytes, look.noise, look.dim), feelOf(s));
  return { action: r.out, keypoints: r.keypoints, bytes };
}

export type PickCondition = { shift: CameraShift; movePad?: boolean; moveBlock?: boolean };
/** Success rate as the script measures it: 90 steps, blocks and pads drawn from `seed`. */
export function evaluatePick(policy: PickPolicy, condition: PickCondition, episodes: number, seed: number): { success: number; grasped: number } {
  const rng = mulberry32(seed);
  let wins = 0, grasped = 0;
  for (let e = 0; e < episodes; e++) {
    const [block, pad] = apart(rng), s: PickState = { hand: [...PICK_HOME], closed: false, holding: false, block, pad };
    const belief = policy.kind === "open" ? PickPolicy.believed(policy.run(pickPicture(pickView(s, condition.shift)), []).out) : null;
    let done = false, everHeld = false, padMoved = false;
    for (let t = 0; t < MAX_STEPS && !done; t++) {
      if (condition.moveBlock && t === 3 && !s.holding) { const [b] = apart(rng); if (Math.hypot(b[0] - s.pad[0], b[1] - s.pad[1]) > 0.12) s.block = b; }
      if (condition.movePad && s.holding && !padMoved) { padMoved = true; const [, p] = apart(rng); if (Math.hypot(p[0] - s.hand[0], p[1] - s.hand[1]) > 0.08) s.pad = p; }
      const r = pickAct(s, decide(policy, s, condition.shift, belief).action);
      everHeld ||= s.holding;
      if (r === "placed") { wins++; done = true; } else if (r === "dropped") done = true;
    }
    if (everHeld) grasped++;
  }
  return { success: wins / episodes, grasped: grasped / episodes };
}
export { NO_SHIFT };
