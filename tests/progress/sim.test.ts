import { describe, expect, it } from "vitest";
import { type Bar, BARS, DEFAULT_JOB, type JobOptions, makeJob, schedule, shown, trace } from "@/content/posts/progress-bar/components/sim";

const mean = (o: JobOptions, workers: number, n = 100) => {
  const sum = Object.fromEntries(BARS.map((b) => [b, { error: 0, above90: 0 }])) as Record<Bar, { error: number; above90: number }>;
  for (let seed = 1; seed <= n; seed++) { const h = trace(makeJob(seed, o), workers).honesty; for (const b of BARS) { sum[b].error += h[b].error / n; sum[b].above90 += h[b].above90 / n; } }
  return sum;
};

describe("the job and its schedule", () => {
  it("is the same job for the same seed", () => {
    expect(makeJob(3, DEFAULT_JOB)).toEqual(makeJob(3, DEFAULT_JOB));
    expect(makeJob(3, DEFAULT_JOB)).not.toEqual(makeJob(4, DEFAULT_JOB));
  });

  it("never starts a task before what it waits for, and never runs more tasks than there are workers", () => {
    for (const workers of [1, 4, 16]) {
      const job = makeJob(9, DEFAULT_JOB), run = schedule(job.tasks, workers, job.tasks.map((t) => t.duration));
      for (const t of job.tasks) { expect(run.finish[t.id] - run.start[t.id]).toBeCloseTo(t.duration, 9); for (const d of t.deps) expect(run.start[t.id]).toBeGreaterThanOrEqual(run.finish[d] - 1e-9); }
      const moments = [...run.start].sort((a, b) => a - b);
      for (const at of moments) expect(job.tasks.filter((t) => run.start[t.id] <= at && run.finish[t.id] > at).length).toBeLessThanOrEqual(workers);
    }
  });

  it("stops getting faster once there are more workers than the graph can use: the longest chain is the floor", () => {
    const job = makeJob(5, DEFAULT_JOB), durations = job.tasks.map((t) => t.duration), total = (w: number) => schedule(job.tasks, w, durations).total;
    const chain = new Float64Array(job.tasks.length);
    for (const t of job.tasks) chain[t.id] = t.duration + Math.max(0, ...t.deps.map((d) => chain[d]));
    expect(total(1)).toBeCloseTo(durations.reduce((a, b) => a + b, 0), 9);
    expect(total(4)).toBeLessThan(total(1));
    expect(total(64)).toBeCloseTo(Math.max(...chain), 9);
    expect(total(64)).toBeCloseTo(total(60), 9);
  });
});

describe("the four bars", () => {
  it("start at 0, end at 100, and only know what has happened so far", () => {
    const job = makeJob(2, DEFAULT_JOB), run = schedule(job.tasks, 4, job.tasks.map((t) => t.duration));
    for (const b of BARS) { expect(shown(job, run, 4, 0)[b]).toBe(0); expect(shown(job, run, 4, run.total)[b]).toBe(1); }
    // Change the truth about a task that has not started: what is shown now must not move.
    const later = job.tasks[job.tasks.length - 1], at = run.start[later.id] * 0.5, before = shown(job, run, 4, at);
    const other = { ...job, tasks: job.tasks.map((t) => (t.id === later.id ? { ...t, duration: t.duration * 5 } : t)) };
    expect(shown(other, run, 4, at)).toEqual(before);
  });

  it("the plan bar is exactly honest when every estimate is exactly right", () => {
    const h = trace(makeJob(8, { ...DEFAULT_JOB, bias: 0, noise: 0 }), 4).honesty;
    expect(h.plan.error).toBeLessThan(1e-9);
    expect(h.learn.error).toBeLessThan(1e-9);
  });

  // Measured first (docs/research/progress-bar/RESULTS.md, 200 jobs): count 10.1 / work 5.8 / plan 0.8 points with good
  // estimates and 4 workers; count 17.4 with 16. With biased estimates: plan 8.1, learn 4.0.
  it("with good estimates: counting is worst, weighting by work is better, replaying the plan is nearly honest; more workers hurt counting", () => {
    const good = { ...DEFAULT_JOB, bias: 0, noise: 0.05 }, four = mean(good, 4), sixteen = mean(good, 16);
    expect(four.count.error).toBeGreaterThan(four.work.error * 1.4);
    expect(four.work.error).toBeGreaterThan(four.plan.error * 4);
    expect(four.plan.error).toBeLessThan(1.5);
    expect(sixteen.count.error).toBeGreaterThan(four.count.error * 1.4);
    expect(sixteen.count.above90).toBeGreaterThan(0.28);
  }, 60_000);

  it("with estimates that are off by kind, the plan bar lies too, and learning from finished tasks halves its error", () => {
    const biased = mean(DEFAULT_JOB, 4);
    expect(biased.plan.error).toBeGreaterThan(6);
    expect(biased.learn.error).toBeLessThan(biased.plan.error * 0.6);
  }, 60_000);
});
