import { mulberry32, type Rng } from "@/lib/ml";
import { type JobOptions, PARAMS } from "./params";

export type Task = { id: number; layer: number; kind: number; deps: number[]; /** What it will really take, once it goes through. */ duration: number; /** What the plan says it will take. */ estimate: number; /** Every attempt, in order: the ones that fail part-way, then the one that goes through. */ attempts: number[] };
export type Job = { seed: number; tasks: Task[]; /** Each kind's hidden factor: real = estimate × this × luck. */ kindFactor: number[] };
/** One stretch of one worker's time: an attempt at a task, and whether it went through. */
export type Attempt = { task: number; worker: number; from: number; to: number; ok: boolean };
/** `start` is when the task was first tried (its current attempt, for one under way in a forecast), `finish` when it went through. */
export type Schedule = { start: Float64Array; finish: Float64Array; worker: Int32Array; total: number; attempts: Attempt[] };

const gaussian = (rng: Rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/**
 * A job: tasks in layers, each waiting for one or two tasks of the layer before. The plan has an estimate for every task;
 * the truth is the estimate times a factor that belongs to the task's kind (always the same, so it can be learned) times
 * the task's own luck (which cannot). Same seed, same job.
 */
export function makeJob(seed: number, o: JobOptions): Job {
  // Failures are drawn from a stream of their own, so that turning them on does not change which job a seed gives.
  const rng = mulberry32(seed), luck = mulberry32(seed ^ 0x5f3759df), kindFactor = Array.from({ length: o.kinds }, () => Math.exp(gaussian(rng) * o.bias)), tasks: Task[] = [];
  for (let id = 0; id < o.tasks; id++) {
    const layer = Math.min(o.layers - 1, Math.floor((id * o.layers) / o.tasks)), kind = Math.floor(rng() * o.kinds), estimate = Math.exp(gaussian(rng) * o.skew);
    const deps: number[] = [];
    if (layer > 0) {
      const before = tasks.filter((t) => t.layer === layer - 1);
      for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) { const d = before[Math.floor(rng() * before.length)].id; if (!deps.includes(d)) deps.push(d); }
    }
    const duration = estimate * kindFactor[kind] * Math.exp(gaussian(rng) * o.noise), attempts: number[] = [];
    while (attempts.length < PARAMS.maxFails && luck() < o.failRate) attempts.push(duration * (PARAMS.failPoint[0] + luck() * (PARAMS.failPoint[1] - PARAMS.failPoint[0])));
    tasks.push({ id, layer, kind, deps, estimate, duration, attempts: [...attempts, duration] });
  }
  return { seed, tasks, kindFactor };
}

/**
 * Runs the job on `workers` workers. Four rules: a task is ready once everything it waits for has gone through; a free
 * worker takes the ready task with the lowest id; time jumps to the moment the next attempt ends; an attempt that failed
 * puts its task back among the ready ones, and whatever waits for it keeps waiting.
 * `attempts` says how long each attempt at each task takes — the true ones for what really happens, a single believed
 * duration each for a forecast. `done` and `begun` carry on from a job that is half way: finished tasks stay finished,
 * tasks under way keep the start of their current attempt (`begun`: task → that start).
 */
export function schedule(tasks: Task[], workers: number, attempts: ArrayLike<ArrayLike<number>>, from = 0, done?: ArrayLike<number>, begun?: Map<number, number>): Schedule {
  const n = tasks.length, start = new Float64Array(n).fill(-1), finish = new Float64Array(n).fill(-1), worker = new Int32Array(n).fill(-1), finished = new Uint8Array(n);
  const tried = new Int32Array(n), since = new Float64Array(n), ends = new Float64Array(n), busy = new Uint8Array(n), log: Attempt[] = [];
  const running: number[] = [], lanes = Array.from({ length: workers }, (_, k) => workers - 1 - k); // free workers; the lowest number is taken first
  let left = n, now = from;
  const begin = (id: number, at: number) => { if (start[id] < 0) start[id] = at; since[id] = at; ends[id] = Math.max(now, at + attempts[id][tried[id]]); worker[id] = lanes.pop() ?? -1; busy[id] = 1; running.push(id); };
  if (done) for (let i = 0; i < n; i++) if (done[i] >= 0) { finished[i] = 1; finish[i] = done[i]; left--; }
  if (begun) for (const [id, at] of begun) begin(id, at);
  while (left > 0) {
    for (const t of tasks) {
      if (!lanes.length) break;
      if (!finished[t.id] && !busy[t.id] && t.deps.every((d) => finished[d])) begin(t.id, now);
    }
    if (!running.length) throw new Error("the job has a task that can never start");
    let next = 0;
    for (let k = 1; k < running.length; k++) if (ends[running[k]] < ends[running[next]]) next = k;
    const id = running.splice(next, 1)[0], ok = tried[id] === attempts[id].length - 1;
    now = ends[id]; busy[id] = 0;
    log.push({ task: id, worker: worker[id], from: since[id], to: now, ok });
    if (ok) { finished[id] = 1; finish[id] = now; left--; } else tried[id]++; // failed: back among the ready, to be tried again
    lanes.push(worker[id]); lanes.sort((a, b) => b - a);
  }
  return { start, finish, worker, total: now, attempts: log };
}
