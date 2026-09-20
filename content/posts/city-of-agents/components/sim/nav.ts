import type { Nav, Vec2 } from "./types";

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

type Scratch = { g: Float64Array; f: Float64Array; came: Int32Array; closed: Uint8Array };
const scratch = new WeakMap<Nav, Scratch>();

/** A* over the pavement graph. Returns node ids from `from` to `to` inclusive, or null if there is no way. */
export function findPath(nav: Nav, from: number, to: number): number[] | null {
  if (from === to) return [from];
  const { nodes, edges } = nav, size = nodes.length;
  let s = scratch.get(nav);
  if (!s || s.g.length !== size) scratch.set(nav, (s = { g: new Float64Array(size), f: new Float64Array(size), came: new Int32Array(size), closed: new Uint8Array(size) }));
  const { g, f, came, closed } = s, heap: number[] = [];
  g.fill(Infinity); came.fill(-1); closed.fill(0);
  const push = (id: number) => {
    let i = heap.push(id) - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = (): number => {
    const top = heap[0], last = heap.pop() as number;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  g[from] = 0; f[from] = dist(nodes[from], nodes[to]); push(from);
  while (heap.length) {
    const current = pop();
    if (current === to) {
      const path = [to];
      for (let at = to; came[at] >= 0; at = came[at]) path.push(came[at]);
      return path.reverse();
    }
    if (closed[current]) continue;
    closed[current] = 1;
    for (const next of edges[current]) {
      const cost = g[current] + dist(nodes[current], nodes[next]);
      if (cost < g[next]) { g[next] = cost; came[next] = current; f[next] = cost + dist(nodes[next], nodes[to]); push(next); }
    }
  }
  return null;
}

export function pathLength(nav: Nav, path: number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(nav.nodes[path[i - 1]], nav.nodes[path[i]]);
  return total;
}

export type Route = { path: number[]; length: number };

/** Routes between doors are asked for again and again; keep the most recently used ones. */
export class PathCache {
  private readonly routes = new Map<number, Route>();
  hits = 0;
  misses = 0;

  constructor(private readonly nav: Nav, private readonly capacity = 4096) {}

  route(from: number, to: number): Route {
    const key = from * this.nav.nodes.length + to, cached = this.routes.get(key);
    if (cached) { this.hits++; this.routes.delete(key); this.routes.set(key, cached); return cached; }
    this.misses++;
    const path = findPath(this.nav, from, to);
    if (!path) throw new Error(`no pavement route from node ${from} to node ${to}`);
    const route = { path, length: pathLength(this.nav, path) };
    this.routes.set(key, route);
    if (this.routes.size > this.capacity) this.routes.delete(this.routes.keys().next().value as number);
    return route;
  }
}
