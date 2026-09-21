import type { Scene } from "./scene";

/**
 * A bounding volume hierarchy built top-down with the binned surface area heuristic: at every node, try 15 planes on
 * each axis, cost each split as (triangles on the left × area of their box) + the same on the right, keep the cheapest,
 * stop when no split beats testing the triangles one by one. 32 bytes a node, laid out for WGSL:
 *
 *   min.xyz  f32 ×3 | a  u32      inner: the left child; leaf: the first triangle
 *   max.xyz  f32 ×3 | b  u32      inner: 0x80000000 | the right child; leaf: how many triangles
 *
 * Triangles are reordered so that a leaf's are contiguous; `order[i]` is the original index of packed triangle i.
 */
export interface Bvh {
  nodes: ArrayBuffer;
  nodeCount: number;
  /** Packed triangles, 48 bytes each: v0.xyz, material u32, v1.xyz, pad, v2.xyz, pad. */
  triangles: ArrayBuffer;
  triangleCount: number;
  order: Uint32Array;
  depth: number;
}

const BUCKETS = 16, LEAF = 4, INNER = 0x80000000;
export const NODE_BYTES = 32, TRIANGLE_BYTES = 48;

export function buildBvh(scene: Scene): Bvh {
  const P = scene.positions, n = scene.material.length;
  const lo = new Float32Array(n * 3), hi = new Float32Array(n * 3), mid = new Float32Array(n * 3), order = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    order[i] = i;
    for (let k = 0; k < 3; k++) {
      const a = P[i * 9 + k], b = P[i * 9 + 3 + k], c = P[i * 9 + 6 + k];
      lo[i * 3 + k] = Math.min(a, b, c); hi[i * 3 + k] = Math.max(a, b, c); mid[i * 3 + k] = (a + b + c) / 3;
    }
  }
  // Nodes as parallel growable arrays; packed at the end.
  const min: number[] = [], max: number[] = [], A: number[] = [], B: number[] = [];
  const area = (x: number, y: number, z: number) => (x < 0 ? 0 : 2 * (x * y + y * z + z * x));
  const bLo = new Float64Array(BUCKETS * 3), bHi = new Float64Array(BUCKETS * 3), bCount = new Uint32Array(BUCKETS), rightArea = new Float64Array(BUCKETS), rightCount = new Uint32Array(BUCKETS);
  let depth = 0;

  const build = (first: number, count: number, level: number): number => {
    depth = Math.max(depth, level);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
    for (let i = first; i < first + count; i++) {
      const t = order[i] * 3;
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], lo[t + k]); mx[k] = Math.max(mx[k], hi[t + k]); cmn[k] = Math.min(cmn[k], mid[t + k]); cmx[k] = Math.max(cmx[k], mid[t + k]); }
    }
    const id = A.length;
    min.push(...mn); max.push(...mx); A.push(first); B.push(count);
    if (count <= LEAF) return id;

    let best = Infinity, axis = -1, split = 0;
    for (let ax = 0; ax < 3; ax++) {
      const extent = cmx[ax] - cmn[ax];
      if (extent < 1e-9) continue;
      bLo.fill(Infinity); bHi.fill(-Infinity); bCount.fill(0);
      for (let i = first; i < first + count; i++) {
        const t = order[i] * 3, b = Math.min(BUCKETS - 1, Math.floor(((mid[t + ax] - cmn[ax]) / extent) * BUCKETS));
        bCount[b]++;
        for (let k = 0; k < 3; k++) { bLo[b * 3 + k] = Math.min(bLo[b * 3 + k], lo[t + k]); bHi[b * 3 + k] = Math.max(bHi[b * 3 + k], hi[t + k]); }
      }
      // Sweep from the right once, then from the left, so each of the 15 planes costs O(1).
      let l0 = Infinity, l1 = Infinity, l2 = Infinity, h0 = -Infinity, h1 = -Infinity, h2 = -Infinity, c = 0;
      for (let b = BUCKETS - 1; b > 0; b--) {
        if (bCount[b]) { l0 = Math.min(l0, bLo[b * 3]); l1 = Math.min(l1, bLo[b * 3 + 1]); l2 = Math.min(l2, bLo[b * 3 + 2]); h0 = Math.max(h0, bHi[b * 3]); h1 = Math.max(h1, bHi[b * 3 + 1]); h2 = Math.max(h2, bHi[b * 3 + 2]); c += bCount[b]; }
        rightArea[b] = area(h0 - l0, h1 - l1, h2 - l2); rightCount[b] = c;
      }
      l0 = l1 = l2 = Infinity; h0 = h1 = h2 = -Infinity; c = 0;
      for (let b = 0; b < BUCKETS - 1; b++) {
        if (bCount[b]) { l0 = Math.min(l0, bLo[b * 3]); l1 = Math.min(l1, bLo[b * 3 + 1]); l2 = Math.min(l2, bLo[b * 3 + 2]); h0 = Math.max(h0, bHi[b * 3]); h1 = Math.max(h1, bHi[b * 3 + 1]); h2 = Math.max(h2, bHi[b * 3 + 2]); c += bCount[b]; }
        if (!c || !rightCount[b + 1]) continue;
        const cost = c * area(h0 - l0, h1 - l1, h2 - l2) + rightCount[b + 1] * rightArea[b + 1];
        if (cost < best) { best = cost; axis = ax; split = b + 1; }
      }
    }
    // No plane beats a leaf. (Such a leaf may hold more than LEAF triangles: a thousand coincident ones cannot be told apart.)
    if (axis < 0 || best >= count * area(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])) return id;

    const extent = cmx[axis] - cmn[axis];
    let i = first, j = first + count - 1;
    while (i <= j) {
      const t = order[i], b = Math.min(BUCKETS - 1, Math.floor(((mid[t * 3 + axis] - cmn[axis]) / extent) * BUCKETS));
      if (b < split) i++; else { order[i] = order[j]; order[j] = t; j--; }
    }
    const left = i - first;
    A[id] = build(first, left, level + 1);
    B[id] = (INNER | build(i, count - left, level + 1)) >>> 0;
    return id;
  };
  build(0, n, 0);

  const nodes = new ArrayBuffer(A.length * NODE_BYTES), nf = new Float32Array(nodes), nu = new Uint32Array(nodes);
  for (let i = 0; i < A.length; i++) { nf.set(min.slice(i * 3, i * 3 + 3), i * 8); nu[i * 8 + 3] = A[i]; nf.set(max.slice(i * 3, i * 3 + 3), i * 8 + 4); nu[i * 8 + 7] = B[i]; }
  const triangles = new ArrayBuffer(n * TRIANGLE_BYTES), tf = new Float32Array(triangles), tu = new Uint32Array(triangles);
  for (let i = 0; i < n; i++) {
    const t = order[i];
    for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) tf[i * 12 + v * 4 + k] = P[t * 9 + v * 3 + k];
    tu[i * 12 + 3] = scene.material[t];
  }
  return { nodes, nodeCount: A.length, triangles, triangleCount: n, order, depth };
}
