/*
 * What the trainer picks when the engine count is part of what it is choosing.
 *   npx tsx scripts/rocket/choice.ts
 * Recorded in docs/research/rocket/RESULTS.md.
 */
import { type Progress, asArray, learn, measure } from "../../content/posts/rocket-landing/components/pilot";
import { mulberry32 } from "@/lib/ml";

for (const seed of [7, 19, 31, 43, 57, 71, 83, 97]) {
  let last: Progress | undefined;
  for (const progress of learn(50, mulberry32(seed), 14)) last = progress;
  if (!last) continue;
  const g = last.gains, unseen = measure(g, 300, 77_000);
  console.log(
    `seed ${seed}: unseen ${(unseen.rate * 100).toFixed(1)}% ${unseen.speed.toFixed(2)} m/s fuel ${(unseen.fuel / 1000).toFixed(1)} t miss ${unseen.miss.toFixed(1)} m` +
      ` | ignite ${g.ignite.toFixed(0)} m, flip on ${g.flipEngines.toFixed(2)}, cap ${g.brakeEngines.toFixed(2)}, chase ${g.chase.toFixed(2)}` +
      ` ${JSON.stringify(asArray(g).map((v) => +v.toFixed(2)))}`,
  );
}
