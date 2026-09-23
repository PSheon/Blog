import { Adam, Mat, Tape, mulberry32, type Rng } from "@/lib/ml";
import { type Gains, choose, control, run } from "./pilot";
import { DRY, G, type State, observe, outcome, start, step } from "./sim";

/*
 * The network that flies the ship, and the two ways of teaching it.
 *
 * Copying the autopilot (behaviour cloning) fits its answers and still cannot land: the first small error takes the
 * ship somewhere the teacher's own flights never went, and there the student has nothing. DAgger fixes exactly that
 * — fly the STUDENT, ask the teacher what it would have done at each state the student reached, and train on those.
 * Measured offline: cloning 0 of 200, DAgger 108 of 200 (docs/research/rocket/RESULTS.md).
 */
export const IN = 8, HID = 24, OUT = 3; // how much thrust it wants (in weights), gimbal, flaps

export interface Weights { w1: Float64Array; b1: Float64Array; w2: Float64Array; b2: Float64Array }

export function randomWeights(rng: Rng): Weights {
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const fill = (n: number, scale: number) => Float64Array.from({ length: n }, () => normal() * scale);
  return { w1: fill(IN * HID, 1 / Math.sqrt(IN)), b1: new Float64Array(HID), w2: fill(HID * OUT, 1 / Math.sqrt(HID)), b2: new Float64Array(OUT) };
}

/** One state in, one action out. Plain arithmetic: this runs every frame while the reader watches. */
export function act(w: Weights, s: State) {
  const x = observe(s), hidden = new Float64Array(HID), out = new Float64Array(OUT);
  for (let j = 0; j < HID; j++) {
    let sum = w.b1[j];
    for (let i = 0; i < IN; i++) sum += x[i] * w.w1[i * HID + j];
    hidden[j] = sum > 0 ? sum : 0;
  }
  for (let k = 0; k < OUT; k++) {
    let sum = w.b2[k];
    for (let j = 0; j < HID; j++) sum += hidden[j] * w.w2[j * OUT + k];
    out[k] = sum;
  }
  /*
   * It asks for a thrust, not for engines. The first version had a head for "fire or not", one for "how hard" and one
   * for "how many", and it hovered: three discrete decisions that all have to agree, from a net that is only ever
   * approximately right. Asking for ONE number — the thrust it wants, in units of the ship's own weight — and then
   * running it through the same choose() the autopilot uses turns all of that back into arithmetic.
   */
  const weight = (DRY + s.fuel) * G;
  return { ...choose(Math.max(0, out[0]) * weight, 3), gimbal: Math.tanh(out[1]), flaps: Math.tanh(out[2]) };
}

export function flyNet(w: Weights, seed: number) {
  let s = start(mulberry32(seed)), end = outcome(s);
  for (let k = 0; k < 900 && end === "flying"; k++) {
    s = step(s, act(w, s), 0.1);
    end = outcome(s);
  }
  return { end, s };
}

export function rateNet(w: Weights, n: number) {
  let landed = 0, speed = 0;
  for (let i = 0; i < n; i++) {
    const r = flyNet(w, 5000 + i);
    if (r.end === "landed") { landed++; speed += Math.hypot(r.s.vx, r.s.vy); }
  }
  return { rate: landed / n, speed: landed ? speed / landed : 0 };
}

interface Sample { x: number[]; want: number; gimbal: number; flaps: number }

const label = (s: State, teacher: Gains): Sample => {
  const u = control(s, teacher);
  // The target is the teacher's thrust demand in units of the ship's weight: 0 while coasting, about 1 while holding
  // a descent, up to 3 while braking hard.
  return { x: observe(s), want: Math.min(4, u.want / ((DRY + s.fuel) * G)), gimbal: u.gimbal, flaps: u.flaps };
};

/** Fly the teacher and write down what it saw and did. */
function demonstrate(teacher: Gains, episodes: number, from: number): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < episodes; i++) {
    let s = start(mulberry32(from + i)), end = outcome(s);
    for (let k = 0; k < 900 && end === "flying"; k++) {
      out.push(label(s, teacher));
      s = step(s, control(s, teacher), 0.1);
      end = outcome(s);
    }
  }
  return out;
}

/** Fly the STUDENT and write down what the teacher would have done there. This is the DAgger part. */
function correct(w: Weights, teacher: Gains, episodes: number, from: number): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < episodes; i++) {
    let s = start(mulberry32(from + i)), end = outcome(s);
    for (let k = 0; k < 900 && end === "flying"; k++) {
      out.push(label(s, teacher));
      s = step(s, act(w, s), 0.1);
      end = outcome(s);
    }
  }
  return out;
}

export interface NetProgress {
  phase: "cloning" | "dagger";
  round: number;
  rate: number;
  speed: number;
  samples: number;
  weights: Weights;
}

/**
 * The whole lesson, as a generator so the page can show it happening: clone for a while (and watch it fail), then
 * six rounds of DAgger (and watch it start landing).
 */
export function* teach(teacher: Gains, rng: Rng, cloneSteps = 6000, rounds = 6): Generator<NetProgress> {
  const w = randomWeights(rng);
  const mats = { w1: new Mat(IN, HID, Float64Array.from(w.w1)), b1: new Mat(1, HID), w2: new Mat(HID, OUT, Float64Array.from(w.w2)), b2: new Mat(1, OUT) };
  const adam = new Adam(mats);
  const BATCH = 128;
  const snapshot = (): Weights => ({ w1: Float64Array.from(mats.w1.data), b1: Float64Array.from(mats.b1.data), w2: Float64Array.from(mats.w2.data), b2: Float64Array.from(mats.b2.data) });

  const trainOn = (data: Sample[], steps: number, rate = 2e-3) => {
    // Half of every batch from steps where the engines are lit: firing is a minority of the flight, and without this
    // the student learns the safest answer, which is never to fire.
    const lit = data.filter((d) => d.want > 0), dark = data.filter((d) => d.want === 0);
    for (let i = 0; i < steps; i++) {
      for (const p of Object.values(mats)) p.grad.fill(0);
      const batch = Array.from({ length: BATCH }, (_, k) => {
        const pool = k % 2 === 0 && lit.length ? lit : dark;
        return pool[Math.floor(rng() * pool.length)];
      });
      const tape = new Tape();
      const x = new Mat(BATCH, IN, Float64Array.from(batch.flatMap((b) => b.x)));
      const out = tape.addRow(tape.matmul(tape.relu(tape.addRow(tape.matmul(x, mats.w1), mats.b1)), mats.w2), mats.b2);
      const target = new Float64Array(BATCH * OUT), mask = new Float64Array(BATCH * OUT);
      batch.forEach((b, k) => {
        target[k * OUT] = b.want; mask[k * OUT] = 2; // the thrust matters more than the steering
        target[k * OUT + 1] = Math.atanh(Math.max(-0.99, Math.min(0.99, b.gimbal)));
        target[k * OUT + 2] = Math.atanh(Math.max(-0.99, Math.min(0.99, b.flaps)));
        mask[k * OUT + 1] = 1; mask[k * OUT + 2] = 1;
      });
      tape.mse(out, target, mask, 0.5);
      tape.backward();
      adam.step(rate);
    }
  };

  const pile = demonstrate(teacher, 120, 1);
  trainOn(pile, cloneSteps);
  let weights = snapshot();
  const first = rateNet(weights, 60);
  yield { phase: "cloning", round: 0, rate: first.rate, speed: first.speed, samples: pile.length, weights };

  // Keep the best round, not the last one. Each round adds states and moves the weights, and the round that lands
  // best is often not the final one — measured offline, the difference is the whole result (RESULTS.md).
  let best = { rate: first.rate, weights };
  for (let round = 1; round <= rounds; round++) {
    pile.push(...correct(weights, teacher, 60, 90_000 + round * 1000));
    trainOn(pile, 2500);
    weights = snapshot();
    const check = rateNet(weights, 60);
    if (check.rate >= best.rate) best = { rate: check.rate, weights };
    yield { phase: "dagger", round, rate: check.rate, speed: check.speed, samples: pile.length, weights: best.weights };
  }
}

/** For the article: what the seven-number autopilot scores on the same descents. */
export const teacherRate = (teacher: Gains, n: number) => {
  let landed = 0;
  for (let i = 0; i < n; i++) if (run(teacher, 5000 + i).end === "landed") landed++;
  return landed / n;
};
