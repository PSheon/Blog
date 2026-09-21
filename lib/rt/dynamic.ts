/**
 * A BVH for the things that move, rebuilt every frame. The world's tree is built once with the surface area heuristic
 * and takes a second for a million triangles; this one has a few thousand triangles and a few milliseconds, so it
 * splits each node at the middle of its centroids' longest axis and never looks back. The kernel walks the world's
 * tree, then this one, and keeps the nearer hit.
 *
 * Both trees live in the same two GPU buffers, this one after the world's: `nodeBase` and `triangleBase` are where it
 * starts, and every index written here is already absolute.
 */
export interface DynamicBvh { nodes: ArrayBuffer; nodeCount: number; triangles: ArrayBuffer; triangleCount: number }

const LEAF = 4, INNER = 0x80000000;

export function buildDynamicBvh(positions: Float32Array, materials: Uint32Array | Uint8Array | number[], count: number, nodeBase: number, triangleBase: number): DynamicBvh {
  const order = new Uint32Array(count), mid = new Float32Array(count * 3), lo = new Float32Array(count * 3), hi = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    order[i] = i;
    for (let k = 0; k < 3; k++) { const a = positions[i * 9 + k], b = positions[i * 9 + 3 + k], c = positions[i * 9 + 6 + k], mn = Math.min(a, b, c), mx = Math.max(a, b, c); lo[i * 3 + k] = mn; hi[i * 3 + k] = mx; mid[i * 3 + k] = (mn + mx) / 2; }
  }
  const capacity = Math.max(1, 2 * count), nodes = new ArrayBuffer(capacity * 32), nf = new Float32Array(nodes), nu = new Uint32Array(nodes);
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
  if (count > 0) build(0, count); else { used = 1; nu[3] = triangleBase; nu[7] = 0; }
  const triangles = new ArrayBuffer(Math.max(1, count) * 48), tf = new Float32Array(triangles), tu = new Uint32Array(triangles);
  for (let i = 0; i < count; i++) { const t = order[i]; for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) tf[i * 12 + v * 4 + k] = positions[t * 9 + v * 3 + k]; tu[i * 12 + 3] = materials[t]; }
  return { nodes: nodes.slice(0, used * 32), nodeCount: used, triangles, triangleCount: count };
}
