import { buildBvh, cornell } from "@/lib/rt";

/** Builds the scene and its BVH off the main thread: a million triangles take over a second, and no page may freeze for that. */
export interface BuildRequest { triangles: number }
export interface BuildResult { triangles: number; nodeCount: number; depth: number; buildMs: number; nodes: ArrayBuffer; packed: ArrayBuffer; materials: { albedo: [number, number, number]; emit: [number, number, number] }[]; camera: { eye: [number, number, number]; target: [number, number, number]; fov: number } }

self.onmessage = (event: MessageEvent<BuildRequest>) => {
  const scene = cornell(event.data.triangles), started = performance.now(), bvh = buildBvh(scene), buildMs = performance.now() - started;
  const result: BuildResult = { triangles: bvh.triangleCount, nodeCount: bvh.nodeCount, depth: bvh.depth, buildMs, nodes: bvh.nodes, packed: bvh.triangles, materials: scene.materials, camera: scene.camera };
  (self as unknown as Worker).postMessage(result, [bvh.nodes, bvh.triangles]);
};
