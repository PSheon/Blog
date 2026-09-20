import type { Needs } from "./types";

/**
 * Every number the article quotes lives here.
 * The need rates are not the first draft's: measured with 300 people, those left nobody a free minute and no night
 * (docs/research/city-of-agents/RESULTS.md). `SPEC_PARAMS` below keeps the first draft for that comparison.
 * Rates are per simulated hour; needs run from 0 (satisfied) to 1 (desperate).
 */
export const PARAMS = {
  /** Simulated minutes per tick. Needs, decisions and events advance in whole ticks. */
  tickMinutes: 1,
  /** Movement sub-steps inside one tick, so separation still works at walking-step scale. */
  substeps: 6,
  /** Simulated minutes that pass per real second at 1×. */
  minutesPerSecond: 10,
  /** The world starts at Day 1, 06:00. */
  startMinute: 6 * 60,

  /** How fast each need grows, per hour. Duty grows only during office hours. */
  decay: [0.06, 0.075, 0.05, 0.15] as Needs,
  /** A need has to pass this before its action becomes a candidate. */
  threshold: [0.75, 0.6, 0.7, 0.4] as Needs,
  /** How fast the matching action brings it back down, per hour. The need keeps growing meanwhile, so the net rate is the difference. */
  recovery: [0.18, 0.9, 0.4, 0.25] as Needs,
  /** Each person's decay rates are scaled by 1 ± this. */
  rateJitter: 0.2,
  dutyHours: [6, 16] as [number, number],
  /** Fatigue grows at rate × (1 − circadian × sunAltitude): slower by day, faster by night. 0 switches the body clock off. */
  circadian: 0.9,
  /** Once started, an action runs until its need is down here (hysteresis) … */
  doneAt: 0.05,
  /** … unless something else beats it by more than this. */
  stayBonus: 0.3,
  /** Utility = need² − distanceCost × (travel minutes / 60). */
  distanceCost: 0.1,
  /** People acting or idle look again this often; each has their own phase. */
  reconsiderMinutes: 30,
  /** How many of the nearest restaurants / parks are compared by real walking distance. */
  nearestCandidates: 3,

  /** Fixed timetable of the `fsm` mode, by hour. */
  fsm: { work: 8, lunch: 12, backToWork: 13, home: 18 },
  /** `random` mode: how long a person stays put, in minutes. */
  randomStay: [30, 120] as [number, number],

  /** World units per simulated minute: crossing the default 8 × 8 city (366 units) on foot takes about 40 minutes. */
  walkSpeed: 9,
  speedJitter: 0.1,
  separationRadius: 1.6,
  separationWeight: 1,
  arriveRadius: 2,

  /** City geometry, in world units. */
  blockSize: 36,
  arterialWidth: 12,
  laneWidth: 7,
  arterialEvery: 4,
  pavementWidth: 3,
} as const;

type Widen<T> = T extends number ? number : T extends boolean ? boolean : T extends readonly unknown[] ? { [K in keyof T]: Widen<T[K]> } : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } : T;
export type Params = Widen<typeof PARAMS>;

/** The first draft of the table, as written: for the comparison in RESULTS.md only. */
export const SPEC_PARAMS: Params = {
  ...PARAMS, decay: [0.06, 0.12, 0.05, 0.15], threshold: [0.75, 0.6, 0.7, 0.5], recovery: [0.15, 0.4, 0.2, 0.25], dutyHours: [8, 18], circadian: 0, walkSpeed: 6,
};
