import { buildBvh, cornell, parsePlayground, type Material, type Scene } from "@/lib/rt";

/** Builds a scene and its BVH off the main thread: a million triangles take over a second, and no page may freeze for that. */
export type BuildRequest = { scene: "cornell"; triangles: number } | { scene: "playground"; url: string };
export interface BuildResult { triangles: number; nodeCount: number; depth: number; buildMs: number; nodes: ArrayBuffer; packed: ArrayBuffer; materials: Material[]; camera: Scene["camera"]; error?: string }

self.onmessage = async (event: MessageEvent<BuildRequest>) => {
  const request = event.data;
  try {
    const scene = request.scene === "cornell" ? cornell(request.triangles) : parsePlayground(await (await fetch(request.url)).arrayBuffer());
    const started = performance.now(), bvh = buildBvh(scene), buildMs = performance.now() - started;
    const result: BuildResult = { triangles: bvh.triangleCount, nodeCount: bvh.nodeCount, depth: bvh.depth, buildMs, nodes: bvh.nodes, packed: bvh.triangles, materials: scene.materials, camera: scene.camera };
    (self as unknown as Worker).postMessage(result, [bvh.nodes, bvh.triangles]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ error: String(error) });
  }
};
