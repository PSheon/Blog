/** Every number the article quotes about the simulated job lives here. Durations are in "minutes" of simulated work. */
export const PARAMS = {
  tasks: 60,
  layers: 6,
  workers: 4,
  /** Spread of true task sizes: the standard deviation of their logarithm. 0.2 is "all about the same", 1.2 is "a few huge ones". */
  skew: 1.2,
  /** Kinds of task. Each kind's estimates are off by its own constant factor: the part of the error that can be learned. */
  kinds: 4,
  /** How far a kind's estimates are off, as the standard deviation of the logarithm of that factor. */
  bias: 0.6,
  /** Error no one can learn: each task's own luck, standard deviation of the logarithm. */
  noise: 0.25,
  /** Chance that an attempt at a task fails part-way. The task then goes back among the ready ones and is tried again. */
  failRate: 0,
  /** A task fails at most this many times; a failed attempt dies somewhere between these shares of the way through. */
  maxFails: 3,
  failPoint: [0.2, 1] as [number, number],
  /** The learning bar trusts its prior (estimates are right) as much as this many minutes of finished work per kind. */
  priorWeight: 2,
  /** A task that has outrun its estimate is assumed to have this share of the estimate still to go. */
  overrunTail: 0.15,
  /** A progress bar is sampled this many times over a run. */
  samples: 100,
} as const;

export type JobOptions = { tasks: number; layers: number; skew: number; kinds: number; bias: number; noise: number; failRate: number };
export const DEFAULT_JOB: JobOptions = { tasks: PARAMS.tasks, layers: PARAMS.layers, skew: PARAMS.skew, kinds: PARAMS.kinds, bias: PARAMS.bias, noise: PARAMS.noise, failRate: PARAMS.failRate };
