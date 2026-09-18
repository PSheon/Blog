/**
 * A very small reverse-mode autodiff engine over 2-D matrices — just the operations a
 * Transformer needs. Every op computes its result immediately and pushes a closure that
 * knows how to send gradients back; backward() runs those closures in reverse.
 */

export class Mat {
  readonly data: Float64Array;
  readonly grad: Float64Array;

  constructor(
    readonly rows: number,
    readonly cols: number,
    data?: Float64Array,
  ) {
    if (data && data.length !== rows * cols) {
      throw new Error(`Mat ${rows}×${cols} needs ${rows * cols} values, got ${data.length}`);
    }
    this.data = data ?? new Float64Array(rows * cols);
    this.grad = new Float64Array(rows * cols);
  }
}

export class Tape {
  private readonly backwardOps: (() => void)[] = [];

  /** Run every recorded op's backward step, last first. Seed gradients come from a loss op. */
  backward() {
    for (let i = this.backwardOps.length - 1; i >= 0; i--) this.backwardOps[i]();
  }

  private record(fn: () => void) {
    this.backwardOps.push(fn);
  }

  matmul(a: Mat, b: Mat): Mat {
    if (a.cols !== b.rows) throw new Error(`matmul: ${a.rows}×${a.cols} · ${b.rows}×${b.cols}`);
    const n = a.rows, k = a.cols, m = b.cols;
    const out = new Mat(n, m);
    for (let i = 0; i < n; i++)
      for (let p = 0; p < k; p++) {
        const v = a.data[i * k + p];
        if (v === 0) continue;
        for (let j = 0; j < m; j++) out.data[i * m + j] += v * b.data[p * m + j];
      }
    this.record(() => {
      // dA = dOut · Bᵀ,  dB = Aᵀ · dOut
      for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++) {
          const g = out.grad[i * m + j];
          if (g === 0) continue;
          for (let p = 0; p < k; p++) {
            a.grad[i * k + p] += g * b.data[p * m + j];
            b.grad[p * m + j] += g * a.data[i * k + p];
          }
        }
    });
    return out;
  }

  add(a: Mat, b: Mat): Mat {
    const out = new Mat(a.rows, a.cols);
    for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] + b.data[i];
    this.record(() => {
      for (let i = 0; i < out.grad.length; i++) {
        a.grad[i] += out.grad[i];
        b.grad[i] += out.grad[i];
      }
    });
    return out;
  }

  /** Add a 1×cols bias to every row. */
  addRow(a: Mat, bias: Mat): Mat {
    const out = new Mat(a.rows, a.cols);
    for (let i = 0; i < a.rows; i++)
      for (let j = 0; j < a.cols; j++) out.data[i * a.cols + j] = a.data[i * a.cols + j] + bias.data[j];
    this.record(() => {
      for (let i = 0; i < a.rows; i++)
        for (let j = 0; j < a.cols; j++) {
          const g = out.grad[i * a.cols + j];
          a.grad[i * a.cols + j] += g;
          bias.grad[j] += g;
        }
    });
    return out;
  }

  scale(a: Mat, s: number): Mat {
    const out = new Mat(a.rows, a.cols);
    for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] * s;
    this.record(() => {
      for (let i = 0; i < out.grad.length; i++) a.grad[i] += out.grad[i] * s;
    });
    return out;
  }

  transpose(a: Mat): Mat {
    const out = new Mat(a.cols, a.rows);
    for (let i = 0; i < a.rows; i++) for (let j = 0; j < a.cols; j++) out.data[j * a.rows + i] = a.data[i * a.cols + j];
    this.record(() => {
      for (let i = 0; i < a.rows; i++) for (let j = 0; j < a.cols; j++) a.grad[i * a.cols + j] += out.grad[j * a.rows + i];
    });
    return out;
  }

  relu(a: Mat): Mat {
    const out = new Mat(a.rows, a.cols);
    for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] > 0 ? a.data[i] : 0;
    this.record(() => {
      for (let i = 0; i < out.grad.length; i++) if (a.data[i] > 0) a.grad[i] += out.grad[i];
    });
    return out;
  }

  /** Normalise each row to zero mean and unit variance, then apply a learned gain and bias. */
  layerNorm(x: Mat, gain: Mat, bias: Mat, eps = 1e-5): Mat {
    const { rows, cols } = x;
    const out = new Mat(rows, cols);
    const norm = new Float64Array(rows * cols);
    const invStd = new Float64Array(rows);
    for (let r = 0; r < rows; r++) {
      let mean = 0;
      for (let j = 0; j < cols; j++) mean += x.data[r * cols + j];
      mean /= cols;
      let variance = 0;
      for (let j = 0; j < cols; j++) variance += (x.data[r * cols + j] - mean) ** 2;
      invStd[r] = 1 / Math.sqrt(variance / cols + eps);
      for (let j = 0; j < cols; j++) {
        norm[r * cols + j] = (x.data[r * cols + j] - mean) * invStd[r];
        out.data[r * cols + j] = norm[r * cols + j] * gain.data[j] + bias.data[j];
      }
    }
    this.record(() => {
      for (let r = 0; r < rows; r++) {
        let sumG = 0, sumGN = 0;
        for (let j = 0; j < cols; j++) {
          const i = r * cols + j;
          gain.grad[j] += out.grad[i] * norm[i];
          bias.grad[j] += out.grad[i];
          const g = out.grad[i] * gain.data[j];
          sumG += g;
          sumGN += g * norm[i];
        }
        for (let j = 0; j < cols; j++) {
          const i = r * cols + j;
          const g = out.grad[i] * gain.data[j];
          x.grad[i] += (invStd[r] / cols) * (cols * g - sumG - norm[i] * sumGN);
        }
      }
    });
    return out;
  }

  /** Row-wise softmax where position i may only see positions ≤ i. Input must be square. */
  causalSoftmax(scores: Mat): Mat {
    const n = scores.rows;
    const out = new Mat(n, n);
    for (let i = 0; i < n; i++) {
      let max = -Infinity;
      for (let j = 0; j <= i; j++) max = Math.max(max, scores.data[i * n + j]);
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += out.data[i * n + j] = Math.exp(scores.data[i * n + j] - max);
      for (let j = 0; j <= i; j++) out.data[i * n + j] /= sum;
    }
    this.record(() => {
      for (let i = 0; i < n; i++) {
        let dot = 0;
        for (let j = 0; j <= i; j++) dot += out.grad[i * n + j] * out.data[i * n + j];
        for (let j = 0; j <= i; j++) scores.grad[i * n + j] += out.data[i * n + j] * (out.grad[i * n + j] - dot);
      }
    });
    return out;
  }

  sliceCols(a: Mat, start: number, count: number): Mat {
    const out = new Mat(a.rows, count);
    for (let i = 0; i < a.rows; i++) for (let j = 0; j < count; j++) out.data[i * count + j] = a.data[i * a.cols + start + j];
    this.record(() => {
      for (let i = 0; i < a.rows; i++) for (let j = 0; j < count; j++) a.grad[i * a.cols + start + j] += out.grad[i * count + j];
    });
    return out;
  }

  concatCols(parts: Mat[]): Mat {
    const rows = parts[0].rows;
    const cols = parts.reduce((s, p) => s + p.cols, 0);
    const out = new Mat(rows, cols);
    let offset = 0;
    const offsets = parts.map((p) => {
      const o = offset;
      for (let i = 0; i < rows; i++) for (let j = 0; j < p.cols; j++) out.data[i * cols + o + j] = p.data[i * p.cols + j];
      offset += p.cols;
      return o;
    });
    this.record(() => {
      parts.forEach((p, k) => {
        for (let i = 0; i < rows; i++) for (let j = 0; j < p.cols; j++) p.grad[i * p.cols + j] += out.grad[i * cols + offsets[k] + j];
      });
    });
    return out;
  }

  /** Look up one row of `table` per id. */
  embed(table: Mat, ids: ArrayLike<number>): Mat {
    const d = table.cols;
    const out = new Mat(ids.length, d);
    for (let t = 0; t < ids.length; t++) out.data.set(table.data.subarray(ids[t] * d, ids[t] * d + d), t * d);
    this.record(() => {
      for (let t = 0; t < ids.length; t++) for (let j = 0; j < d; j++) table.grad[ids[t] * d + j] += out.grad[t * d + j];
    });
    return out;
  }

  /**
   * Mean cross-entropy between each row of logits and its target class. A target of −1
   * means "don't score this position". This is a loss: it seeds the backward pass.
   */
  crossEntropy(logits: Mat, targets: ArrayLike<number>, weight = 1): number {
    const { rows, cols } = logits;
    const probs = new Float64Array(rows * cols);
    let count = 0, loss = 0;
    for (let r = 0; r < rows; r++) {
      if (targets[r] < 0) continue;
      count++;
      let max = -Infinity;
      for (let j = 0; j < cols; j++) max = Math.max(max, logits.data[r * cols + j]);
      let sum = 0;
      for (let j = 0; j < cols; j++) sum += probs[r * cols + j] = Math.exp(logits.data[r * cols + j] - max);
      for (let j = 0; j < cols; j++) probs[r * cols + j] /= sum;
      loss -= Math.log(probs[r * cols + targets[r]]);
    }
    this.record(() => {
      for (let r = 0; r < rows; r++) {
        if (targets[r] < 0) continue;
        for (let j = 0; j < cols; j++) {
          logits.grad[r * cols + j] += ((probs[r * cols + j] - (j === targets[r] ? 1 : 0)) / count) * weight;
        }
      }
    });
    return count ? loss / count : 0;
  }

  /** Σ aᵢ·wᵢ with constant w — a scalar probe, used to test gradients. */
  sumProduct(a: Mat, w: Mat): number {
    let s = 0;
    for (let i = 0; i < a.data.length; i++) s += a.data[i] * w.data[i];
    this.record(() => {
      for (let i = 0; i < a.grad.length; i++) a.grad[i] += w.data[i];
    });
    return s;
  }
}
