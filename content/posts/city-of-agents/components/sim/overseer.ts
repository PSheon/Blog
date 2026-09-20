import type { AgentInfo } from "./agent";
import { hoursInWindow, sunIntegral } from "./clock";
import { needOf } from "./needs";
import type { Params } from "./params";
import type { Action, AgentState, Mode, Needs, SimEvent } from "./types";

/** What the record knows about one person: their last event, and the needs it carried. */
export type AgentSnap = { state: AgentState; action: Action | null; place: number; goal: number; from: number; since: number; needs: Needs };
export type Snapshot = { t: number; mode: Mode; duty: boolean; agents: AgentSnap[] };
/** `base` is the state before `events[0]`: events that fell off the front of the record were folded into it. */
export type Log = { base: Snapshot; events: SimEvent[]; dropped: number };
export type Context = { infos: AgentInfo[]; params: Params };

export const EVENT_LIMIT = 5000;

export function initialSnapshot(infos: AgentInfo[], needs: Needs[], t: number, mode: Mode, duty: boolean): Snapshot {
  return { t, mode, duty, agents: infos.map((info, i) => ({ state: "idle", action: null, place: info.home, goal: -1, from: -1, since: t, needs: [...needs[i]] as Needs })) };
}

export const cloneSnapshot = (s: Snapshot): Snapshot => ({ ...s, agents: s.agents.map((a) => ({ ...a, needs: [...a.needs] as Needs })) });

/**
 * A person's needs at time `t`, from their last event alone. Between two events nothing about them changes, so every
 * need moves one way along a straight line (clamped to 0–1); duty only grows during the duty hours in between.
 */
export function needsAt(agent: AgentSnap, info: AgentInfo, duty: boolean, t: number, params: Params): Needs {
  const relieved = agent.state === "acting" && agent.action ? needOf(agent.action) : -1, hours = (t - agent.since) / 60;
  return agent.needs.map((v, i) => {
    if (i === 3 && !duty) return 0;
    const span = i === 3 ? hoursInWindow(agent.since, t, params.dutyHours[0], params.dutyHours[1]) : i === 0 ? hours - params.circadian * sunIntegral(agent.since, t) : hours;
    const grown = info.rates[i] * span;
    return Math.min(1, Math.max(0, v + grown - (i === relieved ? params.recovery[i] * hours : 0)));
  }) as Needs;
}

/** Folds one event into `snapshot`, in place. */
export function applyEvent(snapshot: Snapshot, e: SimEvent, ctx: Context): Snapshot {
  snapshot.t = e.t;
  if (e.type === "config") {
    // The rules change for everyone: bring every bar up to now under the old rules first.
    snapshot.agents.forEach((a, i) => { a.needs = needsAt(a, ctx.infos[i], snapshot.duty, e.t, ctx.params); a.since = e.t; });
    snapshot.mode = e.mode ?? snapshot.mode;
    snapshot.duty = e.duty ?? snapshot.duty;
    return snapshot;
  }
  const a = snapshot.agents[e.agent];
  a.needs = [...e.needs] as Needs; a.since = e.t;
  if (e.type === "departed") { a.state = "traveling"; a.action = e.action; a.goal = e.place; a.from = e.from; a.place = -1; }
  else if (e.type === "arrived") { a.state = "idle"; a.place = e.place; a.goal = -1; }
  else if (e.type === "started") { a.state = "acting"; a.action = e.action; a.place = e.place; }
  else { a.state = "idle"; a.action = null; } // finished, idle
  return snapshot;
}

/** Appends to the record, in place. Past the limit the oldest events fold into `base`, so a replay still starts from a known state. */
export function record(log: Log, e: SimEvent, ctx: Context, limit = EVENT_LIMIT): Log {
  log.events.push(e);
  if (log.events.length > limit) {
    const excess = log.events.length - limit;
    for (let k = 0; k < excess; k++) applyEvent(log.base, log.events[k], ctx);
    log.events.splice(0, excess);
    log.dropped += excess;
  }
  return log;
}

/** The state after the first `cursor` events of the record — derived from the record alone, never by re-simulating. */
export function snapshotAt(log: Log, cursor: number, ctx: Context): Snapshot {
  const snapshot = cloneSnapshot(log.base);
  for (let k = 0; k < Math.min(cursor, log.events.length); k++) applyEvent(snapshot, log.events[k], ctx);
  return snapshot;
}
