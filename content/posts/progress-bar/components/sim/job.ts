import { mulberry32, type Rng } from "@/lib/ml";
import type { JobOptions } from "./params";

export type Task = { id: number; layer: number; kind: number; deps: number[]; /** What it will really take. */ duration: number; /** What the plan says it will take. */ estimate: number };
export type Job = { seed: number; tasks: Task[]; /** Each kind's hidden factor: real = estimate × this × luck. */ kindFactor: number[] };
export type Schedule = { start: Float64Array; finish: Float64Array; worker: Int32Array; total: number };

const gaussian = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/**
 * A job: tasks in layers, each waiting for one or two tasks of the layer before. The plan has an estimate for every task;
 * the truth is the estimate times a factor that belongs to the task's kind (always the same, so it can be learned) times
 * the task's own luck (which cannot). Same seed, same job.
 */
export function makeJob(seed: number, o: JobOptions): Job {
  const rng = mulberry32(seed), kindFactor = Array.from({ length: o.kinds }, () => Math.exp(gaussian(rng) * o.bias)), tasks: Task[] = [];
  for (let id = 0; id < o.tasks; id++) {
    const layer = Math.min(o.layers - 1, Math.floor((id * o.layers) / o.tasks)), kind = Math.floor(rng() * o.kinds), estimate = Math.exp(gaussian(rng) * o.skew);
    const deps: number[] = [];
    if (layer > 0) {
      const before = tasks.filter((t) => t.layer === layer - 1);
      for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) { const d = before[Math.floor(rng() * before.length)].id; if (!deps.includes(d)) deps.push(d); }
    }
    tasks.push({ id, layer, kind, deps, estimate, duration: estimate * kindFactor[kind] * Math.exp(gaussian(rng) * o.noise) });
  }
  return { seed, tasks, kindFactor };
}

/**
 * Runs the job on `workers` workers: whenever one is free it takes the ready task with the lowest id. `durations` says
 * how long each task takes — the true ones for what really happens, someone's beliefs for a forecast. Tasks already
 * under way (`begun`: task → when it started, on which worker) keep their start.
 */
export function schedule(tasks: Task[], workers: number, durations: ArrayLike<number>, from = 0, done?: ArrayLike<number>, begun?: Map<number, number>): Schedule {
  const n = tasks.length, start = new Float64Array(n).fill(-1), finish = new Float64Array(n).fill(-1), worker = new Int32Array(n).fill(-1), finished = new Uint8Array(n);
  const running: number[] = [], lanes = Array.from({ length: workers }, (_, k) => workers - 1 - k); // free workers; the lowest number is taken first
  let left = n, now = from;
  if (done) for (let i = 0; i < n; i++) if (done[i] >= 0) { finished[i] = 1; finish[i] = done[i]; left--; }
  if (begun) for (const [id, at] of begun) { start[id] = at; finish[id] = Math.max(now, at + durations[id]); running.push(id); worker[id] = lanes.pop() ?? -1; }
  while (left > 0) {
    for (const t of tasks) {
      if (!lanes.length) break;
      if (finished[t.id] || start[t.id] >= 0 || !t.deps.every((d) => finished[d])) continue;
      start[t.id] = now; finish[t.id] = now + durations[t.id]; worker[t.id] = lanes.pop() as number; running.push(t.id);
    }
    if (!running.length) throw new Error("the job has a task that can never start");
    let next = 0;
    for (let k = 1; k < running.length; k++) if (finish[running[k]] < finish[running[next]]) next = k;
    const id = running.splice(next, 1)[0];
    now = finish[id]; finished[id] = 1; left--;
    lanes.push(worker[id]); lanes.sort((a, b) => b - a);
  }
  return { start, finish, worker, total: now };
}
