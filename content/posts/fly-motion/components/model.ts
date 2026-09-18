import { Adam, Mat, type Rng, Tape } from "@/lib/ml";
import { type Clip, DT, GRID, STEPS } from "./stimulus";
import { type Compiled, INPUTS, OUTPUTS, TYPES, type Wiring, compile } from "./wiring";

const WARMUP = 10, EDGE = 3, DIRECTIONS = 4;
/** Cells far enough from the rim that their whole receptive field is on the lattice. */
const INTERIOR = Int32Array.from(
  Array.from({ length: (GRID - 2 * EDGE) ** 2 }, (_, i) => (EDGE + Math.floor(i / (GRID - 2 * EDGE))) * GRID + EDGE + (i % (GRID - 2 * EDGE))),
);

/**
 * A network whose connections come from the connectome and are never trained. Every cell is a leaky
 * integrator, τ·dV/dt = −V + Σ gain·synapses·relu(V_source) + rest, stepped 30 times per clip.
 * Learned: one gain per connected pair of cell types, a time constant and a resting level per type, and a
 * linear readout from the mean activity of the eight T4/T5 subtypes to the direction of motion.
 */
export class FlyNet {
  readonly params: Record<string, Mat> = {};
  readonly wiring: Compiled;
  private readonly adam: Adam;
  seen = 0;
  /** Strength of the pull that keeps silent cell types from staying silent; 0 turns it off. */
  keepAlive = 1;

  constructor(kind: Wiring = "real", rng: Rng = Math.random, detectorRest = -0.1) {
    this.wiring = compile(kind, rng);
    const P = this.params, n = TYPES.length;
    P.logGain = new Mat(1, this.wiring.pairs.length);
    P.logTau = new Mat(1, n, new Float64Array(n).fill(Math.log(0.05)));
    // Interneurons idle above threshold: the ON pathway works by disinhibition (L1 is inhibitory), so a Mi1 resting
    // at zero could only ever be pushed down and T4 would hear nothing. The detectors start just below threshold:
    // a network that never rectifies is linear, and a linear network's mean response to a grating ignores direction.
    P.rest = new Mat(1, n, Float64Array.from({ length: n }, (_, i) => (i >= OUTPUTS.start ? detectorRest : 0.3)));
    P.readout = new Mat(OUTPUTS.count, DIRECTIONS, Float64Array.from({ length: OUTPUTS.count * DIRECTIONS }, () => (rng() * 2 - 1) * 0.35));
    P.readoutBias = new Mat(1, DIRECTIONS);
    this.adam = new Adam(P);
  }

  parameterCount(): number {
    return Object.values(this.params).reduce((n, p) => n + p.data.length, 0);
  }

  /**
   * Mean rectified activity of every cell type over the interior and the post-onset part of the clip: [1, types].
   * With `keepAlive`, also nudges any cell type whose mean voltage sits below threshold back up. A rectified
   * cell that never fires passes no gradient, so without this a type that dies early stays dead for good.
   */
  private respond(t: Tape, frames: Float64Array[], keepAlive = 0): Mat {
    const P = this.params, n = TYPES.length, cells = GRID * GRID;
    let v = new Mat(n, cells), sum: Mat | null = null;
    for (let k = 0; k < STEPS; k++) {
      // Photoreceptors invert: the lamina cells hyperpolarise to light.
      const light = new Mat(n, cells);
      for (let c = 0; c < INPUTS; c++) for (let i = 0; i < cells; i++) light.data[c * cells + i] = -2 * (frames[k][i] - 0.5);
      const drive = t.add(t.tapConv(t.relu(v), P.logGain, this.wiring.taps, { h: GRID, w: GRID, cOut: n }), light);
      v = t.leak(v, drive, P.logTau, P.rest, DT);
      if (keepAlive && k === STEPS - 1) {
        const level = t.meanRows(v, INTERIOR);
        t.mse(level, new Float64Array(n), Array.from(level.data, (x) => (x < 0 ? 1 : 0)), keepAlive);
      }
      if (k >= WARMUP) {
        const mean = t.meanRows(t.relu(v), INTERIOR);
        sum = sum ? t.add(sum, mean) : mean;
      }
    }
    return t.scale(sum!, 1 / (STEPS - WARMUP));
  }

  private logits(t: Tape, frames: Float64Array[], keepAlive = 0): Mat {
    const out = t.sliceCols(this.respond(t, frames, keepAlive), OUTPUTS.start, OUTPUTS.count);
    return t.addRow(t.matmul(t.scale(out, 10), this.params.readout), this.params.readoutBias);
  }

  /** One Adam step on a batch of clips; returns the mean loss. */
  step(clips: Clip[], lr = 1e-2): number {
    let loss = 0;
    for (const clip of clips) {
      const t = new Tape();
      loss += t.crossEntropy(this.logits(t, clip.frames, this.keepAlive / clips.length), [clip.label], 1 / clips.length);
      t.backward();
    }
    this.adam.step(lr);
    for (const p of Object.values(this.params)) p.grad.fill(0);
    this.seen += clips.length;
    return loss / clips.length;
  }

  predict(frames: Float64Array[]): number {
    const z = this.logits(new Tape(), frames).data;
    return z.indexOf(Math.max(...z));
  }

  accuracy(clips: Clip[]): number {
    return clips.filter((c) => this.predict(c.frames) === c.label).length / clips.length;
  }

  /** Mean activity of each T4/T5 subtype for one clip. */
  detectors(frames: Float64Array[]): Float64Array {
    return this.respond(new Tape(), frames).data.slice(OUTPUTS.start, OUTPUTS.start + OUTPUTS.count);
  }
}
