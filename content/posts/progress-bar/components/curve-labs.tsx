"use client";

import { useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { CalibrationChart, type Curve, Legend } from "./chart";
import { type Labels, useLabels } from "./labels";
import { Param } from "./param";
import { type Bar, DEFAULT_JOB, type JobOptions, PARAMS } from "./sim";
import { useCurves } from "./use-curves";

/** Estimates that are right but for a little luck: for the figures that are about something other than bad estimates. */
const GOOD: JobOptions = { ...DEFAULT_JOB, bias: 0, noise: 0.05 };

function Panel({ t, options, workers, bars, headline, total = false, gap = false }: { t: Labels; options: JobOptions; workers: number; bars: Bar[]; headline: Bar; total?: boolean; /** Plot the distance from the truth instead of what is shown: for errors that go both ways and cancel in an average. */ gap?: boolean }) {
  const root = useRef<HTMLDivElement>(null), result = useCurves(root, options, workers, bars), curves: Curve[] = bars.map((bar) => ({ bar, label: t.barsShort[bar], points: (gap ? result?.gaps[bar] : result?.curves[bar]) ?? [0, gap ? 0 : 1] }));
  return (
    <div ref={root} className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:items-center">
      <div className="grid gap-2">
        <CalibrationChart curves={curves} label={gap ? t.gapChart : t.chart} axis={{ x: t.timeAxis, y: gap ? t.gapAxis : t.shownAxis, honest: t.honest }} top={gap ? 0.2 : 1} />
        <Legend curves={curves} />
      </div>
      <div className="grid content-start gap-3">
        <p className="label" role="status">{result && result.done >= result.of ? `${result.of} ${t.runs}` : `${t.computing}… ${result?.done ?? 0} / ${result?.of ?? "…"}`}</p>
        {total && <Readout label={t.total} value={(result?.total ?? 0).toFixed(1)} unit={t.minutes} tone="plain" />}
        {bars.map((bar) => (
          <div key={bar} data-testid={`off-${bar}`} data-done={result !== null && result.done >= result.of}><Readout label={`${t.barsShort[bar]} · ${t.error}`} value={(result?.honesty[bar].error ?? 0).toFixed(1)} unit={t.points} tone={bar === headline ? "alt" : "muted"} /></div>
        ))}
        <Readout label={`${t.barsShort[headline]} · ${t.above90}`} value={Math.round((result?.honesty[headline].above90 ?? 0) * 100)} unit={`% — ${t.honestIs}`} tone="alt" />
      </div>
    </div>
  );
}

/** Fig. 02: how unequal the tasks are. One knob. */
export function SkewLab() {
  const t = useLabels(), [skew, setSkew] = useState<number>(PARAMS.skew);
  return (
    <div className="grid gap-4 text-sm" data-testid="skew-lab">
      <Param label={t.skew} shown={skew <= 0.4 ? t.skewLow : skew >= 1 ? t.skewHigh : skew.toFixed(1)} value={skew} min={0.2} max={1.6} step={0.1} onChange={setSkew} />
      <Panel t={t} options={{ ...GOOD, skew }} workers={PARAMS.workers} bars={["count", "work"]} headline="count" />
    </div>
  );
}

/** Fig. 03: how many workers. One knob; the plan bar joins the other two. */
export function WorkersLab() {
  const t = useLabels(), [workers, setWorkers] = useState(16);
  return (
    <div className="grid gap-4 text-sm" data-testid="workers-lab">
      <Param label={t.workers} value={workers} min={1} max={32} step={1} onChange={setWorkers} />
      <Panel t={t} options={GOOD} workers={workers} bars={["count", "work", "plan"]} headline="count" total />
    </div>
  );
}

/** Fig. 04: estimates that are wrong by kind, and a bar that learns how wrong from what has finished. */
export function LearnLab() {
  const t = useLabels(), [bias, setBias] = useState<number>(PARAMS.bias), [learning, setLearning] = useState(false);
  return (
    <div className="grid gap-4 text-sm" data-testid="learn-lab">
      <Param label={t.bias} shown={bias.toFixed(1)} value={bias} min={0} max={1} step={0.1} onChange={setBias} />
      <label className="label flex min-h-6 items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--signal)]" checked={learning} onChange={(e) => setLearning(e.target.checked)} data-testid="learn-toggle" />{t.learning}</label>
      <Panel t={t} options={{ ...DEFAULT_JOB, bias }} workers={PARAMS.workers} bars={learning ? ["work", "plan", "learn"] : ["work", "plan"]} headline={learning ? "learn" : "plan"} gap />
    </div>
  );
}
