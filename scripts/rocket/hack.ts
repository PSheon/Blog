/*
 * Reward hacking, measured. The same CEM, the same simulator, three different score functions — two of them written
 * the way a reasonable person would write them first.
 *   npx tsx scripts/rocket/hack.ts
 * Recorded in docs/research/rocket/RESULTS.md.
 */
import { type Gains, asArray, asGains, control } from "../../content/posts/rocket-landing/components/pilot";
import { type State, outcome, start, step } from "../../content/posts/rocket-landing/components/sim";
import { mulberry32 } from "@/lib/ml";

interface Flight { end: string; s: State; lowest: number; fired: number; steps: number }

function fly(g: Gains, seed: number): Flight {
  let s = start(mulberry32(seed)), end = outcome(s), lowest = s.y, fired = 0, steps = 0;
  for (; steps < 900 && end === "flying"; steps++) {
    const u = control(s, g);
    if (u.throttle > 0) fired++;
    s = step(s, u, 0.1);
    lowest = Math.min(lowest, s.y);
    end = outcome(s);
  }
  return { end, s, lowest, fired, steps };
}

const SCORES: Record<string, (f: Flight) => number> = {
  // The one the page uses: fuel is only worth something if it landed.
  honest: (f) => {
    const speed = Math.hypot(f.s.vx, f.s.vy), miss = Math.abs(f.s.x);
    const upright = Math.abs(Math.atan2(Math.sin(f.s.a), Math.cos(f.s.a)));
    return (f.end === "landed" ? 500 + 60 * Math.min(1, f.s.fuel / 18_000) : 0)
      + 100 / (1 + miss / 40) + 120 / (1 + speed / 5) + 80 / (1 + upright / 0.15) + 60 / (1 + Math.max(0, f.s.y) / 40);
  },
  // "Save fuel" — written without noticing that it also pays for crashing with a full tank.
  fuelAlways: (f) => {
    const speed = Math.hypot(f.s.vx, f.s.vy), miss = Math.abs(f.s.x);
    const upright = Math.abs(Math.atan2(Math.sin(f.s.a), Math.cos(f.s.a)));
    return (f.end === "landed" ? 500 : 0) + 60 * Math.min(1, f.s.fuel / 18_000)
      + 100 / (1 + miss / 40) + 120 / (1 + speed / 5) + 80 / (1 + upright / 0.15) + 60 / (1 + Math.max(0, f.s.y) / 40);
  },
  // "Stay alive and get near the pad" — no term for actually arriving.
  survive: (f) => f.steps + 300 / (1 + Math.abs(f.s.x) / 40) + (f.end === "landed" ? 500 : 0),
};

function cem(score: (f: Flight) => number, rng: () => number, iterations = 50, episodes = 14) {
  const mean = [400, 2, 0.8, 12, 1, 0.5, 0.8, 2, 2, 1], sigma = [250, 3, 0.3, 10, 3, 1, 0.3, 1, 1, 1];
  const clamp = (v: number[]) => asGains([
    Math.max(60, Math.min(1200, v[0])), Math.max(0, v[1]), Math.max(0.2, Math.min(1, v[2])),
    Math.max(1, Math.min(60, v[3])), Math.max(0, v[4]), v[5], Math.max(0.4, Math.min(1, v[6])),
    Math.max(1, Math.min(3, v[7])), Math.max(1, Math.min(3, v[8])), Math.max(0.05, Math.min(6, v[9])),
  ]);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  for (let i = 0; i < iterations; i++) {
    const seeds = Array.from({ length: episodes }, () => Math.floor(rng() * 1e9));
    const scored = Array.from({ length: 40 }, () => {
      const g = clamp(mean.map((m, k) => m + sigma[k] * normal()));
      return { v: asArray(g), score: seeds.reduce((sum, s) => sum + score(fly(g, s)), 0) / episodes };
    }).sort((a, b) => b.score - a.score);
    for (let k = 0; k < mean.length; k++) {
      const elite = scored.slice(0, 6).map((x) => x.v[k]);
      const m = elite.reduce((a, b) => a + b, 0) / 6;
      mean[k] = m;
      sigma[k] = Math.max(0.02 * Math.abs(m) + 0.01, Math.sqrt(elite.reduce((a, b) => a + (b - m) ** 2, 0) / 6));
    }
  }
  return asGains(mean);
}

for (const [name, score] of Object.entries(SCORES)) {
  const g = cem(score, mulberry32(97));
  const ends: Record<string, number> = {};
  let fuel = 0, fired = 0, speed = 0, landed = 0;
  for (let i = 0; i < 200; i++) {
    const f = fly(g, 77_000 + i);
    ends[f.end] = (ends[f.end] ?? 0) + 1;
    fuel += f.s.fuel; fired += f.fired / Math.max(1, f.steps); speed += Math.hypot(f.s.vx, f.s.vy);
    if (f.end === "landed") landed++;
  }
  console.log(`${name.padEnd(11)} landed ${((landed / 200) * 100).toFixed(1)}% | engines lit ${((fired / 200) * 100).toFixed(0)}% of the time | ${(fuel / 200 / 1000).toFixed(1)} t left | final speed ${(speed / 200).toFixed(1)} m/s | ${JSON.stringify(ends)}`);
  console.log(`            ignite ${g.ignite.toFixed(0)} m, flip on ${g.flipEngines.toFixed(2)}, cap ${g.brakeEngines.toFixed(2)}, chase ${g.chase.toFixed(2)}`);
}
