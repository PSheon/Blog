/** Shared types of the city simulation. Plain data only: a generated city must survive a deep-equal. */

export type Vec2 = [x: number, y: number];
/** Axis-aligned rectangle: centre and full size. */
export type Rect = { x: number; y: number; w: number; d: number };

export type Zone = "residential" | "commercial" | "food" | "park" | "riverside";
export type BuildingKind = "house" | "office" | "shop";
export type PlaceKind = "home" | "office" | "food" | "park" | "riverside";
export type PropKind = "lamp" | "bench" | "tree" | "bin";

/** The four needs, always in this order. */
export const NEEDS = ["fatigue", "hunger", "social", "duty"] as const;
export type Need = (typeof NEEDS)[number];
export type Needs = [fatigue: number, hunger: number, social: number, duty: number];

/** What a person can be doing; `ACTIONS[i]` is what relieves `NEEDS[i]`. */
export const ACTIONS = ["sleep", "eat", "social", "work"] as const;
export type Action = (typeof ACTIONS)[number];

export type Mode = "random" | "fsm" | "utility";
export type AgentState = "idle" | "traveling" | "acting";

export type Block = { i: number; j: number; label: string; zone: Zone; rect: Rect };
export type Road = { rect: Rect; arterial: boolean; vertical: boolean };
export type Building = { id: number; kind: BuildingKind; block: number; rect: Rect; height: number; place: number };
/** Somewhere a person can go. `node` is its door on the pavement graph; people stand within `spread` of `centre`. */
export type Place = { id: number; kind: PlaceKind; zone: Zone; block: number; node: number; centre: Vec2; spread: Vec2 };
export type Prop = { kind: PropKind; x: number; y: number };

/** Pavement graph: block corners, doors and the two ends of every zebra crossing. */
export type Nav = { nodes: Vec2[]; edges: number[][] };

export type City = {
  seed: number;
  n: number;
  size: number;
  blocks: Block[];
  roads: Road[];
  crosswalks: Rect[];
  river: Rect;
  buildings: Building[];
  places: Place[];
  props: Prop[];
  nav: Nav;
};

export type EventType = "departed" | "arrived" | "started" | "finished" | "idle" | "config";

/** One line of the record. Structured only; the sentence is put together by the view. */
export type SimEvent = {
  /** Simulated minutes since Day 1 00:00. */
  t: number;
  type: EventType;
  /** −1 for `config`. */
  agent: number;
  action: Action | null;
  /** Where it happens; for `departed`, where the person is going. −1 when nowhere in particular. */
  place: number;
  /** For `departed`: where the person left from (−1 if from the pavement). */
  from: number;
  /** The person's four needs at this moment, so a replay can draw the bars without re-simulating. */
  needs: Needs;
  /** For `config`: the settings from here on. */
  mode?: Mode;
  duty?: boolean;
};
