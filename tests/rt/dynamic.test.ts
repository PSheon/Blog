import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDENTITY, buildDynamicBvh, compose, fromPose, parseModels, rotationY, writeModel } from "@/lib/rt";

const file = readFileSync("public/posts/light-playground/models.bin"), models = parseModels(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

/** Walks a packed tree on the CPU exactly as the kernel does, from `root`, with absolute indices. */
function hit(nodes: ArrayBuffer, triangles: ArrayBuffer, nodeBase: number, triangleBase: number, o: number[], d: number[]): number {
  const nf = new Float32Array(nodes), nu = new Uint32Array(nodes), tf = new Float32Array(triangles), stack = [nodeBase];
  let best = Infinity;
  while (stack.length) {
    const n = (stack.pop()! - nodeBase) * 8;
    let near = 0, far = best;
    for (let k = 0; k < 3; k++) { const t0 = (nf[n + k] - o[k]) / d[k], t1 = (nf[n + 4 + k] - o[k]) / d[k]; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); }
    if (near > far) continue;
    if (nu[n + 7] & 0x80000000) { stack.push(nu[n + 3], (nu[n + 7] & 0x7fffffff) >>> 0); continue; }
    for (let i = nu[n + 3] - triangleBase; i < nu[n + 3] - triangleBase + nu[n + 7]; i++) best = Math.min(best, moller(tf, i, o, d));
  }
  return best;
}
function moller(f: Float32Array, i: number, o: number[], d: number[]): number {
  const b = i * 12, e1 = [f[b + 4] - f[b], f[b + 5] - f[b + 1], f[b + 6] - f[b + 2]], e2 = [f[b + 8] - f[b], f[b + 9] - f[b + 1], f[b + 10] - f[b + 2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return Infinity;
  const s = [o[0] - f[b], o[1] - f[b + 1], o[2] - f[b + 2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
  if (u < 0 || u > 1) return Infinity;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
  return t > 1e-6 ? t : Infinity;
}

describe("the vehicles", () => {
  it("are geometry only, and small", () => {
    const text = file.toString("latin1");
    for (const magic of ["\x89PNG", "\xff\xd8\xff", "JFIF"]) expect(text.includes(magic), magic).toBe(false);
    expect(file.byteLength).toBeLessThan(200_000);
    expect(Object.keys(models.models).sort()).toEqual(["airplane", "car", "heli"]);
    expect(models.models.car.parts.filter((p) => p.role === "wheel").length).toBe(4);
    expect(models.models.heli.parts.filter((p) => p.role === "rotor").length).toBe(2);
  });

  it("are written where their pose puts them, and the tree built over them agrees with testing every triangle", () => {
    const total = models.kinds.length, out = { positions: new Float32Array(total * 9), materials: new Uint32Array(total) };
    let cursor = 0;
    cursor = writeModel(models, "car", 20, compose(fromPose({ x: 10, y: 2, z: -5 }, { x: 0, y: 0, z: 0, w: 1 }), rotationY(0.7)), () => null, out, cursor);
    cursor = writeModel(models, "heli", 23, fromPose({ x: -8, y: 6, z: 3 }, { x: 0, y: 0.383, z: 0, w: 0.924 }), (part) => (part.role === "rotor" ? rotationY(1.1) : null), out, cursor);
    expect(cursor).toBeGreaterThan(1500);
    const nodeBase = 1000, triangleBase = 5000, bvh = buildDynamicBvh(out.positions, out.materials, cursor, nodeBase, triangleBase);
    expect(bvh.nodeCount).toBeLessThanOrEqual(2 * cursor);
    const all = { ...bvh }, flat = new Float32Array(bvh.triangles);
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      const o = [40 * Math.cos(i), 12 + (i % 7), 40 * Math.sin(i)], target = i % 2 ? [10, 2.5, -5] : [-8, 6.5, 3], d = target.map((v, k) => v - o[k] + ((i * 7919) % 13) * 0.05), l = Math.hypot(...d), dir = d.map((v) => v / l);
      let brute = Infinity;
      for (let t = 0; t < cursor; t++) brute = Math.min(brute, moller(flat, t, o, dir));
      expect(hit(all.nodes, all.triangles, nodeBase, triangleBase, o, dir)).toBe(brute);
      if (brute < Infinity) hits++;
    }
    expect(hits).toBeGreaterThan(100);
    expect(new Uint32Array(bvh.triangles)[3]).toBeGreaterThanOrEqual(20);
  });

  it("builds a few thousand triangles in a few milliseconds", () => {
    const total = models.kinds.length, out = { positions: new Float32Array(total * 9), materials: new Uint32Array(total) };
    let cursor = 0;
    for (const name of ["car", "heli", "airplane"] as const) cursor = writeModel(models, name, 0, IDENTITY, () => null, out, cursor);
    for (let warm = 0; warm < 5; warm++) buildDynamicBvh(out.positions, out.materials, cursor, 0, 0);
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) buildDynamicBvh(out.positions, out.materials, cursor, 0, 0);
    expect((performance.now() - t0) / 20).toBeLessThan(8);
  });
});
