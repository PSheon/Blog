"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { CalibrationChart, type Curve, KneeChart, Legend } from "./chart";
import { type Labels, useLabels } from "./labels";
import { Param } from "./param";
import { type Bar, DEFAULT_JOB, type JobOptions, makeJob, PARAMS, schedule } from "./sim";
import { Timeline } from "./timeline";
import { useCurves } from "./use-curves";

/** Estimates that are right but for a little luck: for the figures that are about something other than bad estimates. */
const GOOD: JobOptions = { ...DEFAULT_JOB, bias: 0, noise: 0.05 };

function Panel({ t, options, workers, bars, headline, total = false, gap = false, failures = false }: { t: Labels; options: JobOptions; workers: number; bars: Bar[]; headline: Bar; total?: boolean; failures?: boolean; /** Plot the distance from the truth instead of what is shown: for errors that go both ways and cancel in an average. */ gap?: boolean }) {
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
        {failures && <Readout label={t.failedAttempts} value={(result?.failed ?? 0).toFixed(1)} tone="alt" />}
        {failures && <Readout label={t.wasted} value={Math.round((result?.wasted ?? 0) * 100)} unit="%" tone="alt" />}
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
      <Param label={t.skew} shown={`${skew.toFixed(1)} · ${skew <= 0.4 ? t.skewLow : skew >= 2 ? t.skewExtreme : skew >= 1 ? t.skewHigh : t.skewSome}`} value={skew} min={0.2} max={3} step={0.1} onChange={setSkew} />
      <Panel t={t} options={{ ...GOOD, skew }} workers={PARAMS.workers} bars={["count", "work"]} headline="count" />
    </div>
  );
}

const WORKER_STOPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/** Mean job length for each number of workers, and the mean of the longest chain: 100 jobs, a few milliseconds, worked out once the figure exists in the browser (node and the browser round exp and log differently, so not while rendering on the server). */
function useKnee(): { points: [number, number][]; floor: number } | null {
  const [knee, setKnee] = useState<{ points: [number, number][]; floor: number } | null>(null);
  useEffect(() => {
    // Off the first paint: it is only a few milliseconds, but nothing on screen needs it yet.
    const timer = window.setTimeout(() => {
    const jobs = Array.from({ length: 100 }, (_, k) => makeJob(k + 1, GOOD));
    let floor = 0;
    for (const job of jobs) { const chain = new Float64Array(job.tasks.length); for (const x of job.tasks) chain[x.id] = x.duration + Math.max(0, ...x.deps.map((d) => chain[d])); floor += Math.max(...chain) / jobs.length; }
    setKnee({ floor, points: WORKER_STOPS.map((w) => [w, jobs.reduce((sum, job) => sum + schedule(job.tasks, w, job.tasks.map((x) => x.attempts)).total, 0) / jobs.length]) });
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return knee;
}

/** Fig. 04: how many workers. One knob; the picture is the knee, and the bars' honesty sits beside it. */
export function WorkersLab() {
  const t = useLabels(), [stop, setStop] = useState(WORKER_STOPS.indexOf(16)), workers = WORKER_STOPS[stop], knee = useKnee();
  return (
    <div className="grid gap-4 text-sm" data-testid="workers-lab">
      <Param label={t.workers} value={stop} shown={String(workers)} min={0} max={WORKER_STOPS.length - 1} step={1} onChange={setStop} />
      <div className="mx-auto w-full max-w-md"><KneeChart points={knee?.points ?? []} floor={knee?.floor ?? 0} at={workers} label={t.kneeChart} axis={{ x: t.workers, y: t.kneeAxis, floor: t.floor }} /></div>
      <Panel t={t} options={GOOD} workers={workers} bars={["count", "work", "plan"]} headline="count" />
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

/** Fig. 02: attempts fail, the task goes back among the ready ones and is tried again. One knob: how often. */
export function FailLab() {
  const t = useLabels(), [failRate, setFailRate] = useState(0.2);
  // The opening job again (77), now with attempts that fail: the same tasks, the same order of arrival, more time.
  const { job, run } = useMemo(() => { const job = makeJob(77, { ...DEFAULT_JOB, failRate }); return { job, run: schedule(job.tasks, PARAMS.workers, job.tasks.map((x) => x.attempts)) }; }, [failRate]);
  return (
    <div className="grid gap-4 text-sm" data-testid="fail-lab">
      <Param label={t.failRate} shown={`${Math.round(failRate * 100)}%`} value={failRate} min={0} max={0.3} step={0.05} onChange={setFailRate} />
      <Timeline job={job} run={run} workers={PARAMS.workers} label={t.failTimeline} />
      <Panel t={t} options={{ ...GOOD, failRate }} workers={PARAMS.workers} bars={["work", "plan"]} headline="plan" total failures gap />
    </div>
  );
}
