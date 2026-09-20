import { Adam, Mat, type Rng, Tape } from "@/lib/ml";
import { MASK, SIZE, type Scene, boxIoU, maskIoU } from "./scene";

export type Heads = "both" | "box" | "mask";
/**
 * How the decoder gets fine detail back.
 * "concat": classic U-Net skip (16 deep + 8 shallow channels into the neck).
 * "slim":   squeeze the deep features to 8 channels first, then concatenate (16 into the neck).
 * "add":    squeeze, then add instead of concatenating (8 into the neck).
 */
export type Skip = "concat" | "slim" | "add";

export interface HydraConfig {
  heads: Heads;
  skip: Skip;
  /** Relative weight of the box loss against the mask loss. */
  boxWeight: number;
}

// "slim" measured at ~550 samples/s vs ~470 for "concat", with box and mask IoU inside each other's seed noise (3 seeds, 16k samples).
export const DEFAULT_CONFIG: HydraConfig = { heads: "both", skip: "slim", boxWeight: 1 };

const HALF = SIZE / 2, QUARTER = SIZE / 4;

export interface Prediction {
  box: Scene["box"];
  /** MASK×MASK logits; > 0 means "object". */
  mask: Float64Array;
  /** The four edge distributions (left, right over x; top, bottom over y), each MASK long. */
  edges: Float64Array[];
}

/**
 * One trunk, two heads.
 *   trunk:  conv 3→8 @32 → pool → conv 8→16 @16 → pool → conv 16→16 @8
 *   neck:   bring the 8×8 features back to 16×16 and merge them with the 16×16 ones (skip)
 *   mask:   1×1 conv → 16×16 logits
 *   box:    1×1 conv → 4 maps; each map is collapsed to a 1-D profile, soft-maxed, and the box
 *           edge is the *expected position* under that distribution (integral regression).
 */
export class HydraNet {
  readonly params: Record<string, Mat> = {};
  private readonly adam: Adam;
  private readonly positions: Mat;
  seen = 0;

  constructor(
    readonly config: HydraConfig = DEFAULT_CONFIG,
    rng: Rng = Math.random,
  ) {
    const he = (rows: number, fanIn: number) => {
      const m = new Mat(rows, fanIn), s = Math.sqrt(6 / fanIn);
      for (let i = 0; i < m.data.length; i++) m.data[i] = (rng() * 2 - 1) * s;
      return m;
    };
    const P = this.params;
    P.k1 = he(8, 3 * 9); P.b1 = new Mat(1, 8);
    P.k2 = he(16, 8 * 9); P.b2 = new Mat(1, 16);
    P.k3 = he(16, 16 * 9); P.b3 = new Mat(1, 16);
    if (config.skip === "concat") {
      P.neck = he(8, 24 * 9);
    } else {
      P.squeeze = he(8, 16); P.squeezeB = new Mat(1, 8);
      P.neck = he(8, (config.skip === "slim" ? 16 : 8) * 9);
    }
    P.neckB = new Mat(1, 8);
    P.maskK = he(1, 8); P.maskB = new Mat(1, 1);
    P.boxK = he(4, 8); P.boxB = new Mat(1, 4);
    this.adam = new Adam(P);
    // Centre of each of the MASK bins, as a fraction of the image side.
    this.positions = new Mat(MASK, 1, Float64Array.from({ length: MASK }, (_, i) => (i + 0.5) / MASK));
  }

  parameterCount(): number {
    return Object.values(this.params).reduce((n, p) => n + p.data.length, 0);
  }

  private forward(t: Tape, image: Float64Array) {
    const P = this.params, { heads, skip } = this.config;
    const x = new Mat(3, SIZE * SIZE, image);
    const f1 = t.maxPool2(t.relu(t.conv2d(x, P.k1, P.b1, { h: SIZE, w: SIZE, k: 3, inputGrad: false })), { h: SIZE, w: SIZE });
    const f2 = t.maxPool2(t.relu(t.conv2d(f1, P.k2, P.b2, { h: HALF, w: HALF, k: 3 })), { h: HALF, w: HALF });
    const f3 = t.relu(t.conv2d(f2, P.k3, P.b3, { h: QUARTER, w: QUARTER, k: 3 }));

    const deep = skip === "concat" ? f3 : t.relu(t.conv2d(f3, P.squeeze, P.squeezeB, { h: QUARTER, w: QUARTER, k: 1 }));
    const lifted = t.upsample2(deep, { h: QUARTER, w: QUARTER });
    const up = skip === "add" ? t.add(lifted, f1) : t.concatRows([lifted, f1]);
    const d = t.relu(t.conv2d(up, P.neck, P.neckB, { h: HALF, w: HALF, k: 3 }));

    const mask = heads === "box" ? null : t.conv2d(d, P.maskK, P.maskB, { h: HALF, w: HALF, k: 1 });
    let edges: Mat | null = null, box: Mat | null = null;
    if (heads !== "mask") {
      const maps = t.conv2d(d, P.boxK, P.boxB, { h: HALF, w: HALF, k: 1 });
      const lr = t.softmax(t.marginal(t.sliceRows(maps, 0, 2), { h: HALF, w: HALF, axis: "x" }));
      const tb = t.softmax(t.marginal(t.sliceRows(maps, 2, 2), { h: HALF, w: HALF, axis: "y" }));
      edges = t.concatRows([lr, tb]);
      box = t.matmul(edges, this.positions);
    }
    return { mask, box, edges };
  }

  /** One optimiser step on a batch. Returns the mean losses. */
  step(batch: Scene[], lr = 3e-3): { box: number; mask: number } {
    let last = { box: 0, mask: 0 };
    for (const scene of batch) last = this.feed(scene, batch.length, lr) ?? last;
    return last;
  }

  private fed = 0;
  private boxLoss = 0;
  private maskLoss = 0;

  /**
   * The same optimiser step, one image at a time: gradients pile up until `batchSize` images have gone in, then Adam
   * steps and the mean losses come back (null before that). A whole batch of 8 takes about 15 ms, more than a
   * frame's worth of budget; one image takes about 2 ms, so a training loop can stop between images when its time
   * is up and pick the batch up again next frame. The numbers are identical to `step`.
   */
  feed(scene: Scene, batchSize: number, lr = 3e-3): { box: number; mask: number } | null {
    if (this.fed === 0) {
      for (const p of Object.values(this.params)) p.grad.fill(0);
      this.boxLoss = this.maskLoss = 0;
    }
    const scale = 1 / batchSize, t = new Tape(), out = this.forward(t, scene.image);
    if (out.box) this.boxLoss += t.l1(out.box, scene.box, scale * this.config.boxWeight * 10);
    if (out.mask) this.maskLoss += t.bceWithLogits(out.mask, scene.mask, undefined, scale);
    t.backward();
    if (++this.fed < batchSize) return null;
    this.adam.step(lr);
    this.seen += batchSize;
    this.fed = 0;
    return { box: this.boxLoss * scale, mask: this.maskLoss * scale };
  }

  predict(image: Float64Array): Prediction {
    const out = this.forward(new Tape(), image);
    const e = out.edges?.data;
    return {
      box: out.box ? [out.box.data[0], out.box.data[1], out.box.data[2], out.box.data[3]] : [0, 0, 0, 0],
      mask: out.mask ? out.mask.data : new Float64Array(MASK * MASK),
      edges: e ? [0, 1, 2, 3].map((k) => e.slice(k * MASK, (k + 1) * MASK)) : [],
    };
  }

  evaluate(scenes: Scene[]): { box: number; mask: number } {
    let box = 0, mask = 0;
    for (const s of scenes) {
      const p = this.predict(s.image);
      box += boxIoU(p.box, s.box);
      mask += maskIoU(p.mask, s.mask);
    }
    return { box: box / scenes.length, mask: mask / scenes.length };
  }
}
