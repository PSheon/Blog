"use client";

import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { useLabels } from "./labels";
import { followInk, tone } from "./stage3d";
import { type Cloud, type Pose3, ROOM, apply, compose3, fromEuler, icp3, inverse3, rotationAngle, sweep } from "./lidar3d/icp3";
import { useVisible } from "./use-visible";

const KEEP = 14; // sweeps kept in the drawn map
type Three = typeof import("@/lib/three");

/** The sensor's true motion for sweep k: mostly forward, a slow sway, and a quarter turn now and then — a lap of the room. */
const motion = (k: number): Pose3 => {
  const turning = k % 28 > 22;
  return fromEuler(0.012 * Math.sin(k * 0.9), 0.016 * Math.cos(k * 0.6), turning ? 0.262 : 0, [turning ? 0.06 : 0.32, 0, 0]);
};

/** Fig. 06: the same idea with a 3-D lidar — match each sweep to the one before, six unknowns instead of three. */
export function CloudLab() {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [playing, setPlaying] = useState(false);
  const [seen, setSeen] = useState({ sweeps: 0, drift: 0, turn: 0, ms: 0 });
  const three = useRef<Three | null>(null);

  const load = async () => { setStatus("loading"); three.current = await import("@/lib/three"); setStatus("ready"); setPlaying(true); };

  useEffect(() => {
    const T = three.current, canvas = stage.current;
    if (status !== "ready" || !T || !canvas) return;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(42, 2, 0.1, 100);
    camera.up.set(0, 0, 1);
    const ink = new T.Color(getComputedStyle(canvas).color);
    const old = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({ color: ink, size: 0.045, transparent: true, opacity: 0.5 }));
    const now = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({ color: tone(0x79dafa), size: 0.07 }));
    const estLine = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: tone(0x79dafa) })), truthLine = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: tone(0xff6e96) }));
    scene.add(old, now, estLine, truthLine);
    const unfollow = followInk(T, canvas, () => [scene], ink);

    const rng = mulberry32(3), start = fromEuler(0, 0, 0, [2, 1.6, 0.6]);
    let truth = start, est = start, prev: Cloud = sweep(ROOM, truth, rng), k = 0, ms = 0, since = 0, frame = 0, last = performance.now();
    const kept: Float32Array[] = [], estPath: number[] = [...start.t], truthPath: number[] = [...start.t];
    const world = (cloud: Cloud, pose: Pose3) => {
      const out: number[] = [];
      for (let i = 0; i < cloud.points.length; i += 6) { if (Number.isNaN(cloud.points[i])) continue; out.push(...apply(pose, cloud.points[i], cloud.points[i + 1], cloud.points[i + 2])); }
      return Float32Array.from(out);
    };
    const set = (obj: { geometry: import("three").BufferGeometry }, data: Float32Array | number[]) => obj.geometry.setAttribute("position", new T.BufferAttribute(data instanceof Float32Array ? data : Float32Array.from(data), 3));

    const tick = () => {
      const step = motion(k++);
      truth = compose3(truth, step);
      const cur = sweep(ROOM, truth, rng), m = icp3(prev, cur, fromEuler(0, 0, 0, [step.t[0] > 0.1 ? 0.25 : 0, 0, 0]), { stride: 3 });
      kept.push(world(prev, est)); if (kept.length > KEEP) kept.shift();
      est = compose3(est, m.pose); prev = cur; ms += (m.ms - ms) * 0.2;
      estPath.push(...est.t); truthPath.push(...truth.t);
      const total = kept.reduce((n, a) => n + a.length, 0), all = new Float32Array(total);
      let at = 0; for (const a of kept) { all.set(a, at); at += a.length; }
      set(old, all); set(now, world(cur, est)); set(estLine, estPath); set(truthLine, truthPath);
      const d = compose3(inverse3(truth), est);
      setSeen({ sweeps: k, drift: Math.hypot(...d.t), turn: (rotationAngle(d) * 180) / Math.PI, ms });
    };
    const loop = (t0: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible.current) { last = t0; return; }
      if (playing && (since += t0 - last) > 160 && k < 400) { since = 0; tick(); }
      last = t0;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      camera.position.set(est.t[0] - 7, est.t[1] - 9, 9);
      camera.lookAt(est.t[0], est.t[1], 0.5);
      renderer.render(scene, camera);
    };
    if (k === 0) tick();
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); unfollow(); renderer.dispose(); };
  }, [status, playing, visible]);

  return (
    <div ref={root} className="grid gap-4 text-sm">
      {status !== "ready" ? (
        <div className="grid aspect-[2/1] place-items-center rounded-md border border-border">
          <Button onClick={() => void load()} disabled={status === "loading"}>{t.cloudLoad}</Button>
        </div>
      ) : (
        <canvas role="img" aria-label={t.picCloud} ref={stage} className="aspect-[2/1] w-full rounded-md border border-border text-foreground" />
      )}
      <p className="text-muted-foreground">{t.cloudLegend}</p>
      <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <Button size="sm" disabled={status !== "ready"} onClick={() => setPlaying((p) => !p)}>{playing ? t.cloudPause : t.cloudPlay}</Button>
        <Readout label={t.cloudDrift} value={seen.drift.toFixed(2)} unit={`${t.metres} · ${seen.turn.toFixed(1)}${t.degrees}`} large />
        <Readout label={t.cloudPer} value={seen.ms.toFixed(0)} unit={t.ms} tone="plain" />
        <Readout label={t.cloudSweeps} value={seen.sweeps} tone="plain" />
      </div>
    </div>
  );
}
