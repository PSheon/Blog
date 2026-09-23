/*
 * What the reader's own "訓練一個" button actually produces: the page runs learn(35, rng, 10).
 *   npx tsx scripts/rocket/page-train.ts
 */
import { type Progress, learn, measure } from "../../content/posts/rocket-landing/components/pilot";
import { mulberry32 } from "@/lib/ml";

const rates: number[] = [];
for (const seed of [3, 11, 23, 37, 51, 67, 79, 91, 103, 117]) {
  let last: Progress | undefined;
  const t0 = Date.now();
  for (const p of learn(35, mulberry32(seed), 10)) last = p;
  if (!last) continue;
  const m = measure(last.gains, 200, 77_000);
  rates.push(m.rate);
  console.log(`seed ${seed}: ${(m.rate * 100).toFixed(1)}% ${m.speed.toFixed(2)} m/s, flip on ${last.gains.flipEngines.toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
rates.sort((a, b) => a - b);
console.log(`ten readers: worst ${(rates[0] * 100).toFixed(0)}%, median ${(((rates[4] + rates[5]) / 2) * 100).toFixed(0)}%, best ${(rates[9] * 100).toFixed(0)}%`);
