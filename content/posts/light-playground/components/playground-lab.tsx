"use client";

import { ArrowUpFromLine, CarFront } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Stick } from "@/components/lab/stick";
import { Stage } from "@/components/rt/stage";
import { useTracer } from "@/components/rt/use-tracer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { BOXMAN_URL, MODELS_URL, PLAYGROUND_CREDIT, PLAYGROUND_URL, buildDynamicBvh, compose, createSkinner, parseBoxman, parseModels, parsePlaygroundMesh, rotationY, sunAt, writeModel, type Mat34, type ModelName, type Models, type Vec3 } from "@/lib/rt";
import type { Renderer } from "@/lib/rt/gpu";
import { createWorld, type World } from "./game/world";
import { useLabels } from "./labels";

const W = 960, H = 540, EXPOSURE = 0.18, MAX_SAMPLES = 1024, DYNAMIC = 16_384; // room for the moving triangles: five cars, a helicopter, an aeroplane and a person are about 11,300
const MODES = ["raster", "direct", "full"] as const;
type Mode = (typeof MODES)[number];
const KEYS: Record<string, [number, number]> = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0], arrowup: [0, 1], arrowdown: [0, -1], arrowleft: [-1, 0], arrowright: [1, 0] };

interface Assets { models: Models; world: World; skinner: ReturnType<typeof createSkinner>; scratch: { positions: Float32Array; materials: Uint32Array } }

/**
 * The playground, walked through while it is path traced. The ground is one BVH, built once; the character and the
 * vehicles are in a second one, rebuilt on every frame in which something moved. Every such frame also throws away
 * what the picture had accumulated: stand still and it clears.
 */
export function PlaygroundLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("full"), [hour, setHour] = useState(16), [seen, setSeen] = useState<{ spp: number; ms: number; moving: number; tree: number } | null>(null), [ready, setReady] = useState(false), [seat, setSeat] = useState<"foot" | "near" | "driving">("foot");
  const settings = useRef({ mode, hour }), dirty = useRef(true), mine = useRef<Renderer | null>(null), assets = useRef<Assets | null>(null);
  const orbit = useRef({ yaw: 0.6, pitch: -0.28, distance: 4.6 }), drag = useRef<{ x: number; y: number } | null>(null), stick = useRef<[number, number]>([0, 0]), held = useRef(new Set<string>()), jump = useRef(false), interact = useRef(false), seatNow = useRef("foot");
  const timing = useRef({ ms: 0, tree: 0, triangles: 0 });

  const tracer = useTracer(root, canvas, {
    playground: PLAYGROUND_URL, dynamicTriangles: DYNAMIC, size: W, height: H, autostart: true, maxSamples: MAX_SAMPLES, budgetMs: 8,
    configure: (r) => { mine.current = r; dirty.current = true; },
    afterFrame: (r, _built, batch) => { const k = timing.current; k.ms = k.ms ? k.ms * 0.9 + (batch.gpuMs / batch.samples) * 0.1 : batch.gpuMs / batch.samples; setSeen({ spp: r.samples, ms: k.ms, moving: k.triangles, tree: k.tree }); },
  });
  const { resume, built } = tracer;

  // Everything that is not the renderer: the vehicles, the character, and the physics the character walks in.
  useEffect(() => {
    const park = built?.playground;
    if (!park) return;
    let alive = true, made: World | null = null;
    void (async () => {
      const [modelsFile, manFile, groundFile] = await Promise.all([MODELS_URL, BOXMAN_URL, PLAYGROUND_URL].map((url) => fetch(url).then((r) => r.arrayBuffer())));
      const models = parseModels(modelsFile), man = parseBoxman(manFile), ground = parsePlaygroundMesh(groundFile), start = park.spawns.find((s) => s.type === "player")?.at ?? [0, 20, 0];
      const parked: { name: ModelName; pose: Mat34 }[] = [], near = (s: { at: Vec3 }) => Math.hypot(s.at[0] - start[0], s.at[2] - start[2]);
      for (const name of ["car", "heli", "airplane"] as ModelName[]) for (const spawn of park.spawns.filter((s) => s.type === name && s.at[1] < 100).sort((a, b) => near(a) - near(b)).slice(0, name === "car" ? 5 : 1)) parked.push({ name, pose: [...spawn.basis, ...spawn.at] });
      const world = await createWorld(ground, start, models, parked);
      if (!alive) { world.destroy(); return; }
      made = world;
      assets.current = { models, world, skinner: createSkinner(man), scratch: { positions: new Float32Array(DYNAMIC * 9), materials: new Uint32Array(DYNAMIC) } };
      dirty.current = true; setReady(true);
    })().catch((error) => console.error("[playground] could not start the game", error));
    return () => { alive = false; assets.current = null; made?.destroy(); };
  }, [built]);

  /** This frame's moving things into their tree, the camera behind the character, and a fresh picture. */
  const draw = useCallback((blend: number) => {
    const r = mine.current, a = assets.current, park = built?.playground;
    if (!r || !a || !park) return;
    const started = performance.now(), person = a.world.person, out = a.scratch;
    let cursor = 0;
    let cars = 0;
    for (const v of a.world.vehicles) {
      const base = park.vehicleMaterials[v.name], paint = v.name === "car" && cars++ > 0 ? park.carPaints + ((cars - 2) % 4) : base; // the first car keeps the red
      cursor = writeModel(a.models, v.name, [paint, base + 1, base + 2], v.pose(), (part) => v.wheel(part), out, cursor);
    }
    const driven = a.world.driving();
    if (!driven) { a.skinner.pose(person.clip, person.clipTime, person.loop, blend); cursor = a.skinner.write(compose([1, 0, 0, 0, 1, 0, 0, 0, 1, ...person.at], rotationY(Math.PI - person.facing)), park.characterMaterial, out, cursor); }
    r.setDynamic(buildDynamicBvh(out.positions, out.materials, cursor, r.nodeBase, r.triangleBase));
    timing.current.tree = timing.current.tree * 0.9 + (performance.now() - started) * 0.1; timing.current.triangles = cursor;

    const o = orbit.current, s = settings.current, light = sunAt(s.hour), at = driven ? driven.pose().slice(9) : person.at, head: Vec3 = [at[0], at[1] + (driven ? 1.1 : 0.95), at[2]];
    const back: Vec3 = [-Math.sin(o.yaw) * Math.cos(o.pitch), -Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)], distance = a.world.clearance(head, back, driven ? o.distance * 1.7 : o.distance);
    r.setCamera({ eye: [head[0] + back[0] * distance, head[1] + back[1] * distance, head[2] + back[2] * distance], target: head, fov: 55 });
    r.sun = light.sun; r.skyLevel = light.skyLevel; r.exposure = EXPOSURE; r.raster = s.mode === "raster"; r.bounces = s.mode === "full" ? 8 : 1;
    r.reset(); r.sample(1); r.present();
    resume();
  }, [built, resume]);

  // The game runs on its own clock, by elapsed time: a 120 Hz display must not run twice as fast.
  useEffect(() => {
    let alive = true, last = performance.now();
    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const a = assets.current;
      if (a && mine.current) {
        const move: [number, number] = [stick.current[0], stick.current[1]];
        for (const key of held.current) { const k = KEYS[key]; if (k) { move[0] += k[0]; move[1] += k[1]; } }
        const changed = a.world.step(dt, { move, yaw: orbit.current.yaw, jump: jump.current || held.current.has("space"), sprint: held.current.has("shift"), interact: interact.current });
        jump.current = false; interact.current = false;
        const now = a.world.driving() ? "driving" : a.world.nearby() ? "near" : "foot";
        if (now !== seatNow.current) { seatNow.current = now; setSeat(now); dirty.current = true; }
        if (changed || dirty.current) { dirty.current = false; draw(1 - Math.exp(-dt * 14)); }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
  }, [draw]);

  const change = (next: Partial<{ mode: Mode; hour: number }>) => { settings.current = { ...settings.current, ...next }; dirty.current = true; };
  const key = (event: KeyboardEvent, down: boolean) => {
    const k = event.key === " " ? "space" : event.key.toLowerCase();
    if (!(k in KEYS) && k !== "shift" && k !== "space" && k !== "f") return;
    if (k !== "shift") event.preventDefault(); // the arrows and the space bar would scroll the page
    if (k === "f") { if (down && !event.repeat) interact.current = true; return; }
    if (k === "space" && down && !event.repeat) jump.current = true; // held, it is the car's brake
    if (down) held.current.add(k); else held.current.delete(k);
  };
  // On a phone a vertical swipe still scrolls the page (touch-pan-y): the browser cancels the pointer and the drag ends.
  const look = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const o = orbit.current;
    o.yaw += (event.clientX - drag.current.x) * 0.006; o.pitch = Math.max(-1.2, Math.min(0.45, o.pitch - (event.clientY - drag.current.y) * 0.005));
    drag.current = { x: event.clientX, y: event.clientY }; dirty.current = true;
  };

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div tabIndex={0} role="application" aria-label={t.picture} className="relative touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" onKeyDown={(e) => key(e, true)} onKeyUp={(e) => key(e, false)} onBlur={() => held.current.clear()}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus({ preventScroll: true }); }} onPointerMove={look} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} data-testid="playground-stage" data-ready={ready} data-seat={seat}>
        <Stage canvas={canvas} status={tracer.status} label={t.picture} t={t} testid="playground-canvas" wide>
          {/* The site's thumb stick (components/lab/stick.tsx), laid over the corner; jumping is the one thing it cannot say. */}
          <div className="absolute bottom-2 left-2 opacity-80" onPointerDown={(e) => e.stopPropagation()}>
            <Stick label={t.stick} onChange={(x, y) => { stick.current = [x, y]; }} className="size-24 bg-background/70 backdrop-blur-sm" testId="playground-stick" />
          </div>
          <div className="absolute right-2 bottom-2 flex gap-2" onPointerDown={(e) => e.stopPropagation()}>
            {seat !== "foot" && <Button size="sm" variant="secondary" className="opacity-85" onClick={() => { interact.current = true; }} data-testid="playground-interact"><CarFront className="size-4" aria-hidden />{seat === "driving" ? t.getOut : t.getIn}</Button>}
            <Button size="sm" variant="secondary" className="opacity-85" onClick={() => { jump.current = true; }} data-testid="playground-jump"><ArrowUpFromLine className="size-4" aria-hidden />{seat === "driving" ? t.brake : t.jump}</Button>
          </div>
        </Stage>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Readout label={t.spp} value={<span data-testid="playground-spp">{seen ? seen.spp.toLocaleString() : "–"}</span>} />
        <Readout label={t.msPerSample} value={seen?.ms ? seen.ms.toFixed(1) : "–"} unit={t.ms} tone="plain" />
        <Readout label={t.movingTriangles} value={seen?.moving ? seen.moving.toLocaleString() : "–"} tone="plain" />
        <Readout label={t.treeMs} value={seen?.tree ? seen.tree.toFixed(1) : "–"} unit={t.ms} tone="plain" />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.mode}>
          <span className="label">{t.mode}</span>
          {MODES.map((m) => <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} aria-pressed={mode === m} disabled={!tracer.live} onClick={() => { setMode(m); change({ mode: m }); }} data-testid={`playground-mode-${m}`}>{t[m]}</Button>)}
        </div>
        <label className="flex min-w-48 flex-1 items-center gap-3">
          <span className="label shrink-0">{t.hour} {String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")}</span>
          <Slider value={[hour]} min={6.5} max={17.5} step={0.25} aria-label={t.hour} disabled={!tracer.live} onValueChange={(v) => { const h = Array.isArray(v) ? v[0] : v; setHour(h); change({ hour: h }); }} />
        </label>
      </div>
      <p className="text-muted-foreground">{t.hint}</p>
      <p className="label normal-case">{PLAYGROUND_CREDIT}; Rapier (Dimforge), Apache-2.0</p>
    </div>
  );
}
