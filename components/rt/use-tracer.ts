"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import type { StudioOptions } from "@/lib/rt";
import type { Renderer } from "@/lib/rt/gpu";
import type { BuildRequest, BuildResult } from "./scene.worker";

/** "failed": there is a GPU, and starting the renderer on it threw (a driver that rejects the shader, a lost device). */
export type TracerStatus = "building" | "running" | "paused" | "no-webgpu" | "no-adapter" | "failed";
export interface Built { triangles: number; buildMs: number; nodeCount: number; depth: number; playground?: BuildResult["playground"] }

interface Options {
  /** The Cornell box with about this many triangles… */
  triangles?: number;
  /** …or article 2's room with three balls (a change of options rebuilds it)… */
  studio?: StudioOptions;
  /** …or a packed scene to fetch (lib/rt/playground.ts). */
  playground?: string;
  /** Carry the picture across movements (Renderer.advance). */
  temporal?: boolean;
  /** Room for this many triangles that move (Renderer.setDynamic). */
  dynamicTriangles?: number;
  /** Pixels across; the picture is square unless `height` says otherwise. */
  size: number;
  height?: number;
  /** Called once the renderer exists and again after every restart: set bounce limits and modes here. */
  configure(renderer: Renderer): void;
  /**
   * Called after each batch of samples with the renderer idle. Async work here (reading the GPU back) holds the next
   * frame, which is the point: one reader of the GPU at a time.
   */
  afterFrame?(renderer: Renderer, built: Built, batch: { samples: number; gpuMs: number }): void | Promise<void>;
  /** At the start the sample count may only double this often, so a fast GPU does not skip the part worth watching. */
  doublingMs?: number;
  /** GPU milliseconds a frame may spend on samples. */
  budgetMs?: number;
  /** Start at once instead of waiting for the reader to press Start: for a picture that is the backdrop of a figure, not its subject. */
  autostart?: boolean;
  /** Stop adding samples here (a figure that compares pictures wants them equally converged, not ever finer). */
  maxSamples?: number;
}

/**
 * What every figure of this article needs around the renderer: the scene and its BVH built in a worker, a GPU device
 * (or the reason there is none), a frame loop that sizes its batches to a time budget, pauses off screen and in a
 * hidden tab, and waits for the reader to press Start (one sample is drawn at once, so there is something to look at).
 */
export function useTracer(root: RefObject<HTMLElement | null>, canvas: RefObject<HTMLCanvasElement | null>, options: Options) {
  const still = useReducedMotion();
  const [status, setStatus] = useState<TracerStatus>("building"), [built, setBuilt] = useState<Built | null>(null), [epoch, setEpoch] = useState(0);
  const wantRunning = useRef(false), latest = useRef(options), renderer = useRef<Renderer | null>(null), restartRef = useRef<(() => void) | null>(null);
  useEffect(() => { latest.current = options; });
  const autostart = !!options.autostart;
  useEffect(() => { wantRunning.current = autostart && !still; }, [autostart, still]);
  const { triangles, playground, size } = options, height = options.height ?? size, studioKey = options.studio ? JSON.stringify(options.studio) : "";

  useEffect(() => {
    let alive = true, visible = false;
    const io = new IntersectionObserver((entries, _observer, entry = entries[entries.length - 1]) => (visible = entry.isIntersecting), { rootMargin: "200px" });
    if (root.current) io.observe(root.current);
    const worker = new Worker(new URL("./scene.worker.ts", import.meta.url), { type: "module" });
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

    const run = async (result: BuildResult) => {
      if (!canvas.current) return;
      const { Renderer } = await import("@/lib/rt/gpu");
      const scene = { positions: [], material: [], materials: result.materials, camera: result.camera, light: result.light }, bvh = { nodes: result.nodes, nodeCount: result.nodeCount, triangles: result.packed, triangleCount: result.triangles, order: new Uint32Array(0), depth: result.depth, normals: result.normals };
      const made = await Renderer.create(canvas.current, scene, bvh, size, height, latest.current.dynamicTriangles ?? 0, !!latest.current.temporal);
      if (!alive) { if (typeof made !== "string") made.destroy(); return; }
      if (typeof made === "string") { setStatus(made); return; }
      // In development the renderers are reachable from the console (`__lights[<the canvas's test id>]`, `__light` = the last built): measurements for docs/research are taken through it.
      if (process.env.NODE_ENV !== "production") { const w = window as unknown as { __light?: Renderer; __lights?: Record<string, Renderer> }; w.__light = made; (w.__lights ??= {})[canvas.current.dataset.testid ?? ""] = made; }
      const r = (renderer.current = made), info: Built = { triangles: result.triangles, buildMs: result.buildMs, nodeCount: result.nodeCount, depth: result.depth, playground: result.playground };
      let batch = 1, began = performance.now(), last = began;
      // Starting over is something the reader asked for, so it runs: also after a finished picture paused itself.
      restartRef.current = () => { latest.current.configure(r); r.reset(); began = performance.now(); batch = 1; r.sample(1); r.present(); wantRunning.current = true; setStatus("running"); };
      setBuilt(info);
      latest.current.configure(r);
      setStatus(wantRunning.current ? "running" : "paused");
      const first = performance.now();
      r.sample(1); r.present(); // one sample at once, so even a waiting figure shows something
      await r.idle();
      if (alive) await latest.current.afterFrame?.(r, info, { samples: 1, gpuMs: performance.now() - first }); // and its readouts say so

      while (alive) {
        await frame();
        if (!alive) break;
        const o = latest.current, running = wantRunning.current && visible && !document.hidden;
        // Time spent not running does not count towards the pacing. Measured, not assumed: a 120 Hz display has 8 ms frames.
        const now = performance.now(), waited = now - last;
        last = now;
        if (!running) { began += waited; continue; }
        const paced = o.doublingMs ? Math.ceil(2 ** ((performance.now() - began) / o.doublingMs)) - r.samples : Infinity;
        const allowed = Math.min(paced, (o.maxSamples ?? Infinity) - r.samples);
        if (allowed <= 0) { if (paced > 0) { wantRunning.current = false; setStatus("paused"); } continue; } // the picture is finished: Start begins it again
        const t0 = performance.now(), count = Math.min(batch, allowed);
        r.sample(count); r.present();
        await r.idle();
        const gpuMs = performance.now() - t0; // submit to idle: the GPU's time for this batch, with nothing else queued
        if (count === batch) batch = Math.max(1, Math.min(64, Math.round((batch * (o.budgetMs ?? 10)) / Math.max(gpuMs, 0.5))));
        await o.afterFrame?.(r, info, { samples: count, gpuMs });
      }
    };

    // Never leave the figure saying "building" for ever: whatever goes wrong becomes a state the reader is told about.
    // (A figure torn down mid-readback loses its device under a pending map: that is the teardown, not a failure.)
    const failed = (error: unknown) => { if (!alive) return; console.error("[light] the renderer could not start", error); if (alive) setStatus("failed"); };
    worker.onmessage = (event: MessageEvent<BuildResult>) => { if (event.data.error) failed(event.data.error); else void run(event.data).catch(failed); };
    worker.onerror = failed;
    worker.postMessage((studioKey ? { scene: "studio", options: JSON.parse(studioKey) as StudioOptions } : playground ? { scene: "playground", url: new URL(playground, location.href).href } : { scene: "cornell", triangles: triangles ?? 1_000 }) satisfies BuildRequest);
    return () => { alive = false; io.disconnect(); worker.terminate(); renderer.current?.destroy(); renderer.current = null; restartRef.current = null; };
  }, [triangles, playground, studioKey, size, height, epoch, root, canvas]);

  const toggle = useCallback(() => {
    wantRunning.current = !wantRunning.current;
    const r = renderer.current;
    if (wantRunning.current && r && r.samples >= (latest.current.maxSamples ?? Infinity)) restartRef.current?.(); 
    setStatus((s) => (s === "running" || s === "paused" ? (wantRunning.current ? "running" : "paused") : s));
  }, []);
  /** Carry on after the picture finished or was paused: for a figure whose picture the reader just invalidated (a moved camera). */
  const resume = useCallback(() => { if (wantRunning.current) return; wantRunning.current = true; setStatus((s) => (s === "paused" ? "running" : s)); }, []);
  /** Start the picture over with the current settings. */
  const restart = useCallback(() => restartRef.current?.(), []);
  /** A different scene (or another try at getting a GPU): back to "building", and the effect above does the rest. */
  const rebuild = useCallback(() => { wantRunning.current = true; /* the reader pressed something: the new scene runs */ setStatus("building"); setBuilt(null); setEpoch((e) => e + 1); }, []);
  return { status, built, renderer, toggle, resume, restart, rebuild, live: status === "running" || status === "paused", unavailable: status === "no-webgpu" || status === "no-adapter" || status === "failed" };
}
