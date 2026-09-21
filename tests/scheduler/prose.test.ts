import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bar, BARS, DEFAULT_JOB, type JobOptions, makeJob, PARAMS, schedule, trace } from "@/content/posts/task-scheduler/components/sim";

/*
 * Every number the article states in its prose, measured again and compared after rounding the way the text rounds it.
 * If the simulation changes and one of these moves, this fails, and the sentence has to be changed with it
 * (zh.mdx and en.mdx quote the same figures).
 */
const SIM = "content/posts/task-scheduler/components/sim", GOOD: JobOptions = { ...DEFAULT_JOB, bias: 0, noise: 0.05 };
const zh = readFileSync("content/posts/task-scheduler/zh.mdx", "utf8"), en = readFileSync("content/posts/task-scheduler/en.mdx", "utf8");
const says = (...needles: string[]) => { for (const n of needles) expect(zh.includes(n) || en.includes(n), `neither article says "${n}"`).toBe(true); };

function mean(o: JobOptions, workers: number, n = 200) {
  const sum = Object.fromEntries(BARS.map((b) => [b, { error: 0, above90: 0 }])) as Record<Bar, { error: number; above90: number }>;
  let total = 0, failed = 0, wasted = 0, busy = 0;
  for (let seed = 1; seed <= n; seed++) {
    const t = trace(makeJob(seed, o), workers);
    total += t.total / n;
    for (const a of t.run.attempts) { busy += a.to - a.from; if (!a.ok) { failed += 1 / n; wasted += a.to - a.from; } }
    for (const b of BARS) { sum[b].error += t.honesty[b].error / n; sum[b].above90 += t.honesty[b].above90 / n; }
  }
  return { ...sum, total, failed, wasted: wasted / busy };
}

describe("the numbers in the article", () => {
  it("the size of the simulation", () => {
    const lines = readdirSync(SIM).reduce((sum, f) => sum + readFileSync(`${SIM}/${f}`, "utf8").split("\n").length - 1, 0);
    says(`${lines} 行 TypeScript`, `${lines} lines of TypeScript`);
  });

  it("the opening job, number 77", () => {
    const job = makeJob(77, DEFAULT_JOB), t = trace(job, PARAMS.workers), sizes = job.tasks.map((x) => x.duration).sort((a, b) => b - a), all = sizes.reduce((a, b) => a + b, 0);
    expect(Math.round(t.curves.count[PARAMS.samples / 2] * 100)).toBe(67);
    expect(t.curves.count.findIndex((v) => v >= 0.9)).toBe(76);
    expect(Math.round((100 * sizes.slice(0, 6).reduce((a, b) => a + b, 0)) / all)).toBe(40);
    says("說 67%", "時間過到 76%", "says 67%", "at 76% of the time");
  });

  it("how long the job takes against how many workers", () => {
    const jobs = Array.from({ length: 100 }, (_, k) => makeJob(k + 1, GOOD)), minutes = (w: number) => jobs.reduce((s, j) => s + schedule(j.tasks, w, j.tasks.map((x) => x.attempts)).total, 0) / 100;
    expect([1, 2, 4].map((w) => Math.round(minutes(w)))).toEqual([122, 63, 38]);
    expect([8, 16, 32].map((w) => minutes(w).toFixed(1))).toEqual(["31.4", "31.0", "31.0"]);
    says("1 個 worker 122 分鐘，2 個 63，4 個 38，8 個 31.4", "122 minutes with one worker, 63 with two, 38 with four, 31.4 with eight");
  }, 60_000);

  it("how honest the bars are, with good estimates and with biased ones", () => {
    const four = mean(GOOD, 4), sixteen = mean(GOOD, 16), biased = mean(DEFAULT_JOB, 4);
    expect([Math.round(four.count.error), Math.round(four.work.error), Math.round(four.count.above90 * 100)]).toEqual([10, 6, 24]);
    expect(four.plan.error).toBeLessThan(1);
    expect([Math.round(sixteen.count.error), Math.round(sixteen.count.above90 * 100)]).toEqual([17, 33]);
    expect([biased.plan.error.toFixed(1), biased.work.error.toFixed(1), biased.learn.error.toFixed(1)]).toEqual(["8.2", "6.7", "4.0"]);
    says("平均差 10 點，有 24% 的時間", "16 個時差 17 點", "8.2 點降到 4.0 點", "off by 10 points on average and spends 24%", "from 8.2 points to 4.0");
  }, 120_000);

  it("tasks as unequal as this project's own unit tests", () => {
    const wild = mean({ ...GOOD, skew: 2.8 }, 4);
    expect([Math.round(wild.count.error), Math.round(wild.count.above90 * 100)]).toEqual([28, 45]);
    says("平均差 28 點，有 45% 的時間", "off by 28 points on average and spends 45%");
  }, 120_000);

  it("what one attempt in five failing costs", () => {
    const calm = mean(GOOD, 4), rough = mean({ ...GOOD, failRate: 0.2 }, 4);
    expect([Math.round(calm.total), Math.round(rough.total), Math.round(rough.failed), Math.round(rough.wasted * 100)]).toEqual([38, 44, 15, 13]);
    expect(Math.round((rough.total / calm.total - 1) * 100)).toBe(15);
    expect([calm.plan.error.toFixed(1), rough.plan.error.toFixed(1)]).toEqual(["0.7", "2.7"]);
    expect(rough.learn.error).toBeGreaterThan(rough.plan.error); // learning does not help against luck
    says("從 38 分鐘變成 44 分鐘", "從 0.7 點變成 2.7 點", "from 38 minutes to 44", "from 0.7 points to 2.7");
  }, 120_000);
});
