import { mulberry32, type Rng } from "@/lib/ml";
import { PARAMS } from "./params";
import type { Block, Building, BuildingKind, City, Nav, Place, PlaceKind, Prop, Rect, Road, Vec2, Zone } from "./types";

export const MIN_N = 4, MAX_N = 16;

const PLACE_OF: Record<BuildingKind, PlaceKind> = { house: "home", office: "office", shop: "food" };
const BUILDING_OF: Partial<Record<Zone, BuildingKind>> = { residential: "house", commercial: "office", food: "shop" };

/** "B3": column letter, row number. */
export const blockLabel = (i: number, j: number): string => `${String.fromCharCode(65 + i)}${j + 1}`;

/**
 * A city on an n × n grid of blocks, fully determined by `seed` and `n`.
 * Every block is ringed by a pavement; pavements of neighbouring blocks are joined by zebra crossings at the corners.
 * The river runs along the east edge, so the pavement graph never needs a bridge.
 */
export function generateCity(seed: number, n: number): City {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) throw new RangeError(`n must be an integer in ${MIN_N}–${MAX_N}`);
  const rng = mulberry32(seed), { blockSize: B, pavementWidth: P } = PARAMS;

  // Road k runs before block k; road n closes the grid. Both axes share the layout.
  const roadWidth = Array.from({ length: n + 1 }, (_, k) => (k % PARAMS.arterialEvery === 0 ? PARAMS.arterialWidth : PARAMS.laneWidth));
  const roadStart: number[] = [], blockStart: number[] = [];
  let at = 0;
  for (let k = 0; k <= n; k++) { roadStart.push(at); at += roadWidth[k]; if (k < n) { blockStart.push(at); at += B; } }
  const size = at;

  const roads: Road[] = [];
  for (let k = 0; k <= n; k++) {
    const c = roadStart[k] + roadWidth[k] / 2, arterial = roadWidth[k] === PARAMS.arterialWidth;
    roads.push({ rect: { x: c, y: size / 2, w: roadWidth[k], d: size }, arterial, vertical: true });
    roads.push({ rect: { x: size / 2, y: c, w: size, d: roadWidth[k] }, arterial, vertical: false });
  }

  const zones = assignZones(n, rng);
  const blocks: Block[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    blocks.push({ i, j, label: blockLabel(i, j), zone: zones[j * n + i], rect: { x: blockStart[i] + B / 2, y: blockStart[j] + B / 2, w: B, d: B } });
  }

  const nodes: Vec2[] = [], edges: number[][] = [];
  const node = (x: number, y: number) => { nodes.push([x, y]); edges.push([]); return nodes.length - 1; };
  const link = (a: number, b: number) => { edges[a].push(b); edges[b].push(a); };

  const buildings: Building[] = [], places: Place[] = [], props: Prop[] = [], corners: number[][] = [];
  const centre = size / 2, reach = Math.hypot(centre, centre);

  blocks.forEach((block, index) => {
    const { x: cx, y: cy } = block.rect, x0 = cx - B / 2, y0 = cy - B / 2, x1 = x0 + B, y1 = y0 + B, h = P / 2;
    const sw = node(x0 + h, y0 + h), se = node(x1 - h, y0 + h), ne = node(x1 - h, y1 - h), nw = node(x0 + h, y1 - h);
    corners.push([sw, se, ne, nw]);
    // Doors on each side of the ring, to be chained between its two corners in order.
    const sides: Record<"s" | "e" | "n" | "w", { at: number; id: number }[]> = { s: [], e: [], n: [], w: [] };
    const door = (side: "s" | "e" | "n" | "w", along: number): number => {
      const id = side === "s" ? node(along, y0 + h) : side === "n" ? node(along, y1 - h) : side === "w" ? node(x0 + h, along) : node(x1 - h, along);
      sides[side].push({ at: along, id });
      return id;
    };
    const place = (kind: PlaceKind, nodeId: number, c: Vec2, spread: Vec2): number =>
      places.push({ id: places.length, kind, zone: block.zone, block: index, node: nodeId, centre: c, spread }) - 1;

    const kind = BUILDING_OF[block.zone], inner = B - 2 * P - 2, closeness = 1 - Math.min(1, Math.hypot(cx - centre, cy - centre) / reach);
    if (kind) {
      const k = kind === "office" ? (rng() < 0.5 ? 1 : 2) : 3, gap = 2, lot = (inner - gap * (k - 1)) / k;
      for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
        if (k === 3 && a === 1 && b === 1) continue; // the courtyard: no street frontage
        const bx = x0 + P + 1 + a * (lot + gap) + lot / 2, by = y0 + P + 1 + b * (lot + gap) + lot / 2, shrink = 1 - rng() * 0.15, noise = 0.5 + rng() * 0.5;
        const side = k === 1 ? "s" : a === 0 ? "w" : a === k - 1 ? "e" : b === 0 ? "s" : "n";
        const vertical = side === "w" || side === "e", id = door(side, vertical ? by : bx), across = h - 0.6, along = lot / 2 - 0.5;
        const height = kind === "shop" ? 3.2 : kind === "office" ? Math.max(8, 110 * noise * closeness ** 2) : Math.max(3, 16 * noise * closeness);
        const p = place(PLACE_OF[kind], id, nodes[id], vertical ? [across, along] : [along, across]);
        buildings.push({ id: buildings.length, kind, block: index, rect: { x: bx, y: by, w: lot * shrink, d: lot * shrink }, height, place: p });
      }
    } else {
      // Parks open to the south, the riverside to the river; people spread out over the whole block.
      const id = block.zone === "riverside" ? door("e", cy) : door("s", cx);
      place(block.zone === "park" ? "park" : "riverside", id, [cx, cy], [inner / 2, inner / 2]);
      for (let t = 0; t < 8; t++) props.push({ kind: t < 5 ? "tree" : "bench", x: cx + (rng() - 0.5) * inner, y: cy + (rng() - 0.5) * inner });
    }

    const chain = (from: number, to: number, doors: { at: number; id: number }[]) => {
      let prev = from;
      for (const d of doors.sort((p, q) => p.at - q.at)) { link(prev, d.id); prev = d.id; }
      link(prev, to);
    };
    chain(sw, se, sides.s); chain(se, ne, sides.e); chain(nw, ne, sides.n); chain(sw, nw, sides.w);

    for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) props.push({ kind: "lamp", x: px + Math.sign(cx - px) * 0.5, y: py + Math.sign(cy - py) * 0.5 });
    props.push({ kind: "bin", x: x0 + 0.5, y: y0 + 4 });
    if (block.zone === "residential") for (let t = 9; t < B - 4; t += 9) props.push({ kind: "tree", x: x0 + t, y: y0 + 0.4 }, { kind: "tree", x: x0 + t, y: y1 - 0.4 });
  });

  // Zebra crossings join the facing corners of neighbouring blocks, straight across the road between them.
  const crosswalks: Rect[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [, se, ne, nw] = corners[j * n + i];
    if (i + 1 < n) {
      const [sw2, , , nw2] = corners[j * n + i + 1];
      for (const [a, b] of [[se, sw2], [ne, nw2]]) { link(a, b); crosswalks.push({ x: (nodes[a][0] + nodes[b][0]) / 2, y: nodes[a][1], w: roadWidth[i + 1], d: P }); }
    }
    if (j + 1 < n) {
      const [sw2, se2] = corners[(j + 1) * n + i];
      for (const [a, b] of [[nw, sw2], [ne, se2]]) { link(a, b); crosswalks.push({ x: nodes[a][0], y: (nodes[a][1] + nodes[b][1]) / 2, w: P, d: roadWidth[j + 1] }); }
    }
  }

  const nav: Nav = { nodes, edges };
  return { seed, n, size, blocks, roads, crosswalks, river: { x: size + 20, y: size / 2, w: 40, d: size }, buildings, places, props, nav };
}

/**
 * The east column is the riverside. Of the rest, the block nearest the centre is always commercial, the next one the
 * restaurant street, the farthest residential and one in between a park, so every city has all five zones whatever
 * the seed; the others are drawn by distance from the centre.
 */
function assignZones(n: number, rng: Rng): Zone[] {
  const zones = new Array<Zone>(n * n), mid = (n - 2) / 2, midY = (n - 1) / 2;
  const inland: { index: number; d: number }[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (i === n - 1) zones[j * n + i] = "riverside";
    else inland.push({ index: j * n + i, d: Math.hypot(i - mid, j - midY) });
  }
  inland.sort((a, b) => a.d - b.d || a.index - b.index);
  const far = inland[inland.length - 1].d;
  for (const { index, d } of inland) {
    const r = rng(), near = d / far;
    zones[index] = near < 0.38 ? "commercial" : near < 0.62 ? (r < 0.45 ? "food" : r < 0.75 ? "commercial" : "residential") : r < 0.1 ? "park" : "residential";
  }
  zones[inland[0].index] = "commercial";
  zones[inland[1].index] = "food";
  zones[inland[inland.length - 1].index] = "residential";
  zones[inland[2 + Math.floor(rng() * (inland.length - 3))].index] = "park";
  return zones;
}

/** Where person `agent` stands at `place`: a fixed spot near the door, or somewhere in the park. */
export function spotAt(place: Place, agent: number): Vec2 {
  const rng = mulberry32(place.id * 7919 + agent * 104729 + 1);
  return [place.centre[0] + (rng() * 2 - 1) * place.spread[0], place.centre[1] + (rng() * 2 - 1) * place.spread[1]];
}
