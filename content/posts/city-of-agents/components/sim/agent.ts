import type { Rng } from "@/lib/ml";
import type { Params } from "./params";
import type { Action, AgentState, City, Needs, PlaceKind, Vec2 } from "./types";

/** What never changes about a person. The record keeps this beside the events so a replay can draw the need bars. */
export type AgentInfo = { id: number; home: number; work: number; rates: Needs; speed: number };

export type Agent = AgentInfo & {
  needs: Needs;
  state: AgentState;
  /** What they are doing, or on their way to do. */
  action: Action | null;
  /** Where they are; −1 while on the pavement. */
  place: number;
  /** Where they are heading while travelling. */
  goal: number;
  /** Route legs: waypoints[leg] → waypoints[leg + 1]. `nodes` holds the pavement node of each waypoint, −1 for a spot. */
  waypoints: Vec2[];
  nodes: number[];
  leg: number;
  /** Simulated minute of the next look at the options. */
  nextDecision: number;
};

export const ACTION_AT: Record<PlaceKind, Action> = { home: "sleep", office: "work", food: "eat", park: "social", riverside: "social" };

/** People get a home and a workplace of the right kind, random starting needs and their own pace of getting tired. */
export function createAgents(city: City, count: number, rng: Rng, params: Params): Agent[] {
  const homes = city.places.filter((p) => p.kind === "home"), offices = city.places.filter((p) => p.kind === "office");
  const jitter = (base: number, by: number) => base * (1 + (rng() * 2 - 1) * by);
  return Array.from({ length: count }, (_, id) => {
    const home = homes[Math.floor(rng() * homes.length)].id, work = offices[Math.floor(rng() * offices.length)].id;
    return {
      id, home, work,
      rates: params.decay.map((d) => jitter(d, params.rateJitter)) as Needs,
      speed: jitter(params.walkSpeed, params.speedJitter),
      needs: [rng() * 0.7, rng() * 0.7, rng() * 0.7, 0],
      state: "idle", action: null, place: home, goal: -1, waypoints: [], nodes: [], leg: 0,
      nextDecision: params.startMinute + Math.floor(rng() * params.reconsiderMinutes),
    };
  });
}
