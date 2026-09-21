import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Tracer, buildBvh, parsePlayground, parsePlaygroundMesh, sunAt } from "@/lib/rt";

const file = readFileSync("public/posts/light-playground/playground.bin"), buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

describe("the playground asset", () => {
  it("is geometry and names only: no image of the original's (they may not be redistributed) is inside", () => {
    const text = file.toString("latin1");
    for (const magic of ["\x89PNG", "\xff\xd8\xff", "JFIF", "TexturesCom", "KTX ", "RIFF"]) expect(text.includes(magic), magic).toBe(false);
    expect(file.byteLength).toBeLessThan(400_000);
  });

  it("parses into a scene every triangle of which has finite corners and a coloured material", () => {
    const scene = parsePlayground(buffer);
    // long triangles are cut up for the BVH's sake: more triangles than the file has, the same surface
    expect(scene.material.length).toBeGreaterThan(24_545); expect(scene.material.length).toBeLessThan(120_000);
    expect(scene.positions.length).toBe(scene.material.length * 9);
    const area = (P: ArrayLike<number>, n: number) => { let sum = 0; for (let t = 0; t < n; t++) { const e1 = [P[t * 9 + 3] - P[t * 9], P[t * 9 + 4] - P[t * 9 + 1], P[t * 9 + 5] - P[t * 9 + 2]], e2 = [P[t * 9 + 6] - P[t * 9], P[t * 9 + 7] - P[t * 9 + 1], P[t * 9 + 8] - P[t * 9 + 2]]; sum += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2; } return sum; };
    const mesh = parsePlaygroundMesh(buffer), soup = new Float32Array(mesh.indices.length * 3); mesh.indices.forEach((v, i) => soup.set(mesh.vertices.subarray(v * 3, v * 3 + 3), i * 3));
    expect(area(scene.positions, scene.material.length) / area(soup, mesh.indices.length / 3)).toBeCloseTo(1, 4);
    expect(scene.positions.every(Number.isFinite)).toBe(true);
    expect(scene.material.reduce((m, v) => Math.max(m, v), 0)).toBeLessThan(scene.materials.length);
    expect(scene.materials.filter((m) => m.mirror).length).toBe(1); // the sea
    expect(scene.spawns.length).toBeGreaterThan(0);
  });

  it("has a BVH that agrees with testing every triangle", () => {
    const scene = parsePlayground(buffer), tracer = new Tracer(scene, buildBvh(scene));
    for (let i = 0; i < 40; i++) {
      const { o, d } = tracer.cameraRay((i * 37) % 64, (i * 11) % 36, 64, 36, 0.5, 0.5), fast = tracer.hit(o, d), slow = tracer.brute(o, d);
      expect(fast.t).toBeCloseTo(slow.t, 3);
    }
  });

  it("puts the sun above the horizon all day, as a unit vector", () => {
    for (const hour of [6.5, 9, 12, 16, 17.5]) { const { sun } = sunAt(hour); expect(Math.hypot(sun[0], sun[1], sun[2])).toBeCloseTo(1, 6); expect(sun[1]).toBeGreaterThan(0); expect(sun[3]).toBeGreaterThan(0); }
  });
});
