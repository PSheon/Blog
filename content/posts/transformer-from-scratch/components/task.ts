import { Adam, type Rng, Tape, Transformer, type TransformerConfig } from "@/lib/ml";

/** Digits are their own token ids; one extra token marks "now answer". */
export const SEP = 10;
export const VOCAB = 11;
export const LENGTH = 6;

export type TaskName = "reverse" | "copy" | "sort";

export const TASKS: Record<TaskName, (digits: number[]) => number[]> = {
  reverse: (d) => [...d].reverse(),
  copy: (d) => [...d],
  sort: (d) => [...d].sort((a, b) => a - b),
};

export const CONFIG: TransformerConfig = { vocab: VOCAB, ctx: LENGTH * 2, d: 32, heads: 2, layers: 1 };

export function randomDigits(rng: Rng, n = LENGTH): number[] {
  return Array.from({ length: n }, () => Math.floor(rng() * 10));
}

/**
 * One training example. The model reads `digits SEP answer` and at every position predicts
 * the next token — but only the answer half is scored (−1 = ignore), since nobody can
 * predict random input digits.
 */
export function example(digits: number[], task: TaskName) {
  const full = [...digits, SEP, ...TASKS[task](digits)];
  const ids = full.slice(0, -1);
  const targets = full.slice(1).map((t, i) => (i < digits.length ? -1 : t));
  return { ids, targets };
}

export interface Generation {
  output: number[];
  /** attention[layer][head]: T×T maps from the final forward pass. */
  attention: Float64Array[][];
  /** Tokens the maps are indexed by. */
  tokens: number[];
}

export class Trainer {
  readonly model: Transformer;
  private readonly adam: Adam;
  steps = 0;
  losses: number[] = [];

  constructor(
    readonly task: TaskName,
    private readonly rng: Rng = Math.random,
    config: TransformerConfig = CONFIG,
  ) {
    this.model = new Transformer(config, rng);
    this.adam = new Adam(this.model.params);
  }

  /** One optimiser step on a fresh random batch. Returns the batch's mean loss. */
  step(batch = 16, lr = 3e-3): number {
    this.model.zeroGrad();
    let loss = 0;
    for (let b = 0; b < batch; b++) {
      const { ids, targets } = example(randomDigits(this.rng), this.task);
      const tape = new Tape();
      loss += tape.crossEntropy(this.model.forward(tape, ids).logits, targets, 1 / batch) / batch;
      tape.backward();
    }
    this.adam.step(lr);
    this.steps++;
    this.losses.push(loss);
    return loss;
  }

  /** Greedy decoding: feed the digits and SEP, then let the model write the answer token by token. */
  generate(digits: number[]): Generation {
    const tokens = [...digits, SEP];
    let attention: Float64Array[][] = [];
    for (let i = 0; i < digits.length; i++) {
      const out = this.model.forward(new Tape(), tokens);
      attention = out.attention;
      const row = (tokens.length - 1) * VOCAB;
      let best = 0;
      for (let v = 1; v < VOCAB; v++) if (out.logits.data[row + v] > out.logits.data[row + best]) best = v;
      if (i < digits.length - 1) tokens.push(best);
      else return { output: [...tokens.slice(digits.length + 1), best], attention, tokens: [...tokens] };
    }
    return { output: [], attention, tokens };
  }

  /** Share of fresh random sequences answered completely correctly. */
  accuracy(samples = 40): number {
    let right = 0;
    for (let s = 0; s < samples; s++) {
      const digits = randomDigits(this.rng);
      const want = TASKS[this.task](digits);
      if (this.generate(digits).output.every((t, i) => t === want[i])) right++;
    }
    return right / samples;
  }
}
