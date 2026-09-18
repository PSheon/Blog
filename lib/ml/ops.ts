import { type Tensor, zeros } from "./tensor";

export interface Conv2dOptions {
  stride?: number;
  padding?: number;
}

/**
 * 2D cross-correlation (what deep-learning frameworks call "convolution").
 * x: [N, Cin, H, W], w: [Cout, Cin, kH, kW], b: [Cout] | null
 */
export function conv2d(
  x: Tensor,
  w: Tensor,
  b: Tensor | null,
  { stride = 1, padding = 0 }: Conv2dOptions = {},
): Tensor {
  const [n, cIn, h, wd] = x.shape;
  const [cOut, wCin, kH, kW] = w.shape;
  if (cIn !== wCin) {
    throw new Error(
      `conv2d: input has ${cIn} channel(s) but kernel expects ${wCin}`,
    );
  }
  const oH = Math.floor((h + 2 * padding - kH) / stride) + 1;
  const oW = Math.floor((wd + 2 * padding - kW) / stride) + 1;
  const out = zeros([n, cOut, oH, oW]);

  for (let i = 0; i < n; i++) {
    for (let oc = 0; oc < cOut; oc++) {
      const bias = b ? b.data[oc] : 0;
      for (let oy = 0; oy < oH; oy++) {
        for (let ox = 0; ox < oW; ox++) {
          let sum = bias;
          for (let ic = 0; ic < cIn; ic++) {
            const xBase = (i * cIn + ic) * h;
            const wBase = (oc * cIn + ic) * kH;
            for (let ky = 0; ky < kH; ky++) {
              const iy = oy * stride + ky - padding;
              if (iy < 0 || iy >= h) continue;
              const xRow = (xBase + iy) * wd;
              const wRow = (wBase + ky) * kW;
              for (let kx = 0; kx < kW; kx++) {
                const ix = ox * stride + kx - padding;
                if (ix < 0 || ix >= wd) continue;
                sum += x.data[xRow + ix] * w.data[wRow + kx];
              }
            }
          }
          out.data[((i * cOut + oc) * oH + oy) * oW + ox] = sum;
        }
      }
    }
  }
  return out;
}

/** Max pooling with a k×k window and stride k; trailing rows/cols are dropped. */
export function maxPool2d(x: Tensor, k: number): Tensor {
  const [n, c, h, w] = x.shape;
  const oH = Math.floor(h / k);
  const oW = Math.floor(w / k);
  const out = zeros([n, c, oH, oW]);
  for (let p = 0; p < n * c; p++) {
    for (let oy = 0; oy < oH; oy++) {
      for (let ox = 0; ox < oW; ox++) {
        let max = -Infinity;
        for (let ky = 0; ky < k; ky++) {
          const row = (p * h + oy * k + ky) * w + ox * k;
          for (let kx = 0; kx < k; kx++) {
            const v = x.data[row + kx];
            if (v > max) max = v;
          }
        }
        out.data[(p * oH + oy) * oW + ox] = max;
      }
    }
  }
  return out;
}

export function relu(x: Tensor): Tensor {
  const out = zeros(x.shape);
  for (let i = 0; i < x.data.length; i++) {
    const v = x.data[i];
    out.data[i] = v > 0 ? v : 0;
  }
  return out;
}

/** [N, ...rest] → [N, prod(rest)]. Shares the underlying buffer. */
export function flatten(x: Tensor): Tensor {
  const n = x.shape[0];
  return { data: x.data, shape: [n, x.data.length / n] };
}

/** Fully connected layer. x: [N, in], w: [out, in] (PyTorch layout), b: [out]. */
export function dense(x: Tensor, w: Tensor, b: Tensor): Tensor {
  const [n, inF] = x.shape;
  const [outF, wIn] = w.shape;
  if (inF !== wIn) {
    throw new Error(`dense: input has ${inF} features but weight expects ${wIn}`);
  }
  const out = zeros([n, outF]);
  for (let i = 0; i < n; i++) {
    for (let o = 0; o < outF; o++) {
      let sum = b.data[o];
      for (let j = 0; j < inF; j++) {
        sum += x.data[i * inF + j] * w.data[o * inF + j];
      }
      out.data[i * outF + o] = sum;
    }
  }
  return out;
}

/** Softmax over the last dimension, shifted by the row max for stability. */
export function softmax(x: Tensor): Tensor {
  const last = x.shape[x.shape.length - 1];
  const out = zeros(x.shape);
  for (let r = 0; r < x.data.length; r += last) {
    let max = -Infinity;
    for (let j = 0; j < last; j++) max = Math.max(max, x.data[r + j]);
    let sum = 0;
    for (let j = 0; j < last; j++) {
      const e = Math.exp(x.data[r + j] - max);
      out.data[r + j] = e;
      sum += e;
    }
    for (let j = 0; j < last; j++) out.data[r + j] /= sum;
  }
  return out;
}
