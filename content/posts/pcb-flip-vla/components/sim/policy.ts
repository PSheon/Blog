import { PARAMS } from "./params";
import { ACTION_TOKENS, STILL } from "./tokens";

/**
 * The model's forward pass on the CPU, for readers without WebGPU, for node scripts and for tests. Inference only: no
 * tape, f32, and the prompt (pictures, words, the arm's own joints, the last three steps) is run once per step; the five
 * action tokens are then produced one at a time against cached keys and values. It must agree with
 * scripts/train-vla/model.py to the last decimal that f32 allows: tests/vla/policy.test.ts holds it to that.
 */

export type Manifest = { label: string; frames: number; d: number; layers: number; heads: number; floats: number; tensors: { name: string; shape: number[]; offset: number }[] };
type Tensor = { shape: number[]; data: Float32Array };

const PATCH = 8, SIDE = PARAMS.image / PATCH, PER_FRAME = SIDE * SIDE, WORDS = 6, HISTORY = 3, BINS = PARAMS.bins;
/** A step that did nothing, for the history before the episode began. */
export const IDLE_TOKENS = [STILL, STILL, STILL, STILL, BINS];

export class PolicyNet {
  private readonly w = new Map<string, Tensor>();
  readonly frames: number;
  private readonly d: number;
  private readonly layers: number;
  private readonly heads: number;

  constructor(manifest: Manifest, buffer: ArrayBuffer) {
    const all = new Float32Array(buffer);
    for (const t of manifest.tensors) this.w.set(t.name, { shape: t.shape, data: all.subarray(t.offset, t.offset + t.shape.reduce((a, b) => a * b, 1)) });
    this.frames = manifest.frames; this.d = manifest.d; this.layers = manifest.layers; this.heads = manifest.heads;
  }

  private t(name: string): Float32Array { const t = this.w.get(name); if (!t) throw new Error(`checkpoint has no tensor ${name}`); return t.data; }

  /** y = x · Wᵀ + b for `rows` rows; W is [out × in] as PyTorch keeps it. */
  private linear(x: Float32Array, rows: number, inSize: number, outSize: number, name: string, bias: boolean): Float32Array {
    const W = this.t(`${name}.weight`), b = bias ? this.t(`${name}.bias`) : null, y = new Float32Array(rows * outSize);
    for (let r = 0; r < rows; r++) for (let o = 0; o < outSize; o++) {
      let sum = b ? b[o] : 0;
      const wo = o * inSize, xo = r * inSize;
      for (let i = 0; i < inSize; i++) sum += x[xo + i] * W[wo + i];
      y[r * outSize + o] = sum;
    }
    return y;
  }

  private norm(x: Float32Array, rows: number, name: string): Float32Array {
    const d = this.d, g = this.t(`${name}.weight`), b = this.t(`${name}.bias`), y = new Float32Array(x.length);
    for (let r = 0; r < rows; r++) {
      let mean = 0, variance = 0;
      for (let i = 0; i < d; i++) mean += x[r * d + i];
      mean /= d;
      for (let i = 0; i < d; i++) variance += (x[r * d + i] - mean) ** 2;
      const inv = 1 / Math.sqrt(variance / d + 1e-5);
      for (let i = 0; i < d; i++) y[r * d + i] = (x[r * d + i] - mean) * inv * g[i] + b[i];
    }
    return y;
  }

  /**
   * One step of the policy. `frames` are the last k pictures (oldest first), `history` the last three steps' tokens.
   * Returns the five tokens and, per token, how much the last layer looked at each of the prompt's positions (heads averaged).
   */
  act(frames: Uint8Array[], words: number[], proprio: number[], history: number[][]): { tokens: number[]; logits: Float32Array[]; attention: Float32Array[] } {
    const d = this.d, prefix = this.frames * PER_FRAME + WORDS + 1, past = history.flat(), T0 = prefix + past.length;
    const x = new Float32Array((T0 + ACTION_TOKENS) * d);
    // pictures
    const patches = new Float32Array(this.frames * PER_FRAME * PATCH * PATCH * 3);
    frames.forEach((frame, f) => { for (let py = 0; py < SIDE; py++) for (let px = 0; px < SIDE; px++) for (let y = 0; y < PATCH; y++) for (let xx = 0; xx < PATCH; xx++) for (let c = 0; c < 3; c++) patches[(((f * PER_FRAME + py * SIDE + px) * PATCH + y) * PATCH + xx) * 3 + c] = frame[((py * PATCH + y) * PARAMS.image + px * PATCH + xx) * 3 + c] / 255; });
    x.set(this.linear(patches, this.frames * PER_FRAME, PATCH * PATCH * 3, d, "patch", true));
    const patchPos = this.t("patch_pos.weight"), framePos = this.t("frame_pos.weight");
    for (let f = 0; f < this.frames; f++) for (let p = 0; p < PER_FRAME; p++) for (let i = 0; i < d; i++) x[(f * PER_FRAME + p) * d + i] += patchPos[p * d + i] + framePos[f * d + i];
    // words, then what the arm feels
    const word = this.t("word.weight"), wordPos = this.t("word_pos.weight"), at = this.frames * PER_FRAME;
    words.forEach((id, k) => { for (let i = 0; i < d; i++) x[(at + k) * d + i] = word[id * d + i] + wordPos[k * d + i]; });
    x.set(this.linear(Float32Array.from(proprio), 1, proprio.length, d, "feel", true), (at + WORDS) * d);
    // action tokens: `n` is the position among the (history + current) action tokens
    const action = this.t("action.weight"), slot = this.t("slot.weight"), step = this.t("step.weight");
    const embed = (token: number, n: number, row: number) => { for (let i = 0; i < d; i++) x[row * d + i] = action[token * d + i] + slot[(n % ACTION_TOKENS) * d + i] + step[Math.floor(n / ACTION_TOKENS) * d + i]; };
    past.forEach((token, n) => embed(token, n, prefix + n));

    const dh = d / this.heads, keys: Float32Array[] = [], values: Float32Array[] = [], total = T0 + ACTION_TOKENS - 1;
    for (let l = 0; l < this.layers; l++) { keys.push(new Float32Array(total * d)); values.push(new Float32Array(total * d)); }
    const tokens: number[] = [], logitsOut: Float32Array[] = [], attention: Float32Array[] = [];

    /** Runs rows [from, to) through every layer, filling the caches, and returns the last row's final hidden state. */
    const run = (from: number, to: number): Float32Array => {
      const rows = to - from;
      let h = x.slice(from * d, to * d);
      for (let l = 0; l < this.layers; l++) {
        const name = `blocks.${l}`, qkv = this.linear(this.norm(h, rows, `${name}.ln1`), rows, d, 3 * d, `${name}.qkv`, false), mixed = new Float32Array(rows * d), seen = l === this.layers - 1 && rows === 1 ? new Float32Array(to) : null;
        for (let r = 0; r < rows; r++) { keys[l].set(qkv.subarray(r * 3 * d + d, r * 3 * d + 2 * d), (from + r) * d); values[l].set(qkv.subarray(r * 3 * d + 2 * d, r * 3 * d + 3 * d), (from + r) * d); }
        for (let r = 0; r < rows; r++) {
          const pos = from + r, last = pos < prefix ? prefix - 1 : pos; // the prompt sees itself whole; everything after is causal
          for (let head = 0; head < this.heads; head++) {
            const scores = new Float32Array(last + 1);
            let top = -Infinity;
            for (let j = 0; j <= last; j++) { let s = 0; for (let i = 0; i < dh; i++) s += qkv[r * 3 * d + head * dh + i] * keys[l][j * d + head * dh + i]; scores[j] = s / Math.sqrt(dh); top = Math.max(top, scores[j]); }
            let sum = 0;
            for (let j = 0; j <= last; j++) sum += scores[j] = Math.exp(scores[j] - top);
            for (let j = 0; j <= last; j++) { const a = scores[j] / sum; if (seen) seen[j] += a / this.heads; for (let i = 0; i < dh; i++) mixed[r * d + head * dh + i] += a * values[l][j * d + head * dh + i]; }
          }
        }
        if (seen) attention.push(seen);
        const attended = this.linear(mixed, rows, d, d, `${name}.out`, false);
        for (let i = 0; i < h.length; i++) h[i] += attended[i];
        const up = this.linear(this.norm(h, rows, `${name}.ln2`), rows, d, 4 * d, `${name}.up`, true);
        for (let i = 0; i < up.length; i++) if (up[i] < 0) up[i] = 0;
        const down = this.linear(up, rows, 4 * d, d, `${name}.down`, true);
        for (let i = 0; i < h.length; i++) h[i] += down[i];
      }
      return h.slice((rows - 1) * d);
    };

    let hidden = run(0, T0);
    for (let s = 0; s < ACTION_TOKENS; s++) {
      const logits = this.linear(this.norm(hidden, 1, "ln"), 1, d, BINS + 2, "head", false);
      let best = s === 4 ? BINS : 0;
      for (let k = s === 4 ? BINS : 0; k < (s === 4 ? BINS + 2 : BINS); k++) if (logits[k] > logits[best]) best = k;
      tokens.push(best); logitsOut.push(logits);
      if (s === ACTION_TOKENS - 1) break;
      embed(best, HISTORY * ACTION_TOKENS + s, T0 + s);
      hidden = run(T0 + s, T0 + s + 1);
    }
    return { tokens, logits: logitsOut, attention };
  }
}
