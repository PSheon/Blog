"use client";

import { Readout } from "@/components/lab/readout";
import { DigitCanvas } from "./digit-canvas";
import { HeatCanvas } from "@/components/lab/heat-canvas";
import { useLabels } from "./labels";
import { ModelGate } from "./model-gate";
import { ProbBars } from "./prob-bars";
import { SamplePicker } from "./sample-picker";
import { setStrokes, useLab } from "./store";

export function DrawPredict() {
  const lab = useLab();
  const t = useLabels();
  const confidence = lab.probs && lab.prediction !== null ? lab.probs[lab.prediction] : null;

  return (
    <ModelGate>
      <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,2fr)_minmax(0,5fr)] md:items-start">
        <DigitCanvas strokes={lab.strokes} onChange={setStrokes} ariaLabel={t.drawAria} hint={t.draw} />

        <div className="grid grid-cols-[6rem_1fr] items-end gap-4 md:grid-cols-1">
          <div>
            <HeatCanvas data={lab.input} w={28} h={28} max={1} label={t.networkSees} />
            <p className="label mt-1.5">{t.networkSees}</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3" aria-live="polite">
            <Readout
              label={t.prediction}
              value={<span data-testid="prediction">{lab.prediction ?? "–"}</span>}
              large
            />
            <Readout label={t.confidence} value={confidence === null ? "–" : (confidence * 100).toFixed(1)} unit="%" tone="plain" />
            <Readout label={t.latency} value={lab.probs ? lab.ms.toFixed(1) : "–"} unit="ms" tone="plain" />
          </div>
          <ProbBars probs={lab.probs} prediction={lab.prediction} />
        </div>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <SamplePicker t={t} />
      </div>
    </ModelGate>
  );
}
