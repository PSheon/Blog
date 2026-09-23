/*
 * The page's own network, five seeds: how reliably can 700 weights copy a nine-number autopilot?
 *   npx tsx scripts/rocket/net-seeds.ts
 * Recorded in docs/research/rocket/RESULTS.md.
 */
import { type NetProgress, rateNet, teach } from "../../content/posts/rocket-landing/components/net";
import { asGains, measure } from "../../content/posts/rocket-landing/components/pilot";
import { mulberry32 } from "@/lib/ml";

const TEACHER = asGains([771.83, 3.99, 0.36, 1, 1.67, 0.43, 0.53, 1.1, 1.72, 3.15]);
console.log("teacher, 200 descents:", JSON.stringify(measure(TEACHER, 200, 5000)));

const rates: number[] = [];
for (const seed of [7, 19, 31, 43, 57]) {
  let last: NetProgress | undefined;
  const marks: string[] = [];
  for (const progress of teach(TEACHER, mulberry32(seed))) {
    marks.push(`${progress.phase[0]}${progress.round}:${(progress.rate * 100).toFixed(0)}%`);
    last = progress;
  }
  if (!last) continue;
  const final = rateNet(last.weights, 200);
  rates.push(final.rate);
  console.log(`seed ${seed}: ${(final.rate * 100).toFixed(1)}% landed, ${final.speed.toFixed(2)} m/s  [${marks.join(" ")}]`);
}
console.log("spread:", rates.map((r) => `${(r * 100).toFixed(1)}%`).join(" / "));
