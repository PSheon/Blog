import { Adam, Mat, Tape, Transformer, type Rng, type TransformerConfig } from "@/lib/ml";

/*
 * Music as tokens, a Transformer that composes, and what we measure about what it writes. The recipe and every number
 * the article quotes come from docs/research/music-ai (run B: d 48, 2 layers, a 16-step window).
 *
 * A chorale is a grid of eighth notes. Each step has four voices, soprano to bass, and each voice-step is one token:
 * a new note is its pitch, a held one HOLD, silence REST. So the model writes S A T B, S A T B, … and knows which voice
 * is next only from its position: windows must always start on a soprano.
 */
export const LO = 31, HI = 84;
export const HOLD = HI - LO + 1, REST = HOLD + 1, VOCAB = REST + 1;
export const VOICES = 4;
export const STEPS_IN_WINDOW = 16;
export const CONFIG: TransformerConfig = { vocab: VOCAB, ctx: STEPS_IN_WINDOW * VOICES, d: 48, heads: 4, layers: 2 };
/** Every composition starts from the same C major chord: C5 G4 E4 C3. */
export const PROMPT = [72 - LO, 67 - LO, 64 - LO, 48 - LO];
/** The 5-gram's validation loss on the same split (nats per token): the line the Transformer has to cross. */
export const NGRAM_LOSS = 1.462;

export interface Piece { pitches: number[][]; onset: number[][] }

/** chorales.bin: u16 train count, u16 validation count, u16 length per chorale, then one byte per token. */
export function parseChorales(buffer: ArrayBuffer): { train: number[][]; val: number[][] } {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  const nTrain = view.getUint16(0, true), nVal = view.getUint16(2, true), all: number[][] = [];
  let at = 4 + 2 * (nTrain + nVal);
  for (let i = 0; i < nTrain + nVal; i++) {
    const len = view.getUint16(4 + 2 * i, true);
    all.push(Array.from(bytes.subarray(at, at + len)));
    at += len;
  }
  return { train: all.slice(0, nTrain), val: all.slice(nTrain) };
}

/** Tokens back to what sounds: the pitch of each voice at each step (−1 silent), and whether it starts there. */
export function decode(ids: ArrayLike<number>): Piece {
  const pitches: number[][] = [], onset: number[][] = [], last = [-1, -1, -1, -1];
  for (let t = 0; t * VOICES < ids.length; t++) {
    const p: number[] = [], o: number[] = [];
    for (let v = 0; v < VOICES; v++) {
      const id = ids[t * VOICES + v];
      if (id === undefined || id === REST) { if (id === REST) last[v] = -1; p.push(-1); o.push(0); }
      else if (id === HOLD) { p.push(last[v]); o.push(0); }
      else { last[v] = id + LO; p.push(last[v]); o.push(1); }
    }
    pitches.push(p); onset.push(o);
  }
  return { pitches, onset };
}

/** The context for the next token: the latest ≤ ctx tokens, cut so that it still starts on a soprano. */
export function context(ids: number[], ctx = CONFIG.ctx): number[] {
  return ids.slice(Math.max(0, Math.ceil((ids.length - ctx) / VOICES) * VOICES));
}

export function compose(model: Transformer, steps: number, temperature: number, rng: Rng, prompt = PROMPT): number[] {
  const ids = [...prompt];
  while (ids.length < steps * VOICES) {
    const ctx = context(ids, model.config.ctx);
    const { logits } = model.forward(new Tape(), ctx);
    const row = logits.data.subarray((ctx.length - 1) * VOCAB, ctx.length * VOCAB);
    let max = -Infinity;
    for (const x of row) max = Math.max(max, x);
    const p = Array.from(row, (x) => Math.exp((x - max) / temperature));
    let u = rng() * p.reduce((a, b) => a + b, 0), k = 0;
    while (u > p[k] && k < p.length - 1) u -= p[k++];
    ids.push(k);
  }
  return ids;
}

/** A random training window of one context plus one token, starting on a step boundary. */
export function window(pool: number[][], rng: Rng, ctx = CONFIG.ctx): number[] {
  const seq = pool[Math.floor(rng() * pool.length)];
  const steps = seq.length / VOICES, len = Math.min(ctx + VOICES, seq.length);
  const start = Math.floor(rng() * Math.max(1, steps - len / VOICES + 1)) * VOICES;
  return seq.slice(start, start + len);
}

/** Next-token training: Adam, lr 3e-3 with a 100-step warm-up and a cosine decay to a tenth, batches of 8. */
export class Composer {
  readonly model: Transformer;
  private readonly adam: Adam;
  step = 0;

  constructor(private readonly train: number[][], private readonly rng: Rng, readonly steps: number, weights?: Float32Array) {
    this.model = new Transformer(CONFIG, rng);
    if (weights) load(this.model, weights);
    this.adam = new Adam(this.model.params);
  }

  /** One optimiser step. Returns the batch's mean loss in nats per token. */
  learn(batch = 8, lr = 3e-3): number {
    this.model.zeroGrad();
    const tape = new Tape();
    let loss = 0;
    for (let b = 0; b < batch; b++) {
      const w = window(this.train, this.rng);
      loss += tape.crossEntropy(this.model.forward(tape, w.slice(0, -1).slice(0, CONFIG.ctx)).logits, w.slice(1, CONFIG.ctx + 1), 1 / batch) / batch;
    }
    tape.backward();
    const s = this.step++;
    this.adam.step(lr * Math.min(1, (s + 1) / 100) * (0.1 + 0.9 * 0.5 * (1 + Math.cos((Math.PI * s) / this.steps))));
    return loss;
  }
}

/** Mean loss on fixed validation windows (the same ones every time, so the curve is comparable with itself). */
export function validate(model: Transformer, windows: number[][]): number {
  let s = 0;
  for (const w of windows) s += new Tape().crossEntropy(model.forward(new Tape(), w.slice(0, -1).slice(0, CONFIG.ctx)).logits, w.slice(1, CONFIG.ctx + 1));
  return s / windows.length;
}

export function load(model: Transformer, weights: Float32Array) {
  let k = 0;
  for (const p of Object.values(model.params)) for (let i = 0; i < p.data.length; i++) p.data[i] = weights[k++];
}

/**
 * The opponent with no AI in it: a soprano that walks a C pentatonic scale by 1/f noise (Voss's dice trick — four
 * dice rerolled at halving rates, which is how the pitch of real music wanders), over I–vi–IV–V, a bar each.
 * It never plays a wrong note and never crosses a voice; the article's numbers say what it pays for that.
 */
export function rulesPiece(steps: number, rng: Rng): Piece {
  const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
  const chords = [[48, 55, 64], [45, 57, 64], [41, 53, 60], [43, 55, 62]]; // C, Am, F, G: bass, tenor, alto
  const dice = [rng(), rng(), rng(), rng()];
  const pitches: number[][] = [], onset: number[][] = [];
  let soprano = -1;
  for (let t = 0; t < steps; t++) {
    if (t % 2 === 0) for (let d = 0; d < dice.length; d++) if (((t / 2) & ((1 << d) - 1)) === 0) dice[d] = rng();
    const chord = chords[Math.floor(t / 8) % chords.length];
    const next = scale[Math.min(scale.length - 1, Math.floor((dice.reduce((a, b) => a + b, 0) / dice.length) * scale.length))];
    const sings = t % 2 === 0 && next !== soprano;
    if (sings) soprano = next;
    pitches.push([soprano, chord[2], chord[1], chord[0]]);
    onset.push([sings ? 1 : 0, ...(t % 8 === 0 ? [1, 1, 1] : [0, 0, 0])]);
  }
  return { pitches, onset };
}

// ---------------------------------------------------------------------------------------------------------------
// What we measure. None of it says "beautiful": it says whether the texture does what four-part writing does.

/** C major's pitch classes, plus F# and G# (A minor's raised sixth and seventh). Every chorale was moved to C or A minor. */
const KEY = new Set([0, 2, 4, 5, 7, 9, 11, 6, 8]);

export interface Report {
  /** share of new notes in the key */
  inKey: number;
  /** parallel fifths or octaves per 100 steps */
  parallels: number;
  /** share of steps where a lower voice is above a higher one */
  crossings: number;
  /** share of sounding voice-steps that are held */
  held: number;
  /** distinct chords (pitch-class sets) per 100 steps */
  chords: number;
}

export function report({ pitches, onset }: Piece): Report {
  let notes = 0, inKey = 0, parallels = 0, crossings = 0, held = 0, cells = 0;
  const chords = new Set<string>();
  for (let t = 0; t < pitches.length; t++) {
    const p = pitches[t];
    for (let v = 0; v < VOICES; v++) {
      if (p[v] < 0) continue;
      cells++;
      if (onset[t][v]) { notes++; if (KEY.has(p[v] % 12)) inKey++; } else held++;
    }
    for (let v = 0; v < VOICES - 1; v++) if (p[v] >= 0 && p[v + 1] >= 0 && p[v + 1] > p[v]) { crossings++; break; }
    chords.add(p.filter((x) => x >= 0).map((x) => x % 12).sort((a, b) => a - b).join(","));
    if (t === 0) continue;
    const q = pitches[t - 1];
    for (let a = 0; a < VOICES; a++)
      for (let b = a + 1; b < VOICES; b++) {
        if (p[a] < 0 || p[b] < 0 || q[a] < 0 || q[b] < 0) continue;
        const now = (p[a] - p[b]) % 12, before = (q[a] - q[b]) % 12;
        const together = p[a] !== q[a] && p[b] !== q[b] && Math.sign(p[a] - q[a]) === Math.sign(p[b] - q[b]);
        if (together && now === before && (now === 7 || now === 0)) parallels++;
      }
  }
  const n = pitches.length;
  return { inKey: notes ? inKey / notes : 0, parallels: (100 * parallels) / n, crossings: crossings / n, held: cells ? held / cells : 0, chords: (100 * chords.size) / n };
}

/** Which training steps (all four voices) sound the same, for finding the longest stretch copied from the chorales. */
export class CopyFinder {
  private readonly index = new Map<string, [number, number][]>();
  private readonly pieces: number[][][];

  constructor(train: number[][]) {
    this.pieces = train.map((t) => decode(t).pitches);
    this.pieces.forEach((c, ci) => c.forEach((p, t) => {
      const k = p.join(",");
      const list = this.index.get(k);
      if (list) list.push([ci, t]); else this.index.set(k, [[ci, t]]);
    }));
  }

  /** The longest run of steps in `pitches` that also occurs, in the same order, in one training chorale. */
  longest(pitches: number[][]): { steps: number; chorale: number; at: number; from: number } {
    let best = { steps: 0, chorale: -1, at: 0, from: 0 };
    for (let t = 0; t < pitches.length; t++)
      for (const [ci, s] of this.index.get(pitches[t].join(",")) ?? []) {
        const c = this.pieces[ci];
        let n = 0;
        while (t + n < pitches.length && s + n < c.length && c[s + n].join(",") === pitches[t + n].join(",")) n++;
        if (n > best.steps) best = { steps: n, chorale: ci, at: s, from: t };
      }
    return best;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Preference tuning (DPO). The reader hears two short pieces and picks one; the model moves toward the pick and away
// from the other, measured against a frozen copy of itself so that it cannot drift far from Bach (β is the leash).

/** Sum of log-probabilities of the tokens after the prompt, and what crossEntropy needs to push on them. */
function logProb(model: Transformer, ids: number[], tape: Tape): { value: number; logits: Mat; targets: number[]; count: number } {
  const { logits } = model.forward(tape, ids.slice(0, -1));
  const targets = ids.slice(1).map((t, i) => (i + 1 < PROMPT.length ? -1 : t));
  let value = 0, count = 0;
  for (let r = 0; r < targets.length; r++) {
    if (targets[r] < 0) continue;
    const row = logits.data.subarray(r * VOCAB, (r + 1) * VOCAB);
    let max = -Infinity;
    for (const x of row) max = Math.max(max, x);
    let s = 0;
    for (const x of row) s += Math.exp(x - max);
    value += row[targets[r]] - max - Math.log(s);
    count++;
  }
  return { value, logits, targets, count };
}

export class Judge {
  readonly policy: Transformer;
  private readonly reference: Transformer;
  private readonly adam: Adam;
  choices = 0;

  /**
   * β 0.5 and lr 1e-4 per pick: 20 picks of "more held notes" took held notes from 48 % to 64 % with the validation loss
   * unchanged; at 3e-4 the same 20 went to 88 % and the loss rose from 1.195 to 1.257 (docs/research/music-ai).
   */
  constructor(weights: Float32Array, private readonly beta = 0.5, private readonly lr = 1e-4) {
    this.policy = new Transformer(CONFIG);
    this.reference = new Transformer(CONFIG);
    load(this.policy, weights);
    load(this.reference, weights);
    this.adam = new Adam(this.policy.params);
  }

  /** Two candidates of one window each (16 steps, 8 seconds at 60 bpm), sampled at temperature 1. */
  pair(rng: Rng): [number[], number[]] {
    const n = CONFIG.ctx + 1;
    return [compose(this.policy, Math.ceil(n / VOICES), 1, rng).slice(0, n), compose(this.policy, Math.ceil(n / VOICES), 1, rng).slice(0, n)];
  }

  /** One DPO step on one choice: L = −log σ(β[(log π(win) − log π₀(win)) − (log π(lose) − log π₀(lose))]). */
  choose(win: number[], lose: number[]) {
    this.policy.zeroGrad();
    const tape = new Tape();
    const pw = logProb(this.policy, win, tape), pl = logProb(this.policy, lose, tape);
    const rw = logProb(this.reference, win, new Tape()).value, rl = logProb(this.reference, lose, new Tape()).value;
    const z = this.beta * (pw.value - rw - (pl.value - rl));
    const g = this.beta * (1 - 1 / (1 + Math.exp(-z)));
    // crossEntropy's gradient is weight × d(mean NLL), and log p = −count × mean NLL.
    tape.crossEntropy(pw.logits, pw.targets, g * pw.count);
    tape.crossEntropy(pl.logits, pl.targets, -g * pl.count);
    tape.backward();
    this.adam.step(this.lr);
    this.choices++;
  }
}
