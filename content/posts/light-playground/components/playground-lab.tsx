"use client";

import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Stick } from "@/components/lab/stick";
import { Stage } from "@/components/rt/stage";
import { useTracer } from "@/components/rt/use-tracer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { MODELS_URL, PLAYGROUND_CREDIT, PLAYGROUND_URL, buildDynamicBvh, parseModels, sunAt, writeModel, type Mat34, type ModelName, type Models, type Vec3 } from "@/lib/rt";
import type { Renderer } from "@/lib/rt/gpu";
import { useLabels } from "./labels";

const W = 960, H = 540, SPEED = 18, EXPOSURE = 0.18, MAX_SAMPLES = 1024;
const MODES = ["raster", "direct", "full"] as const;
type Mode = (typeof MODES)[number];
/** Where to stand: position, yaw (about y, 0 = looking down −z) and pitch, radians. */
const VIEWS = { cars: { at: [-33, 18.4, -12], yaw: -2.266, pitch: -0.25 }, air: { at: [150, 105, 165], yaw: -0.684, pitch: -0.41 }, low: { at: [60, 30, 70], yaw: -0.675, pitch: -0.167 }, ground: { at: [9, 17.2, 9], yaw: -0.699, pitch: -0.082 } } as const;
const KEYS: Record<string, [number, number, number]> = { w: [0, 0, 1], s: [0, 0, -1], a: [-1, 0, 0], d: [1, 0, 0], q: [0, -1, 0], e: [0, 1, 0], arrowup: [0, 0, 1], arrowdown: [0, 0, -1], arrowleft: [-1, 0, 0], arrowright: [1, 0, 0] };

/**
 * The playground, flown through while it is being path traced. Nothing here is clever yet: every movement resets the
 * accumulation, so a moving camera sees one or two samples a frame. That is the problem the last article is about.
 */
export function PlaygroundLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("full"), [hour, setHour] = useState(16), [view, setView] = useState<keyof typeof VIEWS>("low"), [seen, setSeen] = useState<{ spp: number; ms: number } | null>(null);
  const pose = useRef({ at: [...VIEWS.low.at] as Vec3, yaw: VIEWS.low.yaw as number, pitch: VIEWS.low.pitch as number }), settings = useRef({ mode, hour }), dirty = useRef(true);
  const mine = useRef<Renderer | null>(null), pressed = useRef(new Set<string>()), drag = useRef<{ x: number; y: number } | null>(null), stick = useRef<[number, number]>([0, 0]), timing = useRef({ ms: 0 });

  const tracer = useTracer(root, canvas, {
    playground: PLAYGROUND_URL, dynamicTriangles: 8192, size: W, height: H, autostart: true, maxSamples: MAX_SAMPLES, budgetMs: 8,
    configure: (r) => { mine.current = r; dirty.current = true; },
    afterFrame: (r, _built, batch) => { timing.current.ms = timing.current.ms ? timing.current.ms * 0.9 + (batch.gpuMs / batch.samples) * 0.1 : batch.gpuMs / batch.samples; setSeen({ spp: r.samples, ms: timing.current.ms }); },
  });
  const { resume, built } = tracer;

  // The vehicles, parked where Sketchbook parks them. They do not move yet; the tree they are in is the per-frame one.
  const [models, setModels] = useState<Models | null>(null);
  useEffect(() => { let alive = true; void fetch(MODELS_URL).then((r) => r.arrayBuffer()).then((b) => { if (alive) setModels(parseModels(b)); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    const r = mine.current, park = built?.playground;
    if (!r || !models || !park) return;
    const out = { positions: new Float32Array(models.kinds.length * 9 * 2), materials: new Uint32Array(models.kinds.length * 2) };
    let cursor = 0;
    for (const name of ["car", "heli", "airplane"] as ModelName[]) for (const spawn of park.spawns.filter((s) => s.type === name && s.at[1] < 100).slice(0, name === "car" ? 2 : 1)) {
      const pose: Mat34 = [...spawn.basis, ...spawn.at];
      cursor = writeModel(models, name, park.vehicleMaterials[name], pose, () => null, out, cursor);
    }
    r.setDynamic(buildDynamicBvh(out.positions, out.materials, cursor, r.nodeBase, r.triangleBase));
    dirty.current = true;
  }, [models, built]);

  /** Hand the pose and the settings to the renderer and throw away what it has: the picture is of something else now. */
  const apply = useCallback(() => {
    const r = mine.current;
    if (!r) return;
    const { at, yaw, pitch } = pose.current, s = settings.current, light = sunAt(s.hour);
    const forward: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    r.setCamera({ eye: at, target: [at[0] + forward[0], at[1] + forward[1], at[2] + forward[2]], fov: 55 });
    r.sun = light.sun; r.skyLevel = light.skyLevel; r.exposure = EXPOSURE; r.raster = s.mode === "raster"; r.bounces = s.mode === "full" ? 8 : 1;
    r.reset(); r.sample(1); r.present();
    resume();
  }, [resume]);

  // Movement runs on its own clock, by elapsed time: a 120 Hz display must not fly twice as fast.
  useEffect(() => {
    let alive = true, last = performance.now();
    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const move: Vec3 = [0, 0, 0];
      move[0] += stick.current[0]; move[2] += stick.current[1];
      for (const key of pressed.current) { const k = KEYS[key]; if (k) { move[0] += k[0]; move[1] += k[1]; move[2] += k[2]; } }
      if (move[0] || move[1] || move[2]) {
        const p = pose.current, step = SPEED * (pressed.current.has("shift") ? 3 : 1) * dt, sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
        p.at = [p.at[0] + (sin * move[2] + cos * move[0]) * step, Math.max(1, p.at[1] + (move[1] + Math.sin(p.pitch) * move[2]) * step), p.at[2] + (-cos * move[2] + sin * move[0]) * step];
        dirty.current = true;
      }
      if (dirty.current && mine.current) { dirty.current = false; apply(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
  }, [apply]);

  const change = (next: Partial<{ mode: Mode; hour: number }>) => { settings.current = { ...settings.current, ...next }; dirty.current = true; };
  const press = (k: string, down: boolean) => { if (down) pressed.current.add(k); else pressed.current.delete(k); };
  const key = (event: KeyboardEvent, down: boolean) => {
    const k = event.key.toLowerCase();
    if (!(k in KEYS) && k !== "shift") return;
    if (k !== "shift") event.preventDefault(); // the arrows would scroll the page
    press(k, down);
  };
  // On a phone a vertical swipe still scrolls the page (touch-pan-y): the browser cancels the pointer and the drag ends.
  const look = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const p = pose.current, scale = 0.005;
    p.yaw += (event.clientX - drag.current.x) * scale; p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch - (event.clientY - drag.current.y) * scale));
    drag.current = { x: event.clientX, y: event.clientY }; dirty.current = true;
  };

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div tabIndex={0} role="application" aria-label={t.picture} className="relative touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" onKeyDown={(e) => key(e, true)} onKeyUp={(e) => key(e, false)} onBlur={() => pressed.current.clear()}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus({ preventScroll: true }); }} onPointerMove={look} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} data-testid="playground-stage">
        <Stage canvas={canvas} status={tracer.status} label={t.picture} t={t} testid="playground-canvas" wide>
          {/* The site's thumb stick (components/lab/stick.tsx), laid over the corner: forward / back and sideways. */}
          <div className="absolute bottom-2 left-2 opacity-80" onPointerDown={(e) => e.stopPropagation()}>
            <Stick label={t.stick} onChange={(x, y) => { stick.current = [x, y]; }} className="size-24 bg-background/70 backdrop-blur-sm" testId="playground-stick" />
          </div>
        </Stage>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Readout label={t.spp} value={<span data-testid="playground-spp">{seen ? seen.spp.toLocaleString() : "–"}</span>} />
        <Readout label={t.msPerSample} value={seen?.ms ? seen.ms.toFixed(1) : "–"} unit={t.ms} tone="plain" />
        <Readout label={t.triangles} value={tracer.built ? tracer.built.triangles.toLocaleString() : "–"} tone="plain" />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.mode}>
          <span className="label">{t.mode}</span>
          {MODES.map((m) => <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} aria-pressed={mode === m} disabled={!tracer.live} onClick={() => { setMode(m); change({ mode: m }); }} data-testid={`playground-mode-${m}`}>{t[m]}</Button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.view}>
          <span className="label">{t.view}</span>
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => <Button key={v} size="sm" variant={view === v ? "default" : "outline"} disabled={!tracer.live} onClick={() => { setView(v); pose.current = { at: [...VIEWS[v].at] as Vec3, yaw: VIEWS[v].yaw, pitch: VIEWS[v].pitch }; dirty.current = true; }}>{t[v]}</Button>)}
        </div>
        <label className="flex min-w-48 flex-1 items-center gap-3">
          <span className="label shrink-0">{t.hour} {String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")}</span>
          <Slider value={[hour]} min={6.5} max={17.5} step={0.25} aria-label={t.hour} disabled={!tracer.live} onValueChange={(v) => { const h = Array.isArray(v) ? v[0] : v; setHour(h); change({ hour: h }); }} />
        </label>
      </div>
      <p className="text-muted-foreground">{t.hint}</p>
      <p className="label normal-case">{PLAYGROUND_CREDIT}</p>
    </div>
  );
}
