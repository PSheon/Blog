import { Mlp, Population, type Rng } from "@/lib/ml";

export const HOLD = 0;
export const BUY = 1;
export const SELL = 2;

/** Days of price history the network looks at. */
export const WINDOW = 30;
export const HIDDEN = 24;
export const SHAPE = [WINDOW, HIDDEN, 3];
export const START_CASH = 10_000;

export interface Trade {
  day: number;
  action: "buy" | "sell";
  price: number;
  cash: number;
  /** For a sell: return on the share being sold, in percent. */
  returnPct?: number;
}

export interface Result {
  trades: Trade[];
  cash: number;
  shares: number;
  /** Cash plus open positions valued at the last close. */
  equity: number;
  gains: number;
  roi: number;
}

/**
 * What the network sees on a given day: the last WINDOW day-over-day changes, in
 * percent, so the input doesn't depend on whether the share costs $20 or $200.
 * Days before the series starts count as "no change".
 */
export function observe(closes: number[], day: number): Float32Array {
  const out = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    const t = day - (WINDOW - 1) + i;
    if (t >= 1) out[i] = ((closes[t] - closes[t - 1]) / closes[t - 1]) * 100;
  }
  return out;
}

export type Policy = (observation: Float32Array, day: number) => number;

/**
 * Walk through the series once. Each day the policy may buy one share (if it can
 * afford it), sell its oldest share, or hold. The same function scores candidates
 * during training and produces the final trade log, so the two can never disagree.
 */
export function simulate(policy: Policy, closes: number[], startCash = START_CASH): Result {
  let cash = startCash;
  const held: number[] = [];
  const trades: Trade[] = [];

  for (let day = 0; day < closes.length - 1; day++) {
    const price = closes[day];
    const action = policy(observe(closes, day), day);
    if (action === BUY && cash >= price) {
      cash -= price;
      held.push(price);
      trades.push({ day, action: "buy", price, cash });
    } else if (action === SELL && held.length > 0) {
      const paid = held.shift()!;
      cash += price;
      trades.push({ day, action: "sell", price, cash, returnPct: ((price - paid) / paid) * 100 });
    }
  }

  const equity = cash + held.length * closes[closes.length - 1];
  return {
    trades,
    cash,
    shares: held.length,
    equity,
    gains: equity - startCash,
    roi: ((equity - startCash) / startCash) * 100,
  };
}

/** The benchmark any strategy has to beat: spend everything on day one and wait. */
export function buyAndHold(closes: number[], startCash = START_CASH) {
  const shares = Math.floor(startCash / closes[0]);
  const equity = startCash - shares * closes[0] + shares * closes[closes.length - 1];
  return { shares, equity, roi: ((equity - startCash) / startCash) * 100 };
}

function policyOf(genome: Float32Array): Policy {
  const net = new Mlp(SHAPE, genome, "relu");
  return (observation) => {
    const out = net.forward(observation);
    let action = HOLD;
    if (out[BUY] > out[action]) action = BUY;
    if (out[SELL] > out[action]) action = SELL;
    return action;
  };
}

interface TrainerOptions {
  closes: number[];
  size: number;
  mutationRate: number;
  rng?: Rng;
}

/** One generation per step(), so the caller decides how to spread training over time. */
export class Trainer {
  readonly population: Population;
  /** Best ROI of every finished generation. */
  history: number[] = [];
  private champion: { genome: Float32Array; roi: number } | null = null;
  private readonly closes: number[];

  constructor({ closes, size, mutationRate, rng }: TrainerOptions) {
    this.closes = closes;
    this.population = new Population({ shape: SHAPE, size, mutationRate, mutationRange: 0.5, rng });
  }

  step() {
    const scores = this.population.genomes.map((g) => simulate(policyOf(g), this.closes).roi);
    let top = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[top]) top = i;
    if (!this.champion || scores[top] > this.champion.roi) {
      this.champion = { genome: Float32Array.from(this.population.genomes[top]), roi: scores[top] };
    }
    this.history.push(this.champion.roi);
    this.population.evolve(scores);
    return { generation: this.history.length, bestRoi: this.champion.roi };
  }

  best(): Result {
    if (!this.champion) throw new Error("Trainer.best() called before the first step()");
    return simulate(policyOf(this.champion.genome), this.closes);
  }
}
