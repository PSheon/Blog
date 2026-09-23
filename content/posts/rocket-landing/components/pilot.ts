"use client";

import { mulberry32 } from "@/lib/ml";
import { DRY, G, LENGTH, T_ONE, THROTTLE_FLOOR, type State, outcome, start, step, terminal, thrustOf } from "./sim";

/*
 * The autopilot, and the numbers a reader can have the page learn for them.
 *
 * The shape of the manoeuvre is fixed, and it is SpaceX's: fall flat with the flaps holding the belly into the
 * airflow, and at some height light the engines, swing the ship upright, and arrive at the pad with nothing left
 * over. What is learned are six constants — when to start the flip, how hard to swing, what speed to aim for on the
 * way down, how firmly to hold the attitude, and how to steer sideways.
 */
export interface Gains {
  /** height at which the engines light and the flip starts, metres */
  ignite: number;
  /** how hard the gimbal swings the ship upright */
  swing: number;
  /** the braking profile: how much of full thrust's deceleration it counts on */
  margin: number;
  /** speed to aim for just above the deck */
  flare: number;
  /** how stiffly the flaps hold the belly-flop */
  hold: number;
  /** how much sideways error is turned into a lean */
  lean: number;
  /** how hard the engines run during the flip: this is what throws the ship sideways onto the pad */
  push: number;
  /** how many Raptors to light for the flip, and the most it may light while braking — learned, not set */
  flipEngines: number;
  brakeEngines: number;
  /** how hard it chases the target speed: this is what turns a speed error into a thrust, and a thrust into a count */
  chase: number;
}

export const asArray = (g: Gains) => [g.ignite, g.swing, g.margin, g.flare, g.hold, g.lean, g.push, g.flipEngines, g.brakeEngines, g.chase];
export const asGains = (v: number[]): Gains => ({ ignite: v[0], swing: v[1], margin: v[2], flare: v[3], hold: v[4], lean: v[5], push: v[6], flipEngines: v[7], brakeEngines: v[8], chase: v[9] });

/**
 * How many engines to light, and how hard — from the thrust it wants.
 *
 * This is the whole reason the count is a decision. Each Raptor throttles between 40 % and 100 %, so one engine can
 * deliver 0.90–2.26 MN, two 1.80–4.51, three 2.71–6.77. The ship weighs about 1.26 MN, which is INSIDE one engine's
 * range and BELOW two engines' floor: on one engine it can hold any descent rate it likes, on two it can only ever
 * throw itself upward and coast back down. So the pilot works out the thrust it needs and then lights the fewest
 * engines that can produce it — many for the braking, one for the last few metres.
 */
export function choose(want: number, cap: number) {
  const most = Math.max(1, Math.min(3, Math.round(cap)));
  if (want < THROTTLE_FLOOR * T_ONE) return { engines: 0, throttle: 0 };
  for (let n = 1; n <= most; n++) {
    if (want <= n * T_ONE) return { engines: n, throttle: Math.max(THROTTLE_FLOOR, want / (n * T_ONE)) };
  }
  return { engines: most, throttle: 1 };
}

/** A copy that always lights the same number of engines — for comparing "always three" with a free choice. */
export const withEngines = (g: Gains, n: number): Gains => ({ ...g, flipEngines: n, brakeEngines: n });

export function control(s: State, g: Gains) {
  const mass = DRY + s.fuel;
  const flipLit = Math.max(1, Math.min(3, Math.round(g.flipEngines)));
  const brakeLit = Math.max(1, Math.min(3, Math.round(g.brakeEngines)));
  const speed = -s.vy;
  const flipping = s.y <= g.ignite;

  if (!flipping) {
    // Belly-flop: hold the ship broadside to the airflow, and lean a little to drift towards the pad.
    const want = Math.PI / 2 - Math.max(-0.35, Math.min(0.35, (s.x * 1e-3 + s.vx * 0.02) * g.lean));
    return { engines: 0, throttle: 0, want: 0, gimbal: 0, flaps: Math.max(-1, Math.min(1, (s.a - want) * g.hold + s.w * g.hold * 2)) };
  }

  const aMax = thrustOf(brakeLit) / mass - G;
  // Near the deck the target used to snap to a single speed, which makes the decision a knife edge: a student
  // copying it oscillates and ends up hovering. Letting the target shrink smoothly with height gives the same
  // landing but a decision that is learnable.
  const target = s.y < 60
    ? Math.max(g.flare, 0.55 * Math.sqrt(Math.max(0, s.y - 4)))
    : Math.max(g.flare, Math.sqrt(2 * g.margin * aMax * Math.max(0, s.y - 25)));
  const swinging = Math.abs(s.a) > 0.3;

  if (swinging) {
    // Still on its side. The gimbal only makes torque while the engines are lit, and every second spent sideways is
    // a second of thrust pushing it off the pad — so this part is done at full throttle and as fast as it will go.
    const push = Math.max(THROTTLE_FLOOR, Math.min(1, g.push));
    return {
      engines: flipLit,
      throttle: push,
      want: push * thrustOf(flipLit),
      gimbal: Math.max(-1, Math.min(1, s.a * g.swing + s.w * g.swing * 2.4)),
      flaps: Math.max(-1, Math.min(1, s.a * 0.8 + s.w * 2)),
    };
  }

  // Upright. Lean into whatever sideways speed the flip left behind, then hold the profile — not by switching the
  // engines on and off, but by asking for a thrust and lighting whatever can deliver it.
  const lean = Math.max(-0.3, Math.min(0.3, -(s.x * 1.2e-3 + s.vx * 0.03) * Math.max(0.2, g.lean)));
  const gimbal = Math.max(-1, Math.min(1, (s.a - lean) * g.hold * 2 + s.w * g.hold * 4));
  const want = (mass * (G + Math.max(0, speed - target) * g.chase)) / Math.max(0.3, Math.cos(s.a));
  return { ...choose(want, brakeLit), want, gimbal, flaps: 0 };
}

export function run(g: Gains, seed: number) {
  let s = start(mulberry32(seed)), end = outcome(s);
  for (let k = 0; k < 900 && end === "flying"; k++) {
    s = step(s, control(s, g), 0.1);
    end = outcome(s);
  }
  const speed = Math.hypot(s.vx, s.vy), miss = Math.abs(s.x);
  const upright = Math.abs(Math.atan2(Math.sin(s.a), Math.cos(s.a)));
  return {
    // Fuel only counts if it actually landed. Paying for leftover propellant on a crash is the first reward-hacking
    // trap in this file: the cheapest way to save fuel is never to light the engines at all.
    score:
      (end === "landed" ? 500 + 60 * Math.min(1, s.fuel / 18_000) : 0)
      + 100 / (1 + miss / 40) + 120 / (1 + speed / 5) + 80 / (1 + upright / 0.15) + 60 / (1 + Math.max(0, s.y) / 40),
    end,
    s,
  };
}

export function measure(g: Gains, n = 200, from = 5000) {
  const ends: Record<string, number> = {};
  let landed = 0, fuel = 0, speed = 0, miss = 0;
  for (let i = 0; i < n; i++) {
    const r = run(g, from + i);
    ends[r.end] = (ends[r.end] ?? 0) + 1;
    if (r.end === "landed") { landed++; fuel += r.s.fuel; speed += Math.hypot(r.s.vx, r.s.vy); miss += Math.abs(r.s.x); }
  }
  return { rate: landed / n, fuel: landed ? fuel / landed : 0, speed: landed ? speed / landed : 0, miss: landed ? miss / landed : 0, ends };
}

/** The cross-entropy method on those six numbers: sample, keep the best few, refit. It is the whole trainer. */
export interface Progress { iteration: number; gains: Gains; rate: number; touchdown: number; fuel: number }

export function* learn(iterations: number, rng: () => number, episodes = 8): Generator<Progress> {
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  // Start from something deliberately poor: flip far too late, barely steer.
  const mean = [400, 2, 0.8, 12, 1, 0.5, 0.8, 2, 2, 1], start0 = [250, 3, 0.3, 10, 3, 1, 0.3, 1, 1, 1];
  const sigma = [...start0];
  const POP = 40, ELITE = 6;
  for (let i = 0; i < iterations; i++) {
    const seeds = Array.from({ length: episodes }, () => Math.floor(rng() * 1e9));
    const scored = Array.from({ length: POP }, () => {
      const v = mean.map((m, k) => m + sigma[k] * normal());
      const g = asGains([
        Math.max(60, Math.min(1200, v[0])),
        Math.max(0, v[1]),
        Math.max(0.2, Math.min(1, v[2])),
        Math.max(1, Math.min(60, v[3])),
        Math.max(0, v[4]),
        v[5],
        Math.max(0.4, Math.min(1, v[6])),
        Math.max(1, Math.min(3, v[7])),
        Math.max(1, Math.min(3, v[8])),
        Math.max(0.05, Math.min(6, v[9])),
      ]);
      return { v: asArray(g), score: seeds.reduce((sum, s) => sum + run(g, s).score, 0) / seeds.length };
    }).sort((a, b) => b.score - a.score);
    for (let k = 0; k < mean.length; k++) {
      const elite = scored.slice(0, ELITE).map((x) => x.v[k]);
      const m = elite.reduce((a, b) => a + b, 0) / ELITE;
      mean[k] = m;
      // The spread of the elite, plus a little extra that fades out. Without the extra term the six elite agree too
      // early — most often on flipping with two engines, which is the difference between a pilot that lands 85 % of
      // the time and one that lands 30 % (docs/research/rocket/RESULTS.md).
      const explore = start0[k] * 0.2 * (1 - (i + 1) / iterations);
      sigma[k] = Math.max(0.02 * Math.abs(m) + 0.01, explore, Math.sqrt(elite.reduce((a, b) => a + (b - m) ** 2, 0) / ELITE));
    }
    const gains = asGains(mean), check = measure(gains, 30, 9000);
    yield { iteration: i + 1, gains, rate: check.rate, touchdown: check.speed, fuel: check.fuel };
  }
}

/** For the article: how fast it falls lying flat, and nose-first, at its landing mass. */
export const flatVsPointy = () => ({ flat: terminal(Math.PI / 2, DRY + 28_000), pointy: terminal(0, DRY + 28_000), length: LENGTH });
