/*
 * How far the flip throws the ship sideways, and what happens if it starts aimed at the pad.
 *   npx tsx scripts/rocket/flip.ts
 */
import { asGains, control } from "../../content/posts/rocket-landing/components/pilot";
import { outcome, start, step } from "../../content/posts/rocket-landing/components/sim";
import { mulberry32 } from "@/lib/ml";

const G = asGains([771.83, 3.99, 0.36, 1, 1.67, 0.43, 0.53, 1.1, 1.72, 3.15]);
let throwSum = 0, startSum = 0, n = 0, vxSum = 0;
for (let i = 0; i < 200; i++) {
  let s = start(mulberry32(5000 + i));
  const x0 = s.x;
  let atFlip = 0, k = 0, seenFlip = false;
  while (outcome(s) === "flying" && k < 900) {
    const wasSide = Math.abs(s.a) > 0.3;
    if (!seenFlip && s.y <= G.ignite) { atFlip = s.x; seenFlip = true; }
    const u = control(s, G);
    s = step(s, u, 0.1);
    if (seenFlip && wasSide && Math.abs(s.a) <= 0.3) {
      throwSum += s.x - atFlip; vxSum += s.vx; n++;
      break;
    }
    k++;
  }
  startSum += x0;
}
console.log(`start ${(startSum / 200).toFixed(0)} m off to one side; the flip moves it ${(throwSum / n).toFixed(0)} m and leaves ${(vxSum / n).toFixed(1)} m/s sideways`);
