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

  // ---------------------------------------------------------------------------------------------
  // Image ops. A feature map is a Mat with one row per channel and height·width columns, so the
  // element-wise ops above (add, relu, scale) work on images unchanged.
  // ---------------------------------------------------------------------------------------------

  /**
   * Stride-1, "same"-padded convolution (cross-correlation, as in every DL framework).
   * x: [Cin, h·w], kernel: [Cout, Cin·k·k], bias: [1, Cout] → [Cout, h·w].
   */
  conv2d(x: Mat, kernel: Mat, bias: Mat, { h, w, k }: { h: number; w: number; k: number }): Mat {
    const cIn = x.rows, cOut = kernel.rows, kk = k * k, pad = (k - 1) >> 1;
    if (kernel.cols !== cIn * kk) {
      throw new Error(`conv2d: kernel expects ${kernel.cols / kk} input channels, got ${cIn}`);
    }
    if (x.cols !== h * w) throw new Error(`conv2d: input has ${x.cols} pixels, expected ${h}×${w}`);
    const out = new Mat(cOut, h * w);

    const hw = h * w;
    const X = x.data, K = kernel.data, O = out.data;

    // Loop order: kernel tap outermost, pixels innermost. For one tap (ky, kx) the set of output
    // pixels whose window stays inside the image is a plain rectangle, so the inner loop is a
    // branch-free run over contiguous memory — several times faster in a JS engine than testing
    // bounds per pixel. Forward and backward share `taps` so their index arithmetic cannot drift.
    const taps = (visit: (oBase: number, xBase: number, wi: number, y0: number, y1: number, x0: number, x1: number, shift: number) => void) => {
      for (let oc = 0; oc < cOut; oc++) {
        for (let ic = 0; ic < cIn; ic++) {
          for (let ky = 0; ky < k; ky++) {
            const dy = ky - pad;
            const y0 = Math.max(0, -dy), y1 = Math.min(h, h - dy);
            for (let kx = 0; kx < k; kx++) {
              const dx = kx - pad;
              const x0 = Math.max(0, -dx), x1 = Math.min(w, w - dx);
              visit(oc * hw, ic * hw, oc * cIn * kk + ic * kk + ky * k + kx, y0, y1, x0, x1, dy * w + dx);
            }
          }
        }
      }
    };

    for (let oc = 0; oc < cOut; oc++) O.fill(bias.data[oc], oc * hw, (oc + 1) * hw);
    taps((oBase, xBase, wi, y0, y1, x0, x1, shift) => {
      const wv = K[wi];
      if (wv === 0) return;
      for (let y = y0; y < y1; y++) {
        const o = oBase + y * w, xi = xBase + y * w + shift;
        for (let xx = x0; xx < x1; xx++) O[o + xx] += X[xi + xx] * wv;
      }
    });

    this.record(() => {
      const G = out.grad, dX = x.grad, dK = kernel.grad;
      for (let oc = 0; oc < cOut; oc++) {
        let sum = 0;
        for (let i = oc * hw; i < (oc + 1) * hw; i++) sum += G[i];
        bias.grad[oc] += sum;
      }
      taps((oBase, xBase, wi, y0, y1, x0, x1, shift) => {
        const wv = K[wi];
        let acc = 0;
        for (let y = y0; y < y1; y++) {
          const o = oBase + y * w, xi = xBase + y * w + shift;
          for (let xx = x0; xx < x1; xx++) {
            const g = G[o + xx];
            acc += g * X[xi + xx];
            dX[xi + xx] += g * wv;
          }
        }
        dK[wi] += acc;
      });
    });
    return out;
  }

  /** 2×2 max pooling, stride 2. Only the winning pixel of each block receives gradient. */
  maxPool2(x: Mat, { h, w }: { h: number; w: number }): Mat {
    const oh = h >> 1, ow = w >> 1;
    const out = new Mat(x.rows, oh * ow);
    const winner = new Int32Array(out.data.length);
    for (let c = 0; c < x.rows; c++) {
      for (let y = 0; y < oh; y++) {
        for (let xx = 0; xx < ow; xx++) {
          let best = -1;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const i = c * h * w + (y * 2 + dy) * w + xx * 2 + dx;
              if (best < 0 || x.data[i] > x.data[best]) best = i;
            }
          }
          const o = c * oh * ow + y * ow + xx;
          out.data[o] = x.data[best];
          winner[o] = best;
        }
      }
    }
    this.record(() => {
      for (let o = 0; o < winner.length; o++) x.grad[winner[o]] += out.grad[o];
    });
    return out;
  }

  /** Nearest-neighbour ×2 upsampling; the gradient of a pixel is the sum over its 2×2 block. */
  upsample2(x: Mat, { h, w }: { h: number; w: number }): Mat {
    const oh = h * 2, ow = w * 2;
    const out = new Mat(x.rows, oh * ow);
    const source = (o: number) => {
      const c = Math.floor(o / (oh * ow));
      const r = o - c * oh * ow;
      return c * h * w + (Math.floor(r / ow) >> 1) * w + ((r % ow) >> 1);
    };
    for (let o = 0; o < out.data.length; o++) out.data[o] = x.data[source(o)];
    this.record(() => {
      for (let o = 0; o < out.grad.length; o++) x.grad[source(o)] += out.grad[o];
    });
    return out;
  }

  /**
   * Binary cross-entropy on raw logits, averaged with optional per-element weights (0 = ignore).
   * Uses max(z,0) − z·t + log(1 + e^−|z|), which cannot overflow. `scale` multiplies the gradient
   * only, so several losses can be mixed; the returned value is always the plain loss.
   */
  bceWithLogits(logits: Mat, targets: ArrayLike<number>, weights?: ArrayLike<number>, scale = 1): number {
    const n = logits.data.length;
    let total = 0, norm = 0;
    for (let i = 0; i < n; i++) {
      const wgt = weights ? weights[i] : 1;
      if (wgt === 0) continue;
      const z = logits.data[i];
      total += wgt * (Math.max(z, 0) - z * targets[i] + Math.log1p(Math.exp(-Math.abs(z))));
      norm += wgt;
    }
    if (norm === 0) return 0;
    this.record(() => {
      for (let i = 0; i < n; i++) {
        const wgt = weights ? weights[i] : 1;
        if (wgt === 0) continue;
        const p = 1 / (1 + Math.exp(-logits.data[i]));
        logits.grad[i] += (scale * wgt * (p - targets[i])) / norm;
      }
    });
    return total / norm;
  }

  /** Mean squared error over the elements where mask is non-zero. `scale` multiplies the gradient only. */
  mse(pred: Mat, targets: ArrayLike<number>, mask?: ArrayLike<number>, scale = 1): number {
    const n = pred.data.length;
    let total = 0, count = 0;
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      total += (pred.data[i] - targets[i]) ** 2;
      count++;
    }
    if (count === 0) return 0;
    this.record(() => {
      for (let i = 0; i < n; i++) {
        if (mask && !mask[i]) continue;
        pred.grad[i] += (scale * 2 * (pred.data[i] - targets[i])) / count;
      }
    });
    return total / count;
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
