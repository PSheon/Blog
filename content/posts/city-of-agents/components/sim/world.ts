import { mulberry32, type Rng } from "@/lib/ml";
import { ACTION_AT, type Agent, createAgents } from "./agent";
import { spotAt } from "./city";
import { hourOf } from "./clock";
import { PathCache } from "./nav";
import { needOf, stepNeeds } from "./needs";
import { PARAMS, type Params } from "./params";
import { clampToCorridor, seek, separate, SpatialHash } from "./steering";
import type { Action, City, Mode, Needs, Place, SimEvent, Vec2 } from "./types";
import { choose, eligible, type Option } from "./utility";

export type WorldOptions = { agents: number; mode?: Mode; duty?: boolean; seed?: number; params?: Params };

/**
 * The city's people. `tick()` is one simulated minute: clock → needs → whoever is due decides again → everyone walks.
 * No three.js, no DOM, no Math.random: the same seed replays the same day.
 */
export class World {
  readonly params: Params;
  readonly agents: Agent[];
  readonly paths: PathCache;
  /** Positions and headings by agent id; the view reads these. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly heading: Float64Array;
  t: number;
  mode: Mode;
  duty: boolean;
  separationWeight: number;
  onEvent: ((event: SimEvent) => void) | null = null;

  private readonly rng: Rng;
  private readonly hash: SpatialHash;
  private readonly walkers: Int32Array;
  private readonly byAction: Record<Action, Place[]>;

  constructor(readonly city: City, options: WorldOptions) {
    this.params = options.params ?? PARAMS;
    this.rng = mulberry32((options.seed ?? city.seed) ^ 0x9e3779b9);
    this.agents = createAgents(city, options.agents, this.rng, this.params);
    this.paths = new PathCache(city.nav);
    this.t = this.params.startMinute;
    this.mode = options.mode ?? "utility";
    this.duty = options.duty ?? true;
    this.separationWeight = this.params.separationWeight;
    // Cells no smaller than the separation radius, and at most 64 × 64 of them: rebuilding costs a pass over all cells.
    this.hash = new SpatialHash(city.size, Math.max(this.params.separationRadius, city.size / 64));
    this.walkers = new Int32Array(this.agents.length);
    const n = this.agents.length;
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.heading = new Float64Array(n);
    const social = city.places.filter((p) => p.kind === "park" || p.kind === "riverside");
    this.byAction = { sleep: [], work: [], eat: city.places.filter((p) => p.kind === "food"), social };
    for (const a of this.agents) { const [sx, sy] = spotAt(city.places[a.home], a.id); this.x[a.id] = sx; this.y[a.id] = sy; }
  }

  get hour(): number { return hourOf(this.t); }

  setMode(mode: Mode): void { if (mode !== this.mode) { this.mode = mode; this.reconfigure(); } }
  setDuty(on: boolean): void { if (on !== this.duty) { this.duty = on; this.reconfigure(); } }

  /** A change of rules goes on the record and everyone looks again at once: it takes effect immediately. */
  private reconfigure(): void {
    this.emit({ t: this.t, type: "config", agent: -1, action: null, place: -1, from: -1, needs: [0, 0, 0, 0], mode: this.mode, duty: this.duty });
    for (const a of this.agents) a.nextDecision = this.t;
  }

  tick(): void {
    const p = this.params;
    const before = this.t;
    this.t += p.tickMinutes;
    for (const a of this.agents) {
      stepNeeds(a.needs, a.rates, a.state === "acting" ? a.action : null, before, p.tickMinutes / 60, p, this.duty);
      const done = this.mode === "utility" && a.state === "acting" && a.action !== null && a.needs[needOf(a.action)] <= p.doneAt;
      if (done || this.t >= a.nextDecision) this.decide(a);
    }
    for (let s = 0; s < p.substeps; s++) this.move(p.tickMinutes / p.substeps);
  }

  // ── deciding ──────────────────────────────────────────────────────────────

  private decide(a: Agent): void {
    const pick = this.mode === "utility" ? this.pickByUtility(a) : this.mode === "fsm" ? this.pickByTimetable(a) : this.pickAtRandom(a);
    a.nextDecision = this.mode === "fsm" ? this.nextBoundary() : this.mode === "random"
      ? this.t + this.between(this.params.randomStay)
      : this.t + this.params.reconsiderMinutes - 5 + Math.floor(this.rng() * 10);

    if (a.state === "traveling") {
      // Mid-route people only ever change destination; with nothing better to do they finish the walk.
      if (pick && pick.place !== a.goal) this.depart(a, pick.action, pick.place);
      return;
    }
    if (pick && a.state === "acting" && pick.action === a.action && pick.place === a.place) return;
    if (a.state === "acting") this.emitFor(a, "finished", a.place);
    if (!pick) {
      if (a.state !== "idle" || a.action !== null) { a.state = "idle"; a.action = null; this.emitFor(a, "idle", a.place); }
    } else if (pick.place === a.place) {
      a.state = "acting"; a.action = pick.action; this.emitFor(a, "started", a.place);
    } else this.depart(a, pick.action, pick.place);
  }

  private pickByUtility(a: Agent): { action: Action; place: number } | null {
    const p = this.params, options: Option[] = [], from = this.routeStart(a);
    const add = (action: Action, place: Place) => {
      const current = a.action === action && (a.state === "acting" ? a.place === place.id : a.goal === place.id);
      const travelMinutes = a.place === place.id ? 0 : this.paths.route(from, place.node).length / a.speed;
      options.push({ action, place: place.id, need: a.needs[needOf(action)], travelMinutes, current });
    };
    const actions: Action[] = ["sleep", "eat", "social", "work"];
    for (const action of actions) {
      const i = needOf(action);
      if ((i === 3 && !this.duty) || !eligible(a.needs[i], i, a.action === action && a.state !== "idle", p)) continue;
      if (action === "sleep") add(action, this.city.places[a.home]);
      else if (action === "work") add(action, this.city.places[a.work]);
      else for (const place of this.nearest(a, this.byAction[action])) add(action, place);
    }
    return choose(options, p);
  }

  private pickByTimetable(a: Agent): { action: Action; place: number } {
    const h = this.hour, f = this.params.fsm;
    if (h >= f.lunch && h < f.backToWork) {
      const here = a.state !== "idle" && a.action === "eat" ? this.city.places[a.state === "acting" ? a.place : a.goal] : this.nearest(a, this.byAction.eat)[0];
      return { action: "eat", place: here.id };
    }
    return h >= f.work && h < f.home ? { action: "work", place: a.work } : { action: "sleep", place: a.home };
  }

  private pickAtRandom(a: Agent): { action: Action; place: number } | null {
    if (this.rng() < 0.2) return null;
    const drawn = this.city.places[Math.floor(this.rng() * this.city.places.length)];
    const place = drawn.kind === "home" ? this.city.places[a.home] : drawn.kind === "office" ? this.city.places[a.work] : drawn;
    return { action: ACTION_AT[place.kind], place: place.id };
  }

  /** The few candidates closest as the crow flies; their real walking distance is compared afterwards. */
  private nearest(a: Agent, places: Place[]): Place[] {
    const x = this.x[a.id], y = this.y[a.id], k = this.params.nearestCandidates, best: Place[] = [], dist: number[] = [];
    for (const place of places) {
      const d = (place.centre[0] - x) ** 2 + (place.centre[1] - y) ** 2;
      let at = best.length;
      while (at > 0 && d < dist[at - 1]) at--;
      if (at < k) { best.splice(at, 0, place); dist.splice(at, 0, d); if (best.length > k) { best.pop(); dist.pop(); } }
    }
    return best;
  }

  private nextBoundary(): number {
    const f = this.params.fsm, day = Math.floor(this.t / 1440) * 1440;
    for (const h of [f.work, f.lunch, f.backToWork, f.home, f.work + 24]) if (day + h * 60 > this.t) return day + h * 60;
    return this.t + 60;
  }

  private between([lo, hi]: readonly [number, number]): number { return lo + Math.floor(this.rng() * (hi - lo)); }

  /** The pavement node a new route starts from: the door of where they are, or the node they are walking towards. */
  private routeStart(a: Agent): number {
    if (a.state !== "traveling") return this.city.places[a.place].node;
    return a.nodes[a.leg + 1] >= 0 ? a.nodes[a.leg + 1] : a.nodes[a.leg];
  }

  private depart(a: Agent, action: Action, goal: number): void {
    const nav = this.city.nav, start = this.routeStart(a), place = this.city.places[goal], route = this.paths.route(start, place.node);
    const here: Vec2 = [this.x[a.id], this.y[a.id]];
    let waypoints: Vec2[], nodes: number[];
    if (a.state === "traveling" && a.nodes[a.leg + 1] >= 0) { waypoints = [a.waypoints[a.leg]]; nodes = [a.nodes[a.leg]]; } // keep the leg they are on
    else { waypoints = [here]; nodes = [-1]; }
    for (const id of route.path) { waypoints.push(nav.nodes[id]); nodes.push(id); }
    waypoints.push(spotAt(place, a.id)); nodes.push(-1);
    const from = a.place;
    a.state = "traveling"; a.action = action; a.goal = goal; a.place = -1; a.waypoints = waypoints; a.nodes = nodes; a.leg = 0;
    this.emit({ t: this.t, type: "departed", agent: a.id, action, place: goal, from, needs: [...a.needs] as Needs });
  }

  private arrive(a: Agent): void {
    a.state = "acting"; a.place = a.goal; a.goal = -1; a.waypoints = []; a.nodes = []; a.leg = 0;
    this.emitFor(a, "arrived", a.place);
    this.emitFor(a, "started", a.place);
    if (this.mode === "utility") a.nextDecision = this.t + this.params.reconsiderMinutes;
    else if (this.mode === "random") a.nextDecision = this.t + this.between(this.params.randomStay);
  }

  private emitFor(a: Agent, type: SimEvent["type"], place: number): void {
    this.emit({ t: this.t, type, agent: a.id, action: a.action, place, from: -1, needs: [...a.needs] as Needs });
  }

  private emit(event: SimEvent): void { this.onEvent?.(event); }

  // ── walking ───────────────────────────────────────────────────────────────

  private readonly steer: Vec2 = [0, 0];
  private readonly push: Vec2 = [0, 0];
  private readonly pos: Vec2 = [0, 0];

  private move(minutes: number): void {
    const p = this.params, { x, y } = this, half = p.pavementWidth / 2 - 0.3;
    let count = 0;
    for (const a of this.agents) if (a.state === "traveling") this.walkers[count++] = a.id;
    if (!count) return;
    this.hash.build(this.walkers, count, x, y);
    for (let k = 0; k < count; k++) {
      const a = this.agents[this.walkers[k]], id = a.id, last = a.leg === a.waypoints.length - 2, target = a.waypoints[a.leg + 1];
      const { pos, steer, push } = this;
      pos[0] = x[id]; pos[1] = y[id];
      seek(pos, target, last, p.arriveRadius, steer);
      if (!last && this.separationWeight > 0) {
        push[0] = 0; push[1] = 0;
        this.hash.near(pos[0], pos[1], (other) => { if (other !== id) separate(pos, x[other], y[other], p.separationRadius, push); });
        steer[0] += push[0] * this.separationWeight; steer[1] += push[1] * this.separationWeight;
      }
      const len = Math.hypot(steer[0], steer[1]), step = a.speed * minutes;
      if (len > 1) { steer[0] /= len; steer[1] /= len; }
      pos[0] += steer[0] * step; pos[1] += steer[1] * step;
      if (len > 1e-6) this.heading[id] = Math.atan2(steer[1], steer[0]);
      const onPavement = a.nodes[a.leg] >= 0 && a.nodes[a.leg + 1] >= 0;
      const progress = onPavement ? clampToCorridor(pos, a.waypoints[a.leg], target, half) : 0;
      const reached = Math.hypot(target[0] - pos[0], target[1] - pos[1]) < Math.max(0.15, step * 0.6) || progress >= 1;
      if (reached && last) { pos[0] = target[0]; pos[1] = target[1]; }
      x[id] = pos[0]; y[id] = pos[1];
      if (reached) { if (last) this.arrive(a); else a.leg++; }
    }
  }
}
