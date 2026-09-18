"use client";

import dynamic from "next/dynamic";
import { ProbBars } from "@/content/posts/cnn-from-scratch/components/prob-bars";

/**
 * The live classifier is the heaviest thing on the home page (weights, inference, canvases), and it
 * sits beside the headline, which is what the reader sees first. Keep it out of the hydration task:
 * load it afterwards, and hold its space with a box of the same shape so nothing jumps.
 */
const HeroInstrument = dynamic(() => import("./hero-instrument").then((m) => m.HeroInstrument), {
  ssr: false,
  loading: () => <Placeholder />,
});

/**
 * Same grid, same rows, same components as the real thing (ProbBars is presentational and carries
 * no model code), so the two states are the same height at every width and nothing shifts on swap.
 */
function Placeholder() {
  return (
    <div aria-hidden>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-5">
        <div className="aspect-square w-full rounded-sm border border-border bg-background" />
        <div className="grid gap-3">
          <div className="flex items-baseline justify-between">
            <span className="label">&nbsp;</span>
            <span className="font-mono text-5xl leading-none text-transparent tabular">0</span>
          </div>
          <ProbBars probs={null} prediction={null} compact />
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <div className="h-7" />
      </div>
    </div>
  );
}

export function HeroInstrumentLazy({ hint }: { hint: string }) {
  return <HeroInstrument hint={hint} />;
}
