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

/** The running task whose attempt ends first. */
function earliest(running: number[], ends: Float64Array): number {
  let first = running[0];
  for (const id of running) if (ends[id] < ends[first]) first = id;
  return first;
}

export type Step = { rule: 2; task: number; worker: number } | { rule: 3; task: number; worker: number; at: number; ok: boolean };

/**
 * The scheduler, one step at a time. Four rules: a task is ready once everything it waits for has gone through (1); a
 * free worker takes the ready task with the lowest id (2); time jumps to the moment the next attempt ends (3); an attempt
 * that failed leaves its task unfinished, so it is ready again and whatever waits for it keeps waiting (4).
 * `attempts` says how long each attempt at each task takes: the true ones for what really happens, one believed duration
 * each for a forecast. `done` and `begun` carry on from a job that is half way: finished tasks stay finished, tasks under
 * way keep the start of their current attempt.
 */
export class Scheduler {
  readonly start: Float64Array;
  readonly finish: Float64Array;
  readonly worker: Int32Array;
  readonly finished: Uint8Array;
  readonly busy: Uint8Array;
  readonly log: Attempt[] = [];
  readonly running: number[] = [];
  readonly freeWorkers: number[];
  now: number;
  left: number;
  private readonly tried: Int32Array;
  private readonly since: Float64Array;
  private readonly ends: Float64Array;

  constructor(readonly tasks: Task[], workers: number, private readonly attempts: ArrayLike<ArrayLike<number>>, from = 0, done?: ArrayLike<number>, begun?: Map<number, number>) {
    const n = tasks.length;
    this.start = new Float64Array(n).fill(-1); this.finish = new Float64Array(n).fill(-1); this.worker = new Int32Array(n).fill(-1);
    this.finished = new Uint8Array(n); this.busy = new Uint8Array(n); this.tried = new Int32Array(n); this.since = new Float64Array(n); this.ends = new Float64Array(n);
    this.freeWorkers = Array.from({ length: workers }, (_, k) => workers - 1 - k); // the lowest number is taken first
    this.now = from; this.left = n;
    if (done) for (let i = 0; i < n; i++) if (done[i] >= 0) { this.finished[i] = 1; this.finish[i] = done[i]; this.left--; }
    if (begun) for (const [id, at] of begun) this.begin(id, at);
  }

  /** Rule 1. */
  ready(): number[] { return this.tasks.filter((t) => !this.finished[t.id] && !this.busy[t.id] && t.deps.every((d) => this.finished[d])).map((t) => t.id); }

  private begin(id: number, at: number): number {
    if (this.start[id] < 0) this.start[id] = at;
    this.since[id] = at; this.ends[id] = Math.max(this.now, at + this.attempts[id][this.tried[id]]);
    this.worker[id] = this.freeWorkers.pop() ?? -1; this.busy[id] = 1; this.running.push(id);
    return this.worker[id];
  }

  /** Rule 2: every free worker takes a ready task, lowest id first. */
  assign(): Step[] {
    const steps: Step[] = [];
    for (const t of this.tasks) {
      if (!this.freeWorkers.length) break;
      const ready = !this.finished[t.id] && !this.busy[t.id] && t.deps.every((d) => this.finished[d]);
      if (ready) steps.push({ rule: 2, task: t.id, worker: this.begin(t.id, this.now) });
    }
    return steps;
  }

  /** Rules 3 and 4: jump to the end of the attempt that ends first; if it failed, its task is simply not finished. */
  advance(): Step {
    if (!this.running.length) throw new Error("the job has a task that can never start");
    const id = earliest(this.running, this.ends);
    return this.end(id, this.ends[id], this.tried[id] === this.attempts[id].length - 1);
  }

  /** Someone pulls the plug on a running task, now: the attempt fails where it stands, and rule 4 takes it from there. */
  kill(id: number): Step | null { return this.busy[id] ? this.end(id, this.now, false, true) : null; }

  /** When the current attempt at a running task began. */
  sinceOf(id: number): number { return this.since[id]; }

  /** Where a running attempt stands, 0–1. */
  progressOf(id: number): number { return this.busy[id] ? Math.min(1, (this.now - this.since[id]) / Math.max(1e-9, this.ends[id] - this.since[id])) : this.finished[id]; }

  private end(id: number, at: number, ok: boolean, killed = false): Step {
    this.running.splice(this.running.indexOf(id), 1);
    this.now = at; this.busy[id] = 0;
    this.log.push({ task: id, worker: this.worker[id], from: this.since[id], to: at, ok });
    if (ok) { this.finished[id] = 1; this.finish[id] = at; this.left--; } else if (!killed) this.tried[id]++; // failed: not finished, so rule 1 will find it again
    this.freeWorkers.push(this.worker[id]); this.freeWorkers.sort((a, b) => b - a);
    return { rule: 3, task: id, worker: this.worker[id], at, ok };
  }
}

/** Runs the whole job: assign, advance, until nothing is left. */
export function schedule(tasks: Task[], workers: number, attempts: ArrayLike<ArrayLike<number>>, from = 0, done?: ArrayLike<number>, begun?: Map<number, number>): Schedule {
  const s = new Scheduler(tasks, workers, attempts, from, done, begun);
  while (s.left > 0) { s.assign(); s.advance(); }
  return { start: s.start, finish: s.finish, worker: s.worker, total: s.now, attempts: s.log };
}
