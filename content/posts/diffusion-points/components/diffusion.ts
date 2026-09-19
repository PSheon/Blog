import { Adam, Mat, Tape } from "@/lib/ml";

/** Number of noise levels; level 0 is the clean shape, level T is pure Gaussian noise. */
export const T = 100;
/** Cosine schedule (Nichol & Dhariwal 2021): how much of the original point survives at each level. */
export const ALPHA_BAR = (() => {
  const f = (t: number) => Math.cos(((t / T + 0.008) / 1.008) * (Math.PI / 2)) ** 2;
  return Float64Array.from({ length: T + 1 }, (_, t) => f(t) / f(0));
})();

const TIME_FREQ = [1, 2, 4, 8], SPACE_FREQ = [1, 2, 4];
/** Every point is a position and a colour: x, y, z, then r, g, b, all in about [−1, 1]. */
export const DIMS = 6;
const BASE_INPUTS = DIMS + 3 * 2 * SPACE_FREQ.length + 2 * TIME_FREQ.length;

export type Rng = () => number;
export type Point = [number, number, number, number, number, number];
export type Shape = (rng: Rng) => Point;

export function gaussian(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Which shape a point should become: one weight per shape. [1, 0] is the first, [0.5, 0.5] is something in between. */
export type Condition = ArrayLike<number>;

/** What the network is shown for each point: where it is, a few sines of that, how noisy things are, and which shape is wanted. */
function features(x: ArrayLike<number>, n: number, level: (i: number) => number, classes: number, wanted: (i: number) => Condition): Mat {
  const inputs = BASE_INPUTS + classes, m = new Mat(n, inputs);
  for (let i = 0; i < n; i++) {
    let o = i * inputs;
    for (let k = 0; k < DIMS; k++) m.data[o++] = x[i * DIMS + k];
    for (const f of SPACE_FREQ) {
      for (let k = 0; k < 3; k++) {
        m.data[o++] = Math.sin(f * Math.PI * x[i * DIMS + k]);
        m.data[o++] = Math.cos(f * Math.PI * x[i * DIMS + k]);
      }
    }
    for (const f of TIME_FREQ) {
      m.data[o++] = Math.sin((f * Math.PI * level(i)) / T);
      m.data[o++] = Math.cos((f * Math.PI * level(i)) / T);
    }
    const c = wanted(i);
    for (let k = 0; k < classes; k++) m.data[o++] = c[k];
  }
  return m;
}

/**
 * A DDPM over single coloured 3-D points: an MLP that looks at a noisy point, is told which shape it belongs to,
 * and guesses the noise that was added to it.
 */
export class PointDiffusion {
  readonly params: Record<string, Mat>;
  private readonly adam: Adam;
  steps = 0;
  /** Smoothed training loss. */
  loss = 0;

  constructor(readonly classes = 1, readonly hidden = 96, private readonly rng: Rng = Math.random) {
    const init = (rows: number, cols: number) => {
      const m = new Mat(rows, cols);
      for (let i = 0; i < m.data.length; i++) m.data[i] = gaussian(rng) * Math.sqrt(2 / rows);
      return m;
    };
    this.params = {
      w1: init(BASE_INPUTS + classes, hidden), b1: new Mat(1, hidden),
      w2: init(hidden, hidden), b2: new Mat(1, hidden),
      w3: init(hidden, hidden), b3: new Mat(1, hidden),
      w4: init(hidden, DIMS), b4: new Mat(1, DIMS),
    };
    this.adam = new Adam(this.params);
  }

  get parameterCount() {
    return Object.values(this.params).reduce((n, m) => n + m.data.length, 0);
  }

  private predict(tape: Tape, x: Mat): Mat {
    const p = this.params;
    let h = tape.relu(tape.addRow(tape.matmul(x, p.w1), p.b1));
    h = tape.relu(tape.addRow(tape.matmul(h, p.w2), p.b2));
    h = tape.relu(tape.addRow(tape.matmul(h, p.w3), p.b3));
    return tape.addRow(tape.matmul(h, p.w4), p.b4);
  }

  /** One step: take clean points from the shapes, add a random amount of noise to each, ask the network which noise it was. */
  train(shapes: Shape[], batch = 256, lr = 2e-3) {
    const which = new Uint8Array(batch), hot = shapes.map((_, c) => Float64Array.from(shapes, (__, k) => (k === c ? 1 : 0)));
    const x = new Float64Array(batch * DIMS), noise = new Float64Array(batch * DIMS), levels = new Float64Array(batch);
    for (let i = 0; i < batch; i++) {
      which[i] = Math.floor(this.rng() * shapes.length);
      const p = shapes[which[i]](this.rng), t = 1 + Math.floor(this.rng() * T);
      levels[i] = t;
      for (let k = 0; k < DIMS; k++) {
        const e = gaussian(this.rng);
        noise[i * DIMS + k] = e;
        x[i * DIMS + k] = Math.sqrt(ALPHA_BAR[t]) * p[k] + Math.sqrt(1 - ALPHA_BAR[t]) * e;
      }
    }
    for (const m of Object.values(this.params)) m.grad.fill(0);
    const tape = new Tape(), loss = tape.mse(this.predict(tape, features(x, batch, (i) => levels[i], this.classes, (i) => hot[which[i]])), noise);
    tape.backward();
    this.adam.step(lr);
    this.steps++;
    this.loss = this.loss ? this.loss * 0.98 + loss * 0.02 : loss;
  }

  /** Move every point in `x` (in place) from noise level `from` down to `to`: one deterministic DDIM step. */
  denoise(x: Float64Array, from: number, to: number, wanted: (i: number) => Condition) {
    const n = x.length / DIMS, eps = this.predict(new Tape(), features(x, n, () => from, this.classes, wanted)).data;
    const a = ALPHA_BAR[from], b = ALPHA_BAR[to];
    for (let i = 0; i < x.length; i++) {
      const clean = Math.max(-1.5, Math.min(1.5, (x[i] - Math.sqrt(1 - a) * eps[i]) / Math.sqrt(a)));
      x[i] = Math.sqrt(b) * clean + Math.sqrt(1 - b) * eps[i];
    }
  }
}

/** The noise levels visited when sampling in `count` steps, from T down to 0. */
export function schedule(count: number): number[] {
  return Array.from({ length: count + 1 }, (_, k) => Math.round(T - (k * T) / count));
}

/** A clean point pushed to noise level `t`: what the network is trained on. */
export function diffuse(p: ArrayLike<number>, t: number, rng: Rng, out: Float64Array, at: number) {
  for (let k = 0; k < DIMS; k++) out[at + k] = Math.sqrt(ALPHA_BAR[t]) * p[k] + Math.sqrt(1 - ALPHA_BAR[t]) * gaussian(rng);
}
