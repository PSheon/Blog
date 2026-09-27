import type { Agent } from "./agent";
import type { SimEvent } from "./types";

/** What a person counts as in the activity charts, bottom to top of each column. */
export const ACTIVITIES = ["sleep", "work", "eat", "social", "walking", "idle"] as const;
export type Activity = (typeof ACTIVITIES)[number];
export const activityOf = (a: Pick<Agent, "state" | "action">): Activity => (a.state === "traveling" ? "walking" : a.state === "acting" && a.action ? a.action : "idle");

/** Share of each activity among `agents`, in the order of `ACTIVITIES`. */
export function activityShares(agents: Pick<Agent, "state" | "action">[]): Float32Array {
  const shares = new Float32Array(ACTIVITIES.length);
  for (const a of agents) shares[ACTIVITIES.indexOf(activityOf(a))]++;
  if (agents.length) for (let k = 0; k < shares.length; k++) shares[k] /= agents.length;
  return shares;
}

/** Share of people doing the most common thing right now (an action, walking, or nothing). Near 1 at night in every mode. */
export function modalShare(agents: Agent[]): number {
  const counts = new Map<string, number>();
  for (const a of agents) { const key = a.state === "acting" ? (a.action as string) : a.state; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return agents.length ? Math.max(...counts.values()) / agents.length : 0;
}

/** Departures per `binMinutes` of the day, over events in [from, to). */
export function departureHistogram(events: SimEvent[], from: number, to: number, binMinutes = 10): number[] {
  const bins = new Array<number>(Math.ceil(1440 / binMinutes)).fill(0);
  for (const e of events) if (e.type === "departed" && e.t >= from && e.t < to) bins[Math.floor((e.t % 1440) / binMinutes)]++;
  return bins;
}

/** The busiest bin as a share of the population: 1 means everyone left home in the same ten minutes. */
export const peakDepartureShare = (histogram: number[], agents: number, days = 1): number => (agents ? Math.max(...histogram) / days / agents : 0);
