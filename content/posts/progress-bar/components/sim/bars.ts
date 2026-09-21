import { type Job, schedule, type Schedule } from "./job";
import { PARAMS } from "./params";

export const BARS = ["count", "work", "plan", "learn"] as const;
export type Bar = (typeof BARS)[number];

/**
 * What each kind of progress bar would show at time `t` of a run. All of them only know what a real program knows: the
 * plan's estimates, which tasks have finished and when, which are under way and since when. None sees a true duration
 * before the task is over.
 * - count: finished tasks / all tasks.
 * - work: estimated work finished / all estimated work.
 * - plan: time so far / (time so far + time the rest would take if it went as planned on these workers).
 * - learn: the same, after correcting each kind's estimates by how far off that kind's finished tasks were.
 */
export function shown(job: Job, run: Schedule, workers: number, t: number): Record<Bar, number> {
  const { tasks } = job, n = tasks.length, done = new Float64Array(n).fill(-1), begun = new Map<number, number>();
  let count = 0, work = 0, all = 0;
  const spent = new Float64Array(PARAMS.kinds + 8), planned = new Float64Array(PARAMS.kinds + 8);
  for (const task of tasks) {
    all += task.estimate;
    if (run.finish[task.id] <= t) { done[task.id] = run.finish[task.id]; count++; work += task.estimate; spent[task.kind] += task.duration; planned[task.kind] += task.estimate; }
    else if (run.start[task.id] >= 0 && run.start[task.id] <= t) begun.set(task.id, run.start[task.id]);
  }
  const eta = (belief: (kind: number) => number): number => {
    // What is still to do, as this bar believes it.
    const durations = Float64Array.from(tasks, (task) => {
      const expected = task.estimate * belief(task.kind), since = begun.get(task.id);
      if (since === undefined || t - since < expected) return expected;
      return t - since + PARAMS.overrunTail * expected; // it has outrun its estimate: assume a little more, not nothing
    });
    const total = schedule(tasks, workers, durations, t, done, begun).total;
    return total > 0 ? Math.min(1, t / total) : 1;
  };
  const learned = (kind: number) => (spent[kind] + PARAMS.priorWeight) / (planned[kind] + PARAMS.priorWeight);
  return { count: count / n, work: work / all, plan: count === n ? 1 : eta(() => 1), learn: count === n ? 1 : eta(learned) };
}

export type Honesty = { /** Mean distance between what is shown and the share of time that has passed, in points of 100. */ error: number; /** Share of the run spent showing 90 % or more. An honest bar: 10 %. */ above90: number; /** Largest step backwards, in points. */ backwards: number };

/** The curve a bar draws over one run (shown progress at evenly spaced moments), and how honest it was. */
export function trace(job: Job, workers: number, bars: readonly Bar[] = BARS, samples: number = PARAMS.samples): { total: number; curves: Record<Bar, Float64Array>; honesty: Record<Bar, Honesty> } {
  const run = schedule(job.tasks, workers, job.tasks.map((t) => t.duration)), curves = Object.fromEntries(BARS.map((b) => [b, new Float64Array(samples + 1)])) as Record<Bar, Float64Array>;
  for (let k = 0; k <= samples; k++) { const at = shown(job, run, workers, (run.total * k) / samples); for (const b of bars) curves[b][k] = at[b]; }
  const honesty = Object.fromEntries(BARS.map((b) => {
    let error = 0, above = 0, back = 0;
    for (let k = 1; k <= samples; k++) { error += Math.abs(curves[b][k] - k / samples); if (curves[b][k] >= 0.9) above++; back = Math.max(back, curves[b][k - 1] - curves[b][k]); }
    return [b, { error: (100 * error) / samples, above90: above / samples, backwards: 100 * back }];
  })) as Record<Bar, Honesty>;
  return { total: run.total, curves, honesty };
}
