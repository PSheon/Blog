import { describe, expect, it } from "vitest";
import {
  type Agent, type AgentInfo, type Log, type Needs, type Rect, type SimEvent,
  applyEvent, choose, cloneSnapshot, departureHistogram, eligible, findPath, generateCity, initialSnapshot, needsAt, PARAMS, peakDepartureShare,
  record, snapshotAt, stepNeeds, sunAltitude, sunIntegral, utility, windowsLit, World,
} from "@/content/posts/city-of-agents/components/sim";

const SEEDS = [1, 2, 3, 7, 42, 2026];

describe("clock", () => {
  it("puts the sun on the horizon at 6 and 18 and overhead at noon", () => {
    expect(sunAltitude(6)).toBeCloseTo(0, 12);
    expect(sunAltitude(12)).toBeCloseTo(1, 12);
    expect(sunAltitude(18)).toBeCloseTo(0, 12);
    expect(sunAltitude(0)).toBeCloseTo(-1, 12);
  });

  it("integrates the sun exactly: minute steps add up to one jump, and a whole day to zero", () => {
    let sum = 0;
    for (let t = 300; t < 1000; t++) sum += sunIntegral(t, t + 1);
    expect(sum).toBeCloseTo(sunIntegral(300, 1000), 9);
    expect(sunIntegral(0, 1440)).toBeCloseTo(0, 9);
  });

  it("lights windows in the evening only, each building at its own time", () => {
    for (const hash of [0, 0.3, 0.99]) { expect(windowsLit(12, hash)).toBe(false); expect(windowsLit(18.4, hash)).toBe(false); expect(windowsLit(4, hash)).toBe(false); }
    expect(windowsLit(18.6, 0)).toBe(true);
    expect(windowsLit(18.6, 0.9)).toBe(false);
    expect(windowsLit(22, 0.9)).toBe(true);
  });
});

describe("city", () => {
  it("is the same city for the same seed, and a different one for another", () => {
    expect(generateCity(5, 8)).toEqual(generateCity(5, 8));
    expect(generateCity(5, 8)).not.toEqual(generateCity(6, 8));
  });

  it("has all five zones, all three kinds of building and everything inside the grid, for every seed and size", () => {
    for (const seed of SEEDS) for (const n of [4, 8, 16]) {
      const city = generateCity(seed, n);
      expect(new Set(city.blocks.map((b) => b.zone)).size).toBe(5);
      expect(new Set(city.buildings.map((b) => b.kind)).size).toBe(3);
      for (const b of city.buildings) {
        const block = city.blocks[b.block].rect, inset = PARAMS.pavementWidth;
        expect(Math.abs(b.rect.x - block.x) + b.rect.w / 2).toBeLessThanOrEqual(block.w / 2 - inset);
        expect(Math.abs(b.rect.y - block.y) + b.rect.d / 2).toBeLessThanOrEqual(block.d / 2 - inset);
        expect(b.height).toBeGreaterThan(0);
      }
    }
  });

  it("builds taller towards the centre", () => {
    const city = generateCity(1, 16), offices = city.buildings.filter((b) => b.kind === "office");
    const d = (r: Rect) => Math.hypot(r.x - city.size / 2, r.y - city.size / 2), mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const sorted = [...offices].sort((a, b) => d(a.rect) - d(b.rect)), third = Math.floor(sorted.length / 3);
    expect(mean(sorted.slice(0, third).map((b) => b.height))).toBeGreaterThan(mean(sorted.slice(-third).map((b) => b.height)));
  });

  it("gives everyone a house to live in and an office to work in", () => {
    for (const seed of SEEDS) {
      const city = generateCity(seed, 4), world = new World(city, { agents: 300 });
      for (const a of world.agents) { expect(city.places[a.home].kind).toBe("home"); expect(city.places[a.work].kind).toBe("office"); }
    }
  });
});

describe("nav", () => {
  const crosses = ([x0, y0]: number[], [x1, y1]: number[], r: Rect) => {
    // Liang–Barsky against the building's footprint.
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[x0 - x1, x0 - (r.x - r.w / 2)], [x1 - x0, r.x + r.w / 2 - x0], [y0 - y1, y0 - (r.y - r.d / 2)], [y1 - y0, r.y + r.d / 2 - y0]]) {
      if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
    }
    return t0 < t1;
  };

  it("reaches every pavement node from every other", () => {
    for (const seed of SEEDS.slice(0, 3)) for (const n of [4, 8]) {
      const { nav } = generateCity(seed, n), seen = new Set([0]), queue = [0];
      while (queue.length) for (const next of nav.edges[queue.pop() as number]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
      expect(seen.size).toBe(nav.nodes.length);
    }
  });

  it("never routes through a building, and A* finds the way between far corners", () => {
    const city = generateCity(3, 8), { nav } = city;
    nav.edges.forEach((list, a) => list.forEach((b) => { for (const building of city.buildings) expect(crosses(nav.nodes[a], nav.nodes[b], building.rect)).toBe(false); }));
    const first = city.places[0].node, last = city.places[city.places.length - 1].node, path = findPath(nav, first, last);
    expect(path?.[0]).toBe(first);
    expect(path?.[path.length - 1]).toBe(last);
    for (let i = 1; i < (path?.length ?? 0); i++) expect(nav.edges[path![i - 1]]).toContain(path![i]);
  });
});

describe("needs", () => {
  it("left alone for three days, one person's four needs each pass their threshold at least once a day, and none sticks at 1", () => {
    const world = new World(generateCity(1, 8), { agents: 1 }), a = world.agents[0], events: SimEvent[] = [];
    world.onEvent = (e) => events.push(e);
    let pinned = 0;
    const crossed = Array.from({ length: 3 }, () => [false, false, false, false]);
    for (let k = 0; k < 3 * 1440; k++) {
      world.tick();
      const day = Math.floor((world.t - PARAMS.startMinute) / 1440);
      if (day < 3) a.needs.forEach((v, i) => { if (v > PARAMS.threshold[i]) crossed[day][i] = true; });
      if (a.needs.some((v) => v >= 1)) pinned++;
    }
    expect(crossed).toEqual(Array.from({ length: 3 }, () => [true, true, true, true]));
    expect(pinned).toBe(0);
    for (const action of ["sleep", "eat", "social", "work"]) expect(events.some((e) => e.type === "started" && e.action === action)).toBe(true);
  });

  it("grows duty only in duty hours, and not at all when duty is off", () => {
    const needs: Needs = [0, 0, 0, 0], rates: Needs = [0.06, 0.075, 0.05, 0.15];
    stepNeeds(needs, rates, null, 3 * 60, 1, PARAMS, true);
    expect(needs[3]).toBe(0);
    stepNeeds(needs, rates, null, 9 * 60, 1, PARAMS, true);
    expect(needs[3]).toBeCloseTo(0.15, 12);
    stepNeeds(needs, rates, null, 9 * 60, 1, PARAMS, false);
    expect(needs[3]).toBe(0);
  });
});

describe("utility", () => {
  const option = (need: number, travelMinutes: number, current = false) => ({ action: "eat" as const, place: 0, need, travelMinutes, current });

  it("prefers the higher need at equal distance and the nearer place at equal need", () => {
    const hungry = option(0.9, 20), peckish = option(0.7, 20), near = option(0.8, 5), far = option(0.8, 45);
    expect(choose([peckish, hungry], PARAMS)).toBe(hungry);
    expect(choose([far, near], PARAMS)).toBe(near);
    expect(utility(near, PARAMS) - utility(far, PARAMS)).toBeCloseTo(PARAMS.distanceCost * (40 / 60), 12);
    expect(choose([], PARAMS)).toBeNull();
  });

  it("keeps an action on the table below its threshold once it has started, until the need is nearly gone", () => {
    expect(eligible(0.5, 1, false, PARAMS)).toBe(false);
    expect(eligible(0.5, 1, true, PARAMS)).toBe(true);
    expect(eligible(PARAMS.doneAt, 1, true, PARAMS)).toBe(false);
  });

  it("does not leave the table after one bite", () => {
    const world = new World(generateCity(1, 8), { agents: 50 }), events: SimEvent[] = [];
    world.onEvent = (e) => events.push(e);
    for (let k = 0; k < 2 * 1440; k++) world.tick();
    const meals: number[] = [], started = new Map<number, number>();
    for (const e of events) {
      if (e.type === "started" && e.action === "eat") started.set(e.agent, e.t);
      else if (e.type === "finished" && e.action === "eat" && started.has(e.agent)) { meals.push(e.t - (started.get(e.agent) as number)); started.delete(e.agent); }
    }
    meals.sort((a, b) => a - b);
    expect(meals.length).toBeGreaterThan(50);
    expect(meals[Math.floor(meals.length / 2)]).toBeGreaterThan(PARAMS.reconsiderMinutes);
  });
});

describe("world", () => {
  const runDays = (world: World, days: number) => {
    const events: SimEvent[] = [];
    world.onEvent = (e) => events.push(e);
    for (let k = 0; k < days * 1440; k++) world.tick();
    return events;
  };
  const distanceToLeg = (world: World, a: Agent) => {
    const [ax, ay] = a.waypoints[a.leg], [bx, by] = a.waypoints[a.leg + 1], ex = bx - ax, ey = by - ay;
    const s = Math.min(1, Math.max(0, ((world.x[a.id] - ax) * ex + (world.y[a.id] - ay) * ey) / (ex * ex + ey * ey || 1)));
    return Math.hypot(world.x[a.id] - ax - ex * s, world.y[a.id] - ay - ey * s);
  };

  it("runs 300 people for three days in every mode: timestamps never go back, nobody leaves the pavement, everyone gets where they are going", () => {
    for (const mode of ["utility", "fsm", "random"] as const) {
      const world = new World(generateCity(1, 8), { agents: 300, mode }), events: SimEvent[] = [];
      world.onEvent = (e) => events.push(e);
      let worst = 0;
      for (let k = 0; k < 3 * 1440; k++) {
        world.tick();
        for (const a of world.agents) {
          expect(Number.isFinite(world.x[a.id]) && Number.isFinite(world.y[a.id])).toBe(true);
          if (a.state === "traveling" && a.nodes[a.leg] >= 0 && a.nodes[a.leg + 1] >= 0) worst = Math.max(worst, distanceToLeg(world, a));
        }
      }
      for (let i = 1; i < events.length; i++) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
      expect(worst).toBeLessThanOrEqual(PARAMS.pavementWidth / 2);
      const departed = events.filter((e) => e.type === "departed").length, arrived = events.filter((e) => e.type === "arrived").length;
      expect(departed).toBeGreaterThan(300);
      expect(arrived).toBeGreaterThan(departed * 0.9);
    }
  }, 120_000);

  it("replays exactly from the same seed", () => {
    const a = runDays(new World(generateCity(9, 6), { agents: 80 }), 1), b = runDays(new World(generateCity(9, 6), { agents: 80 }), 1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(500);
  });

  it("does not have everyone deciding on the same minute in utility mode; in fsm mode everyone leaves at eight", () => {
    const peak = (mode: "utility" | "fsm") => {
      const world = new World(generateCity(1, 8), { agents: 300, mode }), events = runDays(world, 3), from = 2 * 1440;
      return peakDepartureShare(departureHistogram(events, from, from + 1440), 300);
    };
    expect(peak("fsm")).toBe(1);
    expect(peak("utility")).toBeLessThan(0.25);
  }, 60_000);

  it("takes a change of rules at once and puts it on the record", () => {
    const world = new World(generateCity(1, 8), { agents: 100 }), events: SimEvent[] = [];
    world.onEvent = (e) => events.push(e);
    for (let k = 0; k < 600; k++) world.tick();
    world.setDuty(false);
    world.tick();
    expect(events.some((e) => e.type === "config" && e.duty === false)).toBe(true);
    for (let k = 0; k < 120; k++) world.tick();
    expect(world.agents.every((a) => a.needs[3] === 0 && !(a.state === "acting" && a.action === "work"))).toBe(true);
  });
});

describe("overseer", () => {
  const setup = (limit: number, days = 1) => {
    const world = new World(generateCity(4, 6), { agents: 60 }), infos: AgentInfo[] = world.agents, ctx = { infos, params: PARAMS };
    const base = initialSnapshot(infos, world.agents.map((a) => a.needs), world.t, world.mode, world.duty);
    const log: Log = { base: cloneSnapshot(base), events: [], dropped: 0 }, all: SimEvent[] = [];
    world.onEvent = (e) => { all.push(e); record(log, e, ctx, limit); };
    for (let k = 0; k < days * 1440; k++) { world.tick(); if (k === 700) world.setMode("fsm"); if (k === 900) world.setMode("utility"); }
    return { world, ctx, base, log, all };
  };

  it("a replay to any cursor equals folding the events one by one", () => {
    const { ctx, base, log, all } = setup(1e9), running = cloneSnapshot(base);
    expect(log.events).toEqual(all);
    all.forEach((e, k) => { applyEvent(running, e, ctx); if (k % 97 === 0 || k === all.length - 1) expect(snapshotAt(log, k + 1, ctx)).toEqual(running); });
    expect(snapshotAt(log, 0, ctx)).toEqual(base);
  });

  it("still does once old events have fallen off the front", () => {
    const { ctx, base, log, all } = setup(500);
    expect(log.events.length).toBe(500);
    expect(log.dropped).toBe(all.length - 500);
    const running = cloneSnapshot(base);
    all.forEach((e, k) => { applyEvent(running, e, ctx); if (k === log.dropped - 1) expect(log.base).toEqual(running); });
    expect(snapshotAt(log, 500, ctx)).toEqual(running);
  });

  it("agrees with the live world: what people are doing, and their need bars derived from the record alone", () => {
    const { world, ctx, log } = setup(1e9, 2), now = snapshotAt(log, log.events.length, ctx);
    world.agents.forEach((a, i) => {
      const snap = now.agents[i], derived = needsAt(snap, ctx.infos[i], now.duty, world.t, PARAMS);
      expect(snap.state).toBe(a.state);
      expect(snap.action).toBe(a.action);
      expect(snap.place).toBe(a.place);
      derived.forEach((v, n) => expect(v).toBeCloseTo(a.needs[n], 6));
    });
  });
});
