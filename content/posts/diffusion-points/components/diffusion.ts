import { Adam, Mat, Tape } from "@/lib/ml";

/** Number of noise levels; level 0 is the clean shape, level T is pure Gaussian noise. */
export const T = 100;
/** Cosine schedule (Nichol & Dhariwal 2021): how much of the original point survives at each level. */
export const ALPHA_BAR = (() => {
  const f = (t: number) => Math.cos(((t / T + 0.008) / 1.008) * (Math.PI / 2)) ** 2;
  return Float64Array.from({ length: T + 1 }, (_, t) => f(t) / f(0));
})();

const TIME_FREQ = [1, 2, 4, 8], SPACE_FREQ = [1, 2, 4];
const INPUTS = 3 + 3 * 2 * SPACE_FREQ.length + 2 * TIME_FREQ.length;

export type Rng = () => number;
export type Shape = (rng: Rng) => [number, number, number];

export function gaussian(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** What the network is shown for each point: where it is, a few sines of that, and how noisy things are. */
function features(x: ArrayLike<number>, n: number, level: (i: number) => number): Mat {
  const m = new Mat(n, INPUTS);
  for (let i = 0; i < n; i++) {
    let o = i * INPUTS;
    for (let k = 0; k < 3; k++) m.data[o++] = x[i * 3 + k];
    for (const f of SPACE_FREQ) {
      for (let k = 0; k < 3; k++) {
        m.data[o++] = Math.sin(f * Math.PI * x[i * 3 + k]);
        m.data[o++] = Math.cos(f * Math.PI * x[i * 3 + k]);
      }
    }
    for (const f of TIME_FREQ) {
      m.data[o++] = Math.sin((f * Math.PI * level(i)) / T);
      m.data[o++] = Math.cos((f * Math.PI * level(i)) / T);
    }
  }
  return m;
}

/** A DDPM over single 3-D points: an MLP that looks at a noisy point and guesses the noise that was added to it. */
export class PointDiffusion {
  readonly params: Record<string, Mat>;
  private readonly adam: Adam;
  steps = 0;
  /** Smoothed training loss. */
  loss = 0;

  constructor(readonly hidden = 64, private readonly rng: Rng = Math.random) {
    const init = (rows: number, cols: number) => {
      const m = new Mat(rows, cols);
      for (let i = 0; i < m.data.length; i++) m.data[i] = gaussian(rng) * Math.sqrt(2 / rows);
      return m;
    };
    this.params = {
      w1: init(INPUTS, hidden), b1: new Mat(1, hidden),
      w2: init(hidden, hidden), b2: new Mat(1, hidden),
      w3: init(hidden, hidden), b3: new Mat(1, hidden),
      w4: init(hidden, 3), b4: new Mat(1, 3),
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

  /** One step: take clean points, add a random amount of noise to each, ask the network which noise it was. */
  train(shape: Shape, batch = 256, lr = 2e-3) {
    const x = new Float64Array(batch * 3), noise = new Float64Array(batch * 3), levels = new Float64Array(batch);
    for (let i = 0; i < batch; i++) {
      const p = shape(this.rng), t = 1 + Math.floor(this.rng() * T);
      levels[i] = t;
      for (let k = 0; k < 3; k++) {
        const e = gaussian(this.rng);
        noise[i * 3 + k] = e;
        x[i * 3 + k] = Math.sqrt(ALPHA_BAR[t]) * p[k] + Math.sqrt(1 - ALPHA_BAR[t]) * e;
      }
    }
    for (const m of Object.values(this.params)) m.grad.fill(0);
    const tape = new Tape(), loss = tape.mse(this.predict(tape, features(x, batch, (i) => levels[i])), noise);
    tape.backward();
    this.adam.step(lr);
    this.steps++;
    this.loss = this.loss ? this.loss * 0.98 + loss * 0.02 : loss;
  }

  /** Move every point in `x` (in place) from noise level `from` down to `to`: one deterministic DDIM step. */
  denoise(x: Float64Array, from: number, to: number) {
    const n = x.length / 3, eps = this.predict(new Tape(), features(x, n, () => from)).data;
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
