import type { CityView, PeopleFrame } from "./city-view3d";
import {
  type Action, type AgentInfo, type AgentState, arrivalsAfter, type City, type Context, cursorAt, departureHistogram, generateCity, initialSnapshot, type Log,
  modalShare, type Mode, type Needs, needsAt, PARAMS, peakDepartureShare, record, replayPositions, type SimEvent, snapshotAt, World,
} from "./sim";

export type Setup = { seed: number; n: number; agents: number };
export type PersonRow = { id: number; state: AgentState; action: Action | null; place: number; needs: Needs };
export type PanelState = {
  /** The city these rows and events belong to. Place ids mean nothing in any other city, so the panel never reads the session's. */
  city: City;
  t: number; from: number; now: number; replaying: boolean; mode: Mode; duty: boolean; people: PersonRow[]; events: SimEvent[]; marks: number[];
  histogram: number[]; peak: number; sync: number; frame: number; calls: number;
  /** Who the camera follows, or −1; never past the end of `people`. */
  follow: number;
};

/** At most this many simulated minutes per frame: a slow frame drops simulated time instead of snowballing. */
const MAX_TICKS = 40;

/**
 * One city, its people, the record of what they did, and (once three.js has arrived) the picture of it. Not React: the
 * frame loop drives it, and the panel reads `panel()` a few times a second.
 */
export class CitySession {
  city!: City;
  world!: World;
  log!: Log;
  ctx!: Context;
  frame!: PeopleFrame;
  view: CityView | null = null;
  running = true;
  reduced = false;
  rate = 1;
  /** Simulated minute being looked at while replaying; null when live. */
  replayT: number | null = null;
  private pending = 0;
  private dirty = true;
  private shownReplay = NaN;
  private spent = 0;
  private frames = 0;
  private since = 0;
  private frameMs = 0;
  /** Set by whoever owns the canvas: a rebuilt city needs a rebuilt scene. */
  onRebuild: (() => void) | null = null;

  constructor(public setup: Setup) { this.rebuild(setup); }

  /** A new city or a new crowd: the world starts over and so does the record. */
  rebuild(setup: Setup): void {
    const { mode, duty, separationWeight } = this.world ?? { mode: "utility" as Mode, duty: true, separationWeight: PARAMS.separationWeight };
    this.setup = setup;
    if (!this.city || this.city.seed !== setup.seed || this.city.n !== setup.n) this.city = generateCity(setup.seed, setup.n);
    this.world = new World(this.city, { agents: setup.agents, mode, duty });
    this.world.separationWeight = separationWeight;
    const infos: AgentInfo[] = this.world.agents, count = infos.length;
    this.ctx = { infos, params: PARAMS };
    this.log = { base: initialSnapshot(infos, this.world.agents.map((a) => a.needs), this.world.t, mode, duty), events: [], dropped: 0 };
    this.world.onEvent = (e) => record(this.log, e, this.ctx);
    this.frame = { count, x: new Float64Array(count), y: new Float64Array(count), px: Float64Array.from(this.world.x), py: Float64Array.from(this.world.y), heading: new Float64Array(count), action: new Array<Action | null>(count).fill(null), walking: new Uint8Array(count) };
    this.replayT = null; this.pending = 0; this.dirty = true;
    this.onRebuild?.();
  }

  get follow(): number { return this.view?.follow ?? -1; }
  setFollow(id: number): void { if (this.view) { this.view.follow = id; this.dirty = true; } }
  setMode(mode: Mode): void { this.world.setMode(mode); this.dirty = true; }
  setDuty(on: boolean): void { this.world.setDuty(on); this.dirty = true; }
  setReplay(t: number | null): void { this.replayT = t === null ? null : Math.min(this.world.t, Math.max(this.log.base.t, t)); this.dirty = true; }
  touch(): void { this.dirty = true; }

  /** One animation frame. `dt` is real seconds since the last one. */
  step(now: number, dt: number): void {
    const started = performance.now(), { world, frame } = this, live = this.replayT === null;
    if (live && this.running) {
      this.pending += dt * PARAMS.minutesPerSecond * this.rate;
      for (let k = 0; this.pending >= 1 && k < MAX_TICKS; k++, this.pending--) { frame.px.set(world.x); frame.py.set(world.y); world.tick(); }
      if (this.pending >= 1) this.pending = 0;
      this.dirty = true;
    }
    const orbiting = this.running && !this.reduced, easing = this.view ? this.view.settling : false;
    if (this.view && (this.dirty || orbiting || easing)) {
      if (live) this.fillLive(); else if (this.shownReplay !== this.replayT) this.fillReplay(this.replayT as number);
      this.view.setTime(live ? world.t + this.pending : (this.replayT as number));
      this.view.updatePeople(frame, live ? this.pending : 1);
      this.view.render(dt, orbiting);
      this.dirty = false;
    }
    this.spent += performance.now() - started; this.frames++;
    if (now - this.since >= 1000) { this.frameMs = this.spent / this.frames; this.spent = 0; this.frames = 0; this.since = now; }
  }

  private fillLive(): void {
    const { world, frame } = this;
    frame.x.set(world.x); frame.y.set(world.y); frame.heading.set(world.heading);
    for (const a of world.agents) { frame.action[a.id] = a.action; frame.walking[a.id] = a.state === "traveling" ? 1 : 0; }
    this.shownReplay = NaN;
  }

  private fillReplay(t: number): void {
    const { frame, log, ctx } = this, cursor = cursorAt(log, t), snapshot = snapshotAt(log, cursor, ctx);
    replayPositions(this.city, this.world.paths, snapshot, ctx, arrivalsAfter(log, cursor, snapshot), t, frame.x, frame.y, frame.heading);
    frame.px.set(frame.x); frame.py.set(frame.y);
    snapshot.agents.forEach((a, i) => { frame.action[i] = a.action; frame.walking[i] = a.state === "traveling" ? 1 : 0; });
    this.shownReplay = t;
  }

  pick(clientX: number, clientY: number): number { return this.view ? this.view.pick(clientX, clientY, this.frame) : -1; }

  /** What the panel shows, live or at the replay time — the latter from the record alone. */
  panel(eventCount = 8): PanelState {
    const { world, log, ctx } = this, live = this.replayT === null, t = live ? world.t : (this.replayT as number), cursor = live ? log.events.length : cursorAt(log, t);
    let people: PersonRow[], mode = world.mode, duty = world.duty, sync: number;
    if (live) { people = world.agents.map((a) => ({ id: a.id, state: a.state, action: a.action, place: a.state === "traveling" ? a.goal : a.place, needs: a.needs })); sync = modalShare(world.agents); }
    else {
      const snapshot = snapshotAt(log, cursor, ctx), counts = new Map<string, number>();
      mode = snapshot.mode; duty = snapshot.duty;
      people = snapshot.agents.map((a, id) => ({ id, state: a.state, action: a.action, place: a.state === "traveling" ? a.goal : a.place, needs: needsAt(a, ctx.infos[id], duty, t, PARAMS) }));
      for (const p of people) { const key = p.state === "acting" ? (p.action as string) : p.state; counts.set(key, (counts.get(key) ?? 0) + 1); }
      sync = Math.max(...counts.values()) / people.length;
    }
    const events: SimEvent[] = [];
    for (let k = cursor - 1; k >= 0 && events.length < eventCount; k--) if (log.events[k].type !== "arrived") events.push(log.events[k]);
    const histogram = departureHistogram(log.events, t - 1440, t + 1e-9);
    return { city: this.city, follow: Math.min(this.follow, people.length - 1), t, from: log.base.t, now: world.t, replaying: !live, mode, duty, people, events, marks: log.events.filter((e) => e.type === "config").map((e) => e.t), histogram,
      peak: peakDepartureShare(histogram, people.length), sync, frame: this.frameMs, calls: this.view?.calls ?? 0 };
  }

  dispose(): void { this.view?.dispose(); this.view = null; }
}
