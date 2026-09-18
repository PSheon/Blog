"use client";

import { useEffect, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { tensor } from "@/lib/ml";
import { DigitCanvas } from "./digit-canvas";
import { HeatCanvas } from "@/components/lab/heat-canvas";
import { useLabels } from "./labels";
import { ModelGate } from "./model-gate";
import { SamplePicker } from "./sample-picker";
import { getModel, setStrokes, useLab } from "./store";

const PATCH = 4;
const STRIDE = 2;
const STEPS = (28 - PATCH) / STRIDE + 1; // 13 positions per axis → 169 forward passes

const idle: (cb: () => void) => number =
  typeof window !== "undefined" && "requestIdleCallback" in window
    ? (cb) => window.requestIdleCallback(cb, { timeout: 60 })
    : (cb) => window.setTimeout(cb, 0);

interface Run {
  /** The input this run belongs to; a run for an older drawing is simply ignored. */
  input: Float32Array;
  progress: number;
  heat: Float32Array | null;
  lowest: number | null;
}

/**
 * Occlusion sensitivity: blank out a small patch, re-run the network, and record how far
 * the predicted class's probability falls. Patches that matter leave a bright mark.
 * Work is sliced into idle-time chunks and abandoned as soon as the drawing changes.
 */
export function OcclusionMap() {
  const lab = useLab();
  const t = useLabels();
  const [run, setRun] = useState<Run | null>(null);
  const { input, prediction, probs } = lab;

  useEffect(() => {
    const model = getModel();
    if (!model || prediction === null || !probs) return;
    let cancelled = false;
    const base = probs[prediction];
    const drop = new Float32Array(784);
    const hits = new Float32Array(784);
    let lowest = base;
    let pos = 0;

    const work = () => {
      if (cancelled) return;
      const deadline = performance.now() + 8;
      while (pos < STEPS * STEPS && performance.now() < deadline) {
        const py = Math.floor(pos / STEPS) * STRIDE;
        const px = (pos % STEPS) * STRIDE;
        const masked = input.slice();
        let touched = false;
        for (let y = py; y < py + PATCH; y++)
          for (let x = px; x < px + PATCH; x++) {
            if (masked[y * 28 + x] > 0) touched = true;
            masked[y * 28 + x] = 0;
          }
        // Hiding blank paper changes nothing; skip the forward pass.
        const p = touched ? model.predict(tensor(masked, [1, 1, 28, 28]))[prediction] : base;
        lowest = Math.min(lowest, p);
        for (let y = py; y < py + PATCH; y++)
          for (let x = px; x < px + PATCH; x++) {
            drop[y * 28 + x] += Math.max(0, base - p);
            hits[y * 28 + x] += 1;
          }
        pos++;
      }
      if (pos < STEPS * STEPS) {
        setRun({ input, progress: pos / (STEPS * STEPS), heat: null, lowest: null });
        idle(work);
        return;
      }
      for (let i = 0; i < 784; i++) drop[i] = hits[i] ? drop[i] / hits[i] : 0;
      setRun({ input, progress: 1, heat: drop, lowest });
    };
    idle(work);
    return () => {
      cancelled = true;
    };
  }, [input, prediction, probs]);

  const base = probs && prediction !== null ? probs[prediction] : null;
  const current = run?.input === input && base !== null ? run : null;
  const progress = base === null ? 1 : (current?.progress ?? 0);

  return (
    <ModelGate>
      <div className="grid gap-5 sm:grid-cols-[1fr_1fr_1fr] sm:items-start">
        <div className="grid gap-3">
          <DigitCanvas strokes={lab.strokes} onChange={setStrokes} ariaLabel={t.drawAria} hint={t.draw} />
        </div>
        <div>
          <HeatCanvas data={input} w={28} h={28} max={1} label={t.networkSees} />
          <p className="label mt-1.5">{t.networkSees}</p>
        </div>
        <div>
          <HeatCanvas data={current?.heat ?? null} w={28} h={28} label={t.occlusionFor} />
          <p className="label mt-1.5 flex justify-between">
            <span>{t.important}</span>
            {progress < 1 && <span className="text-signal">{t.computing} {Math.round(progress * 100)}%</span>}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-[auto_auto_auto_1fr] sm:items-end sm:gap-8">
        <Readout label={t.prediction} value={prediction ?? "–"} />
        <Readout label={t.baseline} value={base === null ? "–" : (base * 100).toFixed(1)} unit="%" tone="plain" />
        <Readout label={t.lowest} value={current?.lowest != null ? (current.lowest * 100).toFixed(1) : "–"} unit="%" tone="alt" />
        <SamplePicker t={t} digits={[1, 4, 7, 9]} />
      </div>
    </ModelGate>
  );
}
