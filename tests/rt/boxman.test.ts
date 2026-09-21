import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDENTITY, createSkinner, parseBoxman } from "@/lib/rt";

const file = readFileSync("public/posts/light-playground/boxman.bin"), man = parseBoxman(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const bounds = (p: Float32Array, n: number) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < n * 9; i++) { lo[i % 3] = Math.min(lo[i % 3], p[i]); hi[i % 3] = Math.max(hi[i % 3], p[i]); } return { lo, hi }; };

describe("boxman", () => {
  it("is a mesh, a skeleton and clips, with no image inside", () => {
    expect(file.toString("latin1").includes("\x89PNG")).toBe(false);
    expect([man.vertices, man.triangles, man.joints.length]).toEqual([256, 186, 14]);
    expect(Object.keys(man.clips)).toContain("run");
    for (let v = 0; v < man.vertices; v++) expect(man.weights[v * 4] + man.weights[v * 4 + 1] + man.weights[v * 4 + 2] + man.weights[v * 4 + 3]).toBeCloseTo(1, 3);
  });

  it("skinned in its bind pose is the mesh itself: the skeleton and the inverse bind matrices agree", () => {
    const skinner = createSkinner(man), out = { positions: new Float32Array(man.triangles * 9), materials: new Uint32Array(man.triangles) };
    skinner.rest();
    expect(skinner.write(IDENTITY, 7, out, 0)).toBe(man.triangles);
    for (let t = 0; t < man.triangles; t++) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) expect(out.positions[t * 9 + k * 3 + c]).toBeCloseTo(man.positions[man.indices[t * 3 + k] * 3 + c], 4);
    expect(out.materials[0]).toBe(7);
  });

  it("stays a person of about a metre in every clip, feet near the ground while it runs", () => {
    const skinner = createSkinner(man), out = { positions: new Float32Array(man.triangles * 9), materials: new Uint32Array(man.triangles) };
    for (const clip of Object.keys(man.clips) as (keyof typeof man.clips)[]) for (const time of [0, 0.13, 0.4]) {
      skinner.pose(clip, time, true); skinner.write(IDENTITY, 0, out, 0);
      const { lo, hi } = bounds(out.positions, man.triangles);
      expect(out.positions.every(Number.isFinite)).toBe(true);
      expect(hi[1] - lo[1]).toBeGreaterThan(0.5); expect(hi[1] - lo[1]).toBeLessThan(1.4);
      expect(Math.max(hi[0] - lo[0], hi[2] - lo[2])).toBeLessThan(1.6);
      if (clip === "run" || clip === "idle") expect(Math.abs(lo[1])).toBeLessThan(0.15);
    }
  });
});
