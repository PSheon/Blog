import { buildBvh } from "./bvh";

/**
 * A BVH for the things that move, rebuilt every frame. The world's tree is built once with the surface area heuristic
 * and takes a second for a million triangles; this one has a few thousand triangles and a few milliseconds, so it
 * splits each node at the middle of its centroids' longest axis and never looks back. The kernel walks the world's
 * tree, then this one, and keeps the nearer hit.
 *
 * `groups` says where each object's triangles start. The top of the tree then splits OBJECTS, never through one, and
 * only below that are an object's own triangles split: a ray that passes between two cars does not wander into either.
 * (Measured in the playground, 11,275 triangles in 8 objects: see docs/research/light/RESULTS.md.)
 *
 * Both trees live in the same two GPU buffers, this one after the world's: `nodeBase` and `triangleBase` are where it
 * starts, and every index written here is already absolute.
 */
export interface DynamicBvh { nodes: ArrayBuffer; nodeCount: number; triangles: ArrayBuffer; triangleCount: number }

const LEAF = 4, INNER = 0x80000000;

export function buildDynamicBvh(positions: Float32Array, materials: Uint32Array | Uint8Array | number[], count: number, nodeBase: number, triangleBase: number, groups?: number[]): DynamicBvh {
  const order = new Uint32Array(count), mid = new Float32Array(count * 3), lo = new Float32Array(count * 3), hi = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    order[i] = i;
    for (let k = 0; k < 3; k++) { const a = positions[i * 9 + k], b = positions[i * 9 + 3 + k], c = positions[i * 9 + 6 + k], mn = Math.min(a, b, c), mx = Math.max(a, b, c); lo[i * 3 + k] = mn; hi[i * 3 + k] = mx; mid[i * 3 + k] = (mn + mx) / 2; }
  }
  const capacity = Math.max(1, 2 * count) + 2 * (groups?.length ?? 0), nodes = new ArrayBuffer(capacity * 32), nf = new Float32Array(nodes), nu = new Uint32Array(nodes);
  let used = 0;
  const build = (first: number, n: number): number => {
    const id = used++, b = id * 8;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
    for (let i = first; i < first + n; i++) {
      const t = order[i] * 3;
      if (lo[t] < x0) x0 = lo[t]; if (lo[t + 1] < y0) y0 = lo[t + 1]; if (lo[t + 2] < z0) z0 = lo[t + 2];
      if (hi[t] > x1) x1 = hi[t]; if (hi[t + 1] > y1) y1 = hi[t + 1]; if (hi[t + 2] > z1) z1 = hi[t + 2];
      if (mid[t] < cx0) cx0 = mid[t]; if (mid[t + 1] < cy0) cy0 = mid[t + 1]; if (mid[t + 2] < cz0) cz0 = mid[t + 2];
      if (mid[t] > cx1) cx1 = mid[t]; if (mid[t + 1] > cy1) cy1 = mid[t + 1]; if (mid[t + 2] > cz1) cz1 = mid[t + 2];
    }
    nf[b] = x0; nf[b + 1] = y0; nf[b + 2] = z0; nf[b + 4] = x1; nf[b + 5] = y1; nf[b + 6] = z1;
    if (n <= LEAF) { nu[b + 3] = triangleBase + first; nu[b + 7] = n; return id; }
    const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0, axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2, split = axis === 0 ? (cx0 + cx1) / 2 : axis === 1 ? (cy0 + cy1) / 2 : (cz0 + cz1) / 2;
    let i = first, j = first + n - 1;
    while (i <= j) { if (mid[order[i] * 3 + axis] < split) i++; else { const s = order[i]; order[i] = order[j]; order[j] = s; j--; } }
    let left = i - first;
    if (left === 0 || left === n) left = n >> 1; // every centroid in one place: halve the list as it stands
    const l = build(first, left), r = build(first + left, n - left);
    nu[b + 3] = nodeBase + l; nu[b + 7] = (INNER | (nodeBase + r)) >>> 0;
    return id;
  };
  // Over whole objects: split the list of groups at the middle of their centres' longest axis, down to single objects.
  const starts = (groups?.length ? groups : [0]).filter((g) => g < count), centre = new Float32Array(starts.length * 3);
  starts.forEach((first, g) => { const end = starts[g + 1] ?? count; for (let k = 0; k < 3; k++) { let a = Infinity, b = -Infinity; for (let i = first; i < end; i++) { a = Math.min(a, lo[i * 3 + k]); b = Math.max(b, hi[i * 3 + k]); } centre[g * 3 + k] = (a + b) / 2; } });
  const bounds = (id: number, l: number, r: number) => { for (let k = 0; k < 3; k++) { nf[id * 8 + k] = Math.min(nf[l * 8 + k], nf[r * 8 + k]); nf[id * 8 + 4 + k] = Math.max(nf[l * 8 + 4 + k], nf[r * 8 + 4 + k]); } };
  const top = (list: number[]): number => {
    if (list.length === 1) return build(starts[list[0]], (starts[list[0] + 1] ?? count) - starts[list[0]]);
    const id = used++;
    let axis = 0, widest = -1;
    for (let k = 0; k < 3; k++) { let a = Infinity, b = -Infinity; for (const g of list) { a = Math.min(a, centre[g * 3 + k]); b = Math.max(b, centre[g * 3 + k]); } if (b - a > widest) { widest = b - a; axis = k; } }
    const sorted = [...list].sort((a, b) => centre[a * 3 + axis] - centre[b * 3 + axis]), half = sorted.length >> 1, l = top(sorted.slice(0, half)), r = top(sorted.slice(half));
    nu[id * 8 + 3] = nodeBase + l; nu[id * 8 + 7] = (INNER | (nodeBase + r)) >>> 0; bounds(id, l, r);
    return id;
  };
  if (count > 0) top(starts.map((_, g) => g)); else { used = 1; nu[3] = triangleBase; nu[7] = 0; }
  const triangles = new ArrayBuffer(Math.max(1, count) * 48), tf = new Float32Array(triangles), tu = new Uint32Array(triangles);
  for (let i = 0; i < count; i++) { const t = order[i]; for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) tf[i * 12 + v * 4 + k] = positions[t * 9 + v * 3 + k]; tu[i * 12 + 3] = materials[t]; }
  return { nodes: nodes.slice(0, used * 32), nodeCount: used, triangles, triangleCount: count };
}

/**
 * Better than rebuilding: an object that moves rigidly (or bends a little, like a character) keeps the SHAPE of a good
 * tree. So each object gets a surface-area-heuristic tree once, from its rest pose, and every frame only the boxes are
 * recomputed from the moved triangles ("refitting"), leaves first. The top of the frame's tree still splits objects.
 */
export interface Prepared { order: Uint32Array; a: Uint32Array; b: Uint32Array; nodeCount: number; triangleCount: number }

export function prepareObject(rest: Float32Array, count: number): Prepared {
  const tree = buildBvh({ positions: Array.from(rest.subarray(0, count * 9)), material: new Array<number>(count).fill(0), materials: [], camera: { eye: [0, 0, 0], target: [0, 0, 1], fov: 1 } }), nu = new Uint32Array(tree.nodes);
  const a = new Uint32Array(tree.nodeCount), b = new Uint32Array(tree.nodeCount);
  for (let i = 0; i < tree.nodeCount; i++) { a[i] = nu[i * 8 + 3]; b[i] = nu[i * 8 + 7]; }
  return { order: tree.order, a, b, nodeCount: tree.nodeCount, triangleCount: count };
}

/** This frame's tree from prepared objects. `first[k]` is where object k's triangles start in `positions` (world space, the order they were prepared in). */
export function assembleDynamicBvh(objects: { prepared: Prepared; first: number }[], positions: Float32Array, materials: Uint32Array, nodeBase: number, triangleBase: number): DynamicBvh {
  const count = objects.reduce((n, o) => n + o.prepared.triangleCount, 0), nodeTotal = objects.reduce((n, o) => n + o.prepared.nodeCount, 0) + Math.max(0, objects.length - 1);
  const nodes = new ArrayBuffer(Math.max(1, nodeTotal) * 32), nf = new Float32Array(nodes), nu = new Uint32Array(nodes), triangles = new ArrayBuffer(Math.max(1, count) * 48), tf = new Float32Array(triangles), tu = new Uint32Array(triangles);
  if (!objects.length) { nu[3] = triangleBase; nu[7] = 0; return { nodes, nodeCount: 1, triangles, triangleCount: 0 }; }
  let node = Math.max(0, objects.length - 1), tri = 0; // the first slots are the top of the tree, over whole objects
  const roots: number[] = [];
  for (const { prepared: p, first } of objects) {
    const n0 = node, t0 = tri;
    for (let i = 0; i < p.triangleCount; i++) { const src = (first + p.order[i]) * 9, dst = (t0 + i) * 12; for (let v = 0; v < 3; v++) { tf[dst + v * 4] = positions[src + v * 3]; tf[dst + v * 4 + 1] = positions[src + v * 3 + 1]; tf[dst + v * 4 + 2] = positions[src + v * 3 + 2]; } tu[dst + 3] = materials[first + p.order[i]]; }
    for (let i = p.nodeCount - 1; i >= 0; i--) { // children come after their parent, so backwards is leaves first
      const o = (n0 + i) * 8;
      if (p.b[i] & INNER) { const l = (n0 + p.a[i]) * 8, r = (n0 + (p.b[i] & 0x7fffffff)) * 8; for (let k = 0; k < 3; k++) { nf[o + k] = Math.min(nf[l + k], nf[r + k]); nf[o + 4 + k] = Math.max(nf[l + 4 + k], nf[r + 4 + k]); } nu[o + 3] = nodeBase + n0 + p.a[i]; nu[o + 7] = (INNER | (nodeBase + n0 + (p.b[i] & 0x7fffffff))) >>> 0; }
      else { let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity; for (let t = t0 + p.a[i]; t < t0 + p.a[i] + p.b[i]; t++) for (let v = 0; v < 3; v++) { const x = tf[t * 12 + v * 4], y = tf[t * 12 + v * 4 + 1], z = tf[t * 12 + v * 4 + 2]; if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z; } nf[o] = x0; nf[o + 1] = y0; nf[o + 2] = z0; nf[o + 4] = x1; nf[o + 5] = y1; nf[o + 6] = z1; nu[o + 3] = triangleBase + t0 + p.a[i]; nu[o + 7] = p.b[i]; }
    }
    roots.push(n0); node += p.nodeCount; tri += p.triangleCount;
  }
  let used = 0;
  const top = (list: number[]): number => {
    if (list.length === 1) return list[0];
    const id = used++;
    let axis = 0, widest = -1;
    for (let k = 0; k < 3; k++) { let lo = Infinity, hi = -Infinity; for (const r of list) { const c = nf[r * 8 + k] + nf[r * 8 + 4 + k]; lo = Math.min(lo, c); hi = Math.max(hi, c); } if (hi - lo > widest) { widest = hi - lo; axis = k; } }
    const sorted = [...list].sort((p, q) => nf[p * 8 + axis] + nf[p * 8 + 4 + axis] - nf[q * 8 + axis] - nf[q * 8 + 4 + axis]), half = sorted.length >> 1, l = top(sorted.slice(0, half)), r = top(sorted.slice(half));
    for (let k = 0; k < 3; k++) { nf[id * 8 + k] = Math.min(nf[l * 8 + k], nf[r * 8 + k]); nf[id * 8 + 4 + k] = Math.max(nf[l * 8 + 4 + k], nf[r * 8 + 4 + k]); }
    nu[id * 8 + 3] = nodeBase + l; nu[id * 8 + 7] = (INNER | (nodeBase + r)) >>> 0;
    return id;
  };
  top(roots);
  return { nodes, nodeCount: nodeTotal, triangles, triangleCount: count };
}
