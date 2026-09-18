/**
 * Neuroevolution: train small networks with a genetic algorithm instead of gradients.
 * A genome is just a flat weight vector; fitness comes from whatever the caller measures
 * (how far a bird flew, how much a trader earned).
 */

export type Rng = () => number;

/** Small, fast, seedable PRNG — so a run can be replayed exactly in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weights in a fully connected, bias-free perceptron with these layer sizes. */
export function weightCount(shape: number[]): number {
  let n = 0;
  for (let i = 1; i < shape.length; i++) n += shape[i - 1] * shape[i];
  return n;
}

export type MlpActivation = "sigmoid" | "relu";

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * A bias-free multilayer perceptron over a flat weight vector.
 * "sigmoid": every layer is squashed, outputs read as 0..1 (Flappy Bird's "flap?").
 * "relu": hidden layers are rectified and the output is left linear, ready for an argmax.
 */
export class Mlp {
  /** Values of every layer from the last forward pass, input layer first. */
  readonly activations: Float32Array[];

  constructor(
    readonly shape: number[],
    readonly weights: Float32Array,
    readonly activation: MlpActivation = "sigmoid",
  ) {
    const expected = weightCount(shape);
    if (weights.length !== expected) {
      throw new Error(`Mlp [${shape.join(", ")}] needs ${expected} weights, got ${weights.length}`);
    }
    this.activations = shape.map((n) => new Float32Array(n));
  }

  forward(inputs: ArrayLike<number>): Float32Array {
    const { shape, weights, activations } = this;
    activations[0].set(inputs);
    let offset = 0;
    for (let l = 1; l < shape.length; l++) {
      const prev = activations[l - 1];
      const out = activations[l];
      const last = l === shape.length - 1;
      for (let j = 0; j < out.length; j++) {
        let sum = 0;
        for (let k = 0; k < prev.length; k++) sum += prev[k] * weights[offset + j * prev.length + k];
        out[j] = this.activation === "sigmoid" ? sigmoid(sum) : last ? sum : Math.max(0, sum);
      }
      offset += prev.length * out.length;
    }
    return activations[shape.length - 1];
  }
}

export interface PopulationOptions {
  shape: number[];
  size: number;
  /** Share of the best genomes copied unchanged into the next generation. */
  elitism?: number;
  /** Share of brand-new random genomes, so the search can't get stuck. */
  randomRate?: number;
  /** Chance that any one weight of a child is nudged. */
  mutationRate?: number;
  /** A nudge is uniform in ±mutationRange. */
  mutationRange?: number;
  rng?: Rng;
}

export class Population {
  genomes: Float32Array[];
  generation = 1;
  private readonly o: Required<PopulationOptions>;

  constructor(options: PopulationOptions) {
    // Callers often forward an optional value as-is; an explicit undefined must not erase a default.
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    this.o = {
      elitism: 0.2,
      randomRate: 0.2,
      mutationRate: 0.1,
      mutationRange: 0.5,
      rng: Math.random,
      ...(given as unknown as PopulationOptions),
    };
    this.genomes = Array.from({ length: this.o.size }, () => this.random());
  }

  private random(): Float32Array {
    const g = new Float32Array(weightCount(this.o.shape));
    for (let i = 0; i < g.length; i++) g[i] = this.o.rng() * 2 - 1;
    return g;
  }

  /** Uniform crossover — each gene from either parent, 50/50 — followed by mutation. */
  private breed(a: Float32Array, b: Float32Array): Float32Array {
    const { rng, mutationRate, mutationRange } = this.o;
    const child = Float32Array.from(a);
    for (let i = 0; i < child.length; i++) {
      if (rng() <= 0.5) child[i] = b[i];
      if (rng() <= mutationRate) child[i] += rng() * mutationRange * 2 - mutationRange;
    }
    return child;
  }

  /** Replace the population using one score per genome (higher is better). */
  evolve(scores: ArrayLike<number>): void {
    const { size, elitism, randomRate } = this.o;
    if (scores.length !== size) throw new Error(`evolve: expected ${size} scores, got ${scores.length}`);

    const ranked = this.genomes
      .map((genome, i) => ({ genome, score: scores[i] }))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.genome);

    const next: Float32Array[] = [];
    for (let i = 0; i < Math.round(elitism * size) && next.length < size; i++) next.push(Float32Array.from(ranked[i]));
    for (let i = 0; i < Math.round(randomRate * size) && next.length < size; i++) next.push(this.random());

    // Pair the best with the next best, then widen the circle: (0,1) (0,2) (1,2) (0,3) …
    for (let max = 1; next.length < size; max = max >= ranked.length - 1 ? 1 : max + 1) {
      for (let i = 0; i < max && next.length < size; i++) next.push(this.breed(ranked[i], ranked[max]));
    }

    this.genomes = next;
    this.generation++;
  }
}
