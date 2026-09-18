import { Mat, type Tape } from "./autograd";
import type { Rng } from "./neuroevolution";

export interface TransformerConfig {
  vocab: number;
  /** Longest sequence the model can take. */
  ctx: number;
  /** Width of the residual stream. */
  d: number;
  heads: number;
  layers: number;
}

export interface ForwardResult {
  /** [T × vocab] — row t scores the token at t + 1. */
  logits: Mat;
  /** attention[layer][head] is a T×T row-major matrix: how much each position reads from each earlier one. */
  attention: Float64Array[][];
}

/** Box–Muller normal sample from a uniform rng. */
function normal(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/**
 * A decoder-only Transformer (GPT-style, pre-LayerNorm) small enough to train in a
 * browser tab. One sequence at a time: a batch is a loop that lets gradients add up.
 */
export class Transformer {
  readonly params: Record<string, Mat> = {};

  constructor(
    readonly config: TransformerConfig,
    rng: Rng = Math.random,
  ) {
    const { vocab, ctx, d, heads, layers } = config;
    if (d % heads !== 0) throw new Error(`Transformer: width ${d} is not divisible by ${heads} heads`);

    const weights = (rows: number, cols: number, std: number) => {
      const m = new Mat(rows, cols);
      for (let i = 0; i < m.data.length; i++) m.data[i] = normal(rng) * std;
      return m;
    };
    const ones = (cols: number) => new Mat(1, cols, new Float64Array(cols).fill(1));
    const std = 1 / Math.sqrt(d);
    // Layers write into a shared residual stream; shrink their output so depth doesn't blow it up.
    const outStd = std / Math.sqrt(2 * layers);

    this.params.tok = weights(vocab, d, 0.1);
    this.params.pos = weights(ctx, d, 0.1);
    for (let l = 0; l < layers; l++) {
      const p = `l${l}.`;
      this.params[p + "ln1.g"] = ones(d);
      this.params[p + "ln1.b"] = new Mat(1, d);
      this.params[p + "wq"] = weights(d, d, std);
      this.params[p + "wk"] = weights(d, d, std);
      this.params[p + "wv"] = weights(d, d, std);
      this.params[p + "wo"] = weights(d, d, outStd);
      this.params[p + "ln2.g"] = ones(d);
      this.params[p + "ln2.b"] = new Mat(1, d);
      this.params[p + "w1"] = weights(d, 4 * d, std);
      this.params[p + "b1"] = new Mat(1, 4 * d);
      this.params[p + "w2"] = weights(4 * d, d, outStd / 2);
      this.params[p + "b2"] = new Mat(1, d);
    }
    this.params["lnf.g"] = ones(d);
    this.params["lnf.b"] = new Mat(1, d);
    this.params.unembed = weights(d, vocab, std);
  }

  parameterCount(): number {
    return Object.values(this.params).reduce((n, p) => n + p.data.length, 0);
  }

  zeroGrad() {
    for (const p of Object.values(this.params)) p.grad.fill(0);
  }

  forward(tape: Tape, ids: ArrayLike<number>): ForwardResult {
    const { d, heads, layers, ctx } = this.config;
    const T = ids.length;
    if (T > ctx) throw new Error(`Transformer: sequence of ${T} exceeds context ${ctx}`);
    const P = this.params;
    const dh = d / heads;
    const attention: Float64Array[][] = [];

    // Token identity + position, added together: the residual stream starts here.
    let x = tape.add(tape.embed(P.tok, ids), tape.embed(P.pos, Array.from({ length: T }, (_, t) => t)));

    for (let l = 0; l < layers; l++) {
      const p = `l${l}.`;

      // --- Self-attention: every position gathers information from earlier ones.
      const h = tape.layerNorm(x, P[p + "ln1.g"], P[p + "ln1.b"]);
      const q = tape.matmul(h, P[p + "wq"]);
      const k = tape.matmul(h, P[p + "wk"]);
      const v = tape.matmul(h, P[p + "wv"]);
      const maps: Float64Array[] = [];
      const mixed: Mat[] = [];
      for (let head = 0; head < heads; head++) {
        const qh = tape.sliceCols(q, head * dh, dh);
        const kh = tape.sliceCols(k, head * dh, dh);
        const vh = tape.sliceCols(v, head * dh, dh);
        const scores = tape.scale(tape.matmul(qh, tape.transpose(kh)), 1 / Math.sqrt(dh));
        const weights = tape.causalSoftmax(scores);
        maps.push(weights.data);
        mixed.push(tape.matmul(weights, vh));
      }
      attention.push(maps);
      x = tape.add(x, tape.matmul(tape.concatCols(mixed), P[p + "wo"]));

      // --- MLP: each position thinks about what it gathered, on its own.
      const m = tape.layerNorm(x, P[p + "ln2.g"], P[p + "ln2.b"]);
      const hidden = tape.relu(tape.addRow(tape.matmul(m, P[p + "w1"]), P[p + "b1"]));
      x = tape.add(x, tape.addRow(tape.matmul(hidden, P[p + "w2"]), P[p + "b2"]));
    }

    const logits = tape.matmul(tape.layerNorm(x, P["lnf.g"], P["lnf.b"]), P.unembed);
    return { logits, attention };
  }
}

/** Adam: per-parameter step sizes from running averages of the gradient and its square. */
export class Adam {
  private readonly m = new Map<string, Float64Array>();
  private readonly v = new Map<string, Float64Array>();
  private t = 0;

  constructor(
    private readonly params: Record<string, Mat>,
    private readonly beta1 = 0.9,
    private readonly beta2 = 0.999,
    private readonly eps = 1e-8,
  ) {
    for (const [name, p] of Object.entries(params)) {
      this.m.set(name, new Float64Array(p.data.length));
      this.v.set(name, new Float64Array(p.data.length));
    }
  }

  step(lr: number) {
    this.t++;
    const c1 = 1 - this.beta1 ** this.t;
    const c2 = 1 - this.beta2 ** this.t;
    for (const [name, p] of Object.entries(this.params)) {
      const m = this.m.get(name)!;
      const v = this.v.get(name)!;
      for (let i = 0; i < p.data.length; i++) {
        const g = p.grad[i];
        m[i] = this.beta1 * m[i] + (1 - this.beta1) * g;
        v[i] = this.beta2 * v[i] + (1 - this.beta2) * g * g;
        p.data[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + this.eps);
      }
    }
  }
}
