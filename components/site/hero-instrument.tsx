"use client";

import { DigitCanvas } from "@/content/posts/cnn-from-scratch/components/digit-canvas";
import { useLabels } from "@/content/posts/cnn-from-scratch/components/labels";
import { ModelGate } from "@/content/posts/cnn-from-scratch/components/model-gate";
import { ProbBars } from "@/content/posts/cnn-from-scratch/components/prob-bars";
import { SamplePicker } from "@/content/posts/cnn-from-scratch/components/sample-picker";
import { setStrokes, useLab } from "@/content/posts/cnn-from-scratch/components/store";

/** The home page's opening move: the article's classifier, live, before any explanation. */
export function HeroInstrument({ hint }: { hint: string }) {
  const lab = useLab();
  const t = useLabels();
  return (
    <ModelGate>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-5">
        <DigitCanvas strokes={lab.strokes} onChange={setStrokes} ariaLabel={t.drawAria} hint={hint} />
        <div className="grid gap-3">
          <div className="flex items-baseline justify-between">
            <span className="label">{t.prediction}</span>
            <span className="font-mono text-5xl leading-none text-signal tabular" data-testid="hero-prediction">
              {lab.prediction ?? "–"}
            </span>
          </div>
          <ProbBars probs={lab.probs} prediction={lab.prediction} compact />
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <SamplePicker t={t} digits={[0, 2, 3, 5, 7, 8]} />
      </div>
    </ModelGate>
  );
}
