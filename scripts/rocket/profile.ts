/*
 * One flight of the chosen autopilot, printing every time the engine count changes.
 *   npx tsx scripts/rocket/profile.ts
 */
import { asGains, control, measure } from "../../content/posts/rocket-landing/components/pilot";
import { outcome, start, step } from "../../content/posts/rocket-landing/components/sim";
import { mulberry32 } from "@/lib/ml";

const G = asGains([771.83, 3.99, 0.36, 1, 1.67, 0.43, 0.53, 1.1, 1.72, 3.15]);
for (const from of [5000, 77_000, 250_000]) {
  const m = measure(G, 300, from);
  console.log(`from ${from}: ${(m.rate * 100).toFixed(1)}% ${m.speed.toFixed(2)} m/s fuel ${(m.fuel / 1000).toFixed(1)} t miss ${m.miss.toFixed(1)} m ${JSON.stringify(m.ends)}`);
}

let s = start(mulberry32(5003)), k = 0, previous = -1;
const spent: Record<number, number> = {};
while (outcome(s) === "flying" && k < 900) {
  const u = control(s, G);
  spent[u.engines] = (spent[u.engines] ?? 0) + 1;
  if (u.engines !== previous) {
    console.log(`y=${s.y.toFixed(0)} m, falling ${(-s.vy).toFixed(0)} m/s → ${u.engines} × ${(u.throttle * 100).toFixed(0)}%`);
    previous = u.engines;
  }
  s = step(s, u, 0.1);
  k++;
}
console.log("steps per engine count:", JSON.stringify(spent));
