import { describe, expect, it } from "vitest";
import data from "@/content/posts/trading-agent/aapl-2024.json";
import {
  HOLD, BUY, SELL, WINDOW,
  Trainer, buyAndHold, observe, simulate,
} from "@/content/posts/trading-agent/components/trading";
import { mulberry32 } from "@/lib/ml";

const always = (action: number) => () => action;

describe("observe", () => {
  it("returns the last WINDOW daily returns in percent, padded at the start", () => {
    const closes = [100, 110, 99];
    const day0 = observe(closes, 0);
    expect(day0).toHaveLength(WINDOW);
    expect(day0.every((v) => v === 0)).toBe(true);
    const day2 = observe(closes, 2);
    expect(day2[WINDOW - 2]).toBeCloseTo(10, 6);
    expect(day2[WINDOW - 1]).toBeCloseTo(-10, 6);
  });
});

describe("simulate", () => {
  const closes = [10, 20, 30, 40];

  it("does nothing when the policy always holds", () => {
    const r = simulate(always(HOLD), closes, 100);
    expect(r.trades).toEqual([]);
    expect(r.gains).toBe(0);
    expect(r.roi).toBe(0);
  });

  it("buys one share a day while cash lasts and marks the rest to market", () => {
    const r = simulate(always(BUY), closes, 35);
    // buys at 10 and 20 (cash 5 left), cannot afford 30; two shares worth 40 each at the end
    expect(r.trades.map((t) => [t.day, t.action])).toEqual([[0, "buy"], [1, "buy"]]);
    expect(r.cash).toBe(5);
    expect(r.shares).toBe(2);
    expect(r.equity).toBe(85);
    expect(r.roi).toBeCloseTo((85 - 35) / 35 * 100, 6);
  });

  it("cannot sell what it does not own", () => {
    expect(simulate(always(SELL), closes, 100).trades).toEqual([]);
  });

  it("sells first-in-first-out and reports each round trip", () => {
    const script = [BUY, BUY, SELL, HOLD];
    const r = simulate((_, day) => script[day], closes, 100);
    const sell = r.trades[2];
    expect(sell).toMatchObject({ day: 2, action: "sell", price: 30 });
    expect(sell.returnPct).toBeCloseTo(200, 6); // bought at 10, sold at 30
    expect(r.shares).toBe(1);
  });
});

describe("buyAndHold", () => {
  it("is the ROI of putting all the cash in on day one", () => {
    expect(buyAndHold([100, 150], 1000).roi).toBeCloseTo(50, 6);
    // 3 shares at 300 = 900, 100 idle → equity 3·330 + 100
    expect(buyAndHold([300, 330], 1000).equity).toBe(1090);
  });

  it("matches the year shown in the article", () => {
    expect(data.closes).toHaveLength(252);
    expect((data.closes.at(-1)! / data.closes[0] - 1) * 100).toBeCloseTo(34.9, 1);
  });
});

describe("Trainer", () => {
  it("never loses its best strategy from one generation to the next", () => {
    const trainer = new Trainer({ closes: data.closes, size: 30, mutationRate: 0.15, rng: mulberry32(5) });
    let previous = -Infinity;
    for (let i = 0; i < 8; i++) {
      const { bestRoi } = trainer.step();
      expect(bestRoi).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = bestRoi;
    }
    expect(trainer.history).toHaveLength(8);
    expect(trainer.best().roi).toBeCloseTo(previous, 6);
  });
});
