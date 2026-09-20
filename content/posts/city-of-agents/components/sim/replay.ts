import { spotAt } from "./city";
import type { PathCache } from "./nav";
import type { Context, Log, Snapshot } from "./overseer";
import type { City, Vec2 } from "./types";

/** For everyone travelling at `cursor`: when their walk ends, read from the events that follow. */
export function arrivalsAfter(log: Log, cursor: number, snapshot: Snapshot): Map<number, number> {
  const waiting = new Set<number>(), arrivals = new Map<number, number>();
  snapshot.agents.forEach((a, i) => { if (a.state === "traveling") waiting.add(i); });
  for (let k = cursor; k < log.events.length && waiting.size; k++) {
    const e = log.events[k];
    if (!waiting.has(e.agent)) continue;
    if (e.type === "arrived") arrivals.set(e.agent, e.t);
    waiting.delete(e.agent); // an arrival, or a change of destination: either way this walk ends here
  }
  return arrivals;
}

/**
 * Where everyone was at time `t`, from the record alone. People at a place stand on their spot; people walking are put
 * along their route by the share of the walk that has passed (or at walking pace, if the record does not reach their
 * arrival). Separation is not replayed, so a replayed walker can be a step away from where the live one was.
 */
export function replayPositions(city: City, paths: PathCache, snapshot: Snapshot, ctx: Context, arrivals: Map<number, number>, t: number, x: Float64Array, y: Float64Array, heading: Float64Array): void {
  snapshot.agents.forEach((a, i) => {
    if (a.state !== "traveling" || a.node < 0) {
      const [sx, sy] = spotAt(city.places[a.place >= 0 ? a.place : a.goal >= 0 ? a.goal : ctx.infos[i].home], i);
      x[i] = sx; y[i] = sy;
      return;
    }
    const goal = city.places[a.goal], points: Vec2[] = [[a.x, a.y], ...paths.route(a.node, goal.node).path.map((id) => city.nav.nodes[id]), spotAt(goal, i)];
    let total = 0;
    for (let k = 1; k < points.length; k++) total += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    const arrival = arrivals.get(i), walked = arrival !== undefined && arrival > a.since ? ((t - a.since) / (arrival - a.since)) * total : (t - a.since) * ctx.infos[i].speed;
    let left = Math.min(total, Math.max(0, walked));
    for (let k = 1; k < points.length; k++) {
      const dx = points[k][0] - points[k - 1][0], dy = points[k][1] - points[k - 1][1], len = Math.hypot(dx, dy);
      if (left <= len || k === points.length - 1) {
        const f = len ? Math.min(1, left / len) : 1;
        x[i] = points[k - 1][0] + dx * f; y[i] = points[k - 1][1] + dy * f;
        if (len) heading[i] = Math.atan2(dy, dx);
        return;
      }
      left -= len;
    }
  });
}

/** How many events of the record happened at or before `t`. */
export function cursorAt(log: Log, t: number): number {
  let lo = 0, hi = log.events.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (log.events[mid].t <= t) lo = mid + 1; else hi = mid; }
  return lo;
}
