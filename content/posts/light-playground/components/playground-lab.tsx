"use client";

import { ArrowDownToLine, ArrowUpFromLine, CarFront, Loader2, Maximize2, Minimize2, Play, SlidersHorizontal, ArrowLeftRight, Keyboard, ChevronDown } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Stick } from "@/components/lab/stick";
import { Stage } from "@/components/rt/stage";
import { useTracer } from "@/components/rt/use-tracer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { BOXMAN_URL, MODELS_URL, PLAYGROUND_CREDIT, PLAYGROUND_URL, assembleDynamicBvh, createSkinner, parseBoxman, parseModels, parsePlaygroundMesh, prepareObject, sunAt, writeModel, type Mat34, type ModelName, type Models, type Prepared, type Vec3 } from "@/lib/rt";
import type { Renderer } from "@/lib/rt/gpu";
import { createWorld, type World } from "./game/world";
import { cn } from "@/lib/utils";
import { useLabels, type Labels } from "./labels";

const W = 960, H = 540, EXPOSURE = 0.15, MAX_SAMPLES = 1024, DYNAMIC = 16_384; // room for the moving triangles: five cars, a helicopter, an aeroplane and a person are about 11,300
/** What the renderer falls back to on a GPU that cannot keep up, in order: fewer pixels first, then fewer bounces. */
const LEVELS: { size: [number, number]; bounces: number }[] = [{ size: [960, 540], bounces: 8 }, { size: [768, 432], bounces: 8 }, { size: [640, 360], bounces: 8 }, { size: [480, 270], bounces: 4 }, { size: [384, 216], bounces: 2 }];
const MODES = ["raster", "direct", "full"] as const;
type Mode = (typeof MODES)[number];
/** Physical keys (`event.code`): an input method changes what a key TYPES (W is ㄊ in Zhuyin), never which key it is. */
const KEYS: Record<string, [number, number]> = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

interface Assets { models: Models; world: World; skinner: ReturnType<typeof createSkinner>; /** each object's tree, built once from its rest pose */ prepared: Record<ModelName | "person", Prepared>; scratch: { positions: Float32Array; materials: Uint32Array } }

type Seat = "foot" | "near" | "driving" | "flying" | "riding"; // riding: in a passenger's seat

/** The keys for what you are doing right now, in the corner of the world, as Sketchbook shows them. For a keyboard: a phone has the stick and the buttons. */
function Hints({ t, seat, craft }: { t: Labels; seat: Seat; craft: ModelName | null }) {
  const active = seat === "riding" ? "riding" : seat === "driving" ? "car" : seat === "flying" ? (craft === "airplane" ? "plane" : "heli") : "foot", group = t.legend.find((g) => g.id === active) ?? t.legend[0];
  return (
    <div className="pointer-events-none w-60 rounded-md border border-white/15 bg-black/70 px-3 py-2.5 text-xs text-white/90 backdrop-blur-md" data-testid="playground-hints" data-for={active}>
      <div role="heading" aria-level={3} className="label mb-1.5 text-white">{group.title}</div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        {group.keys.map(([keys, what]) => (
          <div key={what} className={cn("contents", seat === "near" && keys === "F" && "[&>dd]:text-signal")}>
            <dt className="flex flex-wrap gap-1">{keys.split(" ").map((k) => <kbd key={k} className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] leading-none text-white">{k}</kbd>)}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The playground, walked through while it is path traced. The ground is one BVH, built once; the character and the
 * vehicles are in a second one, rebuilt on every frame in which something moved. Every such frame also throws away
 * what the picture had accumulated: stand still and it clears.
 */
export function PlaygroundLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("full"), [hour, setHour] = useState(16), [seen, setSeen] = useState<{ spp: number; ms: number; moving: number; tree: number } | null>(null), [ready, setReady] = useState(false), [entered, setEntered] = useState(false), [carry, setCarry] = useState(true), [denoise, setDenoise] = useState(true), [seat, setSeat] = useState<Seat>("foot"), [craft, setCraft] = useState<ModelName | null>(null), [expanded, setExpanded] = useState(false), [turned, setTurned] = useState(false), [tools, setTools] = useState(true), [locked, setLocked] = useState(false);
  const settings = useRef({ mode, hour, carry: true, denoise: true }), dirty = useRef(true), relit = useRef(true), mine = useRef<Renderer | null>(null), assets = useRef<Assets | null>(null);
  const orbit = useRef({ yaw: 0.6, pitch: -0.28, distance: 4.6 }), drag = useRef<{ x: number; y: number } | null>(null), stick = useRef<[number, number]>([0, 0]), held = useRef(new Set<string>()), jump = useRef(false), down = useRef(false), hover = useRef(false), interact = useRef(false), seatNow = useRef("foot");
  const stageElement = useRef<HTMLDivElement>(null), pressedAt = useRef({ x: 0, y: 0 }), lockedNow = useRef(false), releasedAt = useRef(-1e9);
  /** Some browsers hand the page the very Escape that released the pointer: that one must not also collapse the view. */
  const justReleased = () => lockedNow.current || performance.now() - releasedAt.current < 400;
  useEffect(() => { lockedNow.current = locked; }, [locked]);
  const turnedNow = useRef(false);
  const [help, setHelp] = useState(false);
  const passenger = useRef(false), switchSeat = useRef(false), firstPerson = useRef(false), heading = useRef<number | null>(null); // G, X (one press each) and V (Sketchbook's first-person view, in a vehicle)
  useEffect(() => { turnedNow.current = turned; }, [turned]);
  const timing = useRef({ ms: 0, tree: 0, triangles: 0 }), quality = useRef({ level: 0, frame: 16, slow: 0, fast: 0, since: 0 }), [level, setLevel] = useState(0);

  const tracer = useTracer(root, canvas, {
    playground: PLAYGROUND_URL, dynamicTriangles: DYNAMIC, temporal: true, size: W, height: H, autostart: true, maxSamples: MAX_SAMPLES, budgetMs: 8,
    configure: (r) => { mine.current = r; dirty.current = true; },
    afterFrame: (r, _built, batch) => { const k = timing.current; k.ms = k.ms ? k.ms * 0.9 + (batch.gpuMs / batch.samples) * 0.1 : batch.gpuMs / batch.samples; setSeen({ spp: r.samples, ms: k.ms, moving: k.triangles, tree: k.tree }); },
  });
  const { resume, built } = tracer;

  // Everything that is not the renderer: the vehicles, the character, and the physics the character walks in.
  useEffect(() => {
    const park = built?.playground;
    if (!park || !entered) return; // the game (models, animations, a megabyte of physics engine) is fetched when the reader asks for it, not by scrolling past
    let alive = true, made: World | null = null;
    void (async () => {
      const [modelsFile, manFile, groundFile] = await Promise.all([MODELS_URL, BOXMAN_URL, PLAYGROUND_URL].map((url) => fetch(url).then((r) => r.arrayBuffer())));
      const models = parseModels(modelsFile), man = parseBoxman(manFile), ground = parsePlaygroundMesh(groundFile), start = park.spawns.find((s) => s.type === "player")?.at ?? [0, 20, 0];
      const parked: { name: ModelName; pose: Mat34 }[] = [], airfield = park.spawns.filter((s) => s.type === "player")[1]?.at ?? start;
      // cars from around the first spawn, the aircraft from around the second (Sketchbook's airfield)
      const near = (s: { type: string; at: Vec3 }) => { const from = s.type === "car" ? start : airfield; return Math.hypot(s.at[0] - from[0], s.at[2] - from[2]); };
      for (const name of ["car", "heli", "airplane"] as ModelName[]) for (const spawn of park.spawns.filter((s) => s.type === name && s.at[1] < 100).sort((a, b) => near(a) - near(b)).slice(0, name === "car" ? 5 : 1)) parked.push({ name, pose: [...spawn.basis, ...spawn.at] });
      const world = await createWorld(ground, start, models, parked, man);
      if (!alive) { world.destroy(); return; }
      made = world;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __world?: World }).__world = world; // for measurements, as window.__lights
      const scratch = { positions: new Float32Array(DYNAMIC * 9), materials: new Uint32Array(DYNAMIC) }, skinner = createSkinner(man), prepared = {} as Assets["prepared"];
      for (const name of ["car", "heli", "airplane"] as ModelName[]) prepared[name] = prepareObject(scratch.positions, writeModel(models, name, 0, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], () => null, scratch, 0));
      skinner.pose("idle", 0, true); prepared.person = prepareObject(scratch.positions, skinner.write([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 0, scratch, 0));
      assets.current = { models, world, skinner, prepared, scratch };
      dirty.current = true; setReady(true);
    })().catch((error) => console.error("[playground] could not start the game", error));
    return () => { alive = false; assets.current = null; made?.destroy(); };
  }, [built, entered]);

  /** This frame's moving things into their tree, the camera behind the character, and a fresh picture. */
  const draw = useCallback((blend: number, lightChanged: boolean) => {
    const r = mine.current, a = assets.current, park = built?.playground;
    if (!r || !a || !park) return;
    if (lightChanged) r.reset(); else r.advance(); // a movement keeps the picture and carries it over; new light makes the old picture wrong
    const started = performance.now(), person = a.world.person, out = a.scratch;
    let cursor = 0;
    let cars = 0;
    const objects: { prepared: Prepared; first: number }[] = [];
    for (const v of a.world.vehicles) {
      objects.push({ prepared: a.prepared[v.name], first: cursor });
      const base = park.vehicleMaterials[v.name], paint = v.name === "car" && cars++ > 0 ? park.carPaints + ((cars - 2) % 4) : base; // the first car keeps the red
      cursor = writeModel(a.models, v.name, [paint, base + 1, base + 2, base + 3], v.pose(), (part) => v.part(part), out, cursor);
    }
    // the character is always there to be seen: walking, opening a door, sitting at the wheel
    const driven = a.world.seated() ? a.world.driving() : null;
    objects.push({ prepared: a.prepared.person, first: cursor }); a.skinner.pose(person.clip, person.clipTime, person.loop, Math.min(1, blend * (0.1 / Math.max(person.fade, 0.02))));
    const inside = a.world.driving(), eyes = firstPerson.current && inside ? inside : null; // first person: the character is not drawn (all of it in one point), as Sketchbook hides it
    cursor = a.skinner.write(eyes ? [0, 0, 0, 0, 0, 0, 0, 0, 0, person.at[0], person.at[1], person.at[2]] : person.place, park.characterMaterial, out, cursor);
    r.setDynamic(assembleDynamicBvh(objects, out.positions, out.materials, r.nodeBase, r.triangleBase));
    timing.current.tree = timing.current.tree * 0.9 + (performance.now() - started) * 0.1; timing.current.triangles = cursor;

    // In first person the view belongs to the vehicle: it starts looking out of the windscreen and turns as the vehicle turns (ours;
    // Sketchbook leaves the camera where the mouse last put it, which from inside a car is usually a door).
    if (eyes) { const m = eyes.pose(), h = Math.atan2(m[6], -m[8]); if (heading.current === null) { orbit.current.yaw = h; orbit.current.pitch = -0.08; } else orbit.current.yaw += Math.atan2(Math.sin(h - heading.current), Math.cos(h - heading.current)); heading.current = h; } else heading.current = null;
    const o = orbit.current, s = settings.current, light = sunAt(s.hour), at = driven ? driven.pose().slice(9) : person.at, head: Vec3 = [at[0], at[1] + (driven ? 1.1 : 0.95), at[2]], reach = driven ? (driven.craft ? 2.4 : 1.7) : 1;
    const back: Vec3 = [-Math.sin(o.yaw) * Math.cos(o.pitch), -Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)], distance = a.world.clearance(head, back, o.distance * reach);
    if (eyes) { // the camera sits on the model's own camera point (or over the seat) and looks where the mouse says
      const m = eyes.pose(), c = a.models.models[eyes.name].anchors.camera ?? [eyes.seat.at[0], eyes.seat.at[1] + 0.75, eyes.seat.at[2]], eye: Vec3 = [m[0] * c[0] + m[3] * c[1] + m[6] * c[2] + m[9], m[1] * c[0] + m[4] * c[1] + m[7] * c[2] + m[10], m[2] * c[0] + m[5] * c[1] + m[8] * c[2] + m[11]];
      r.setCamera({ eye, target: [eye[0] - back[0], eye[1] - back[1], eye[2] - back[2]], fov: 70 });
    } else r.setCamera({ eye: [head[0] + back[0] * distance, head[1] + back[1] * distance, head[2] + back[2] * distance], target: head, fov: 55 });
    r.sun = light.sun; r.skyLevel = light.skyLevel; r.exposure = EXPOSURE; r.raster = s.mode === "raster"; r.bounces = s.mode === "full" ? LEVELS[quality.current.level].bounces : 1; r.historyCap = s.carry ? 12 : 0; r.denoise = s.denoise;
    r.sample(1); r.present();
    resume();
  }, [built, resume]);

  // The game runs on its own clock, by elapsed time: a 120 Hz display must not run twice as fast.
  useEffect(() => {
    let alive = true, last = performance.now();
    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const a = assets.current;
      // Keeping up: a smoothed frame time, judged only while something moves (standing still, a slow frame costs nothing).
      // Over 26 ms for a second and the picture gets smaller; under 11 ms for three seconds at a reduced size and it gets a level back.
      const q = quality.current, r0 = mine.current;
      if (a && r0 && document.visibilityState === "visible" && (q.since += dt) > 3) { // (not in the first seconds: shaders and the physics engine are still warming up)
        q.frame += (dt * 1000 - q.frame) * 0.1;
        const forced = process.env.NODE_ENV !== "production" ? (window as unknown as { __slow?: number }).__slow : undefined; // for trying it on a fast GPU
        const frame = forced ?? q.frame, moving = a.world.person.moving || a.world.vehicles.some((v) => v.moving());
        q.slow = moving && frame > 26 ? q.slow + dt : 0; q.fast = moving && frame < 11 && q.level > 0 ? q.fast + dt : 0;
        const next = q.slow > 1 && q.level < LEVELS.length - 1 ? q.level + 1 : q.fast > 3 ? q.level - 1 : q.level;
        if (next !== q.level) { q.level = next; q.slow = q.fast = 0; q.frame = 16; r0.setRenderSize(...LEVELS[next].size); setLevel(next); relit.current = true; }
      }
      if (!a && r0 && (dirty.current || relit.current)) { // not entered yet: the playground from above, standing still, clearing
        dirty.current = false; relit.current = false;
        const s0 = settings.current, light = sunAt(s0.hour);
        r0.setCamera({ eye: [60, 30, 70], target: [0, 14, -5], fov: 50 }); r0.sun = light.sun; r0.skyLevel = light.skyLevel; r0.exposure = EXPOSURE; r0.raster = s0.mode === "raster"; r0.bounces = s0.mode === "full" ? 8 : 1; r0.denoise = s0.denoise;
        r0.reset(); r0.sample(1); r0.present(); resume();
      }
      if (a && mine.current) {
        const move: [number, number] = [stick.current[0], stick.current[1]];
        for (const key of held.current) { const k = KEYS[key]; if (k) { move[0] += k[0]; move[1] += k[1]; } }
        // Flying, the keys are Sketchbook's: W S pitch, A D roll, Q E yaw, Shift up or throttle, Space down or air brake, B the wheel brake.
        // A thumb has no Q and E, so in the helicopter the stick's sideways half is the yaw: pitch and yaw fly it anywhere, pitch and roll do not.
        let turn = (held.current.has("KeyE") ? 1 : 0) - (held.current.has("KeyQ") ? 1 : 0);
        if (seatNow.current === "flying" && a.world.driving()?.name === "heli") { turn += stick.current[0]; move[0] -= stick.current[0]; }
        const changed = a.world.step(dt, { move, yaw: orbit.current.yaw, jump: jump.current || held.current.has("space") || hover.current, sprint: held.current.has("shift") || down.current, interact: interact.current, passenger: passenger.current, switchSeat: switchSeat.current, turn, up: held.current.has("shift") || hover.current, down: held.current.has("space") || down.current, wheelBrake: held.current.has("KeyB") });
        jump.current = false; interact.current = false; passenger.current = false; switchSeat.current = false;
        if (!a.world.driving() && firstPerson.current) { firstPerson.current = false; dirty.current = true; }
        const inside = a.world.seated() ? a.world.driving() : null, now = inside ? (inside.craft ? "flying" : "driving") : a.world.driving() && a.world.riding() ? "riding" : a.world.nearby() ? "near" : "foot";
        if (now !== seatNow.current) { seatNow.current = now; setSeat(now); setCraft(inside?.name ?? null); dirty.current = true; }
        if (changed || dirty.current || relit.current) { const relight = relit.current; dirty.current = false; relit.current = false; draw(1 - Math.exp(-dt * 14), relight); }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
  }, [draw, resume]);

  // Expanded, the world covers the window (the same canvas: nothing is rebuilt). The page behind must not scroll and
  // Escape closes it. On a phone the game wants to be landscape: ask for fullscreen and an orientation lock (Android
  // gives both); where that is refused (an iPhone has neither) and the screen is upright, turn the whole overlay a
  // quarter turn with CSS instead, and the reader turns the phone.
  useEffect(() => {
    if (!expanded) return;
    const before = document.documentElement.style.overflow, close = (e: globalThis.KeyboardEvent) => { if (e.code === "Escape" && !document.pointerLockElement && !justReleased()) setExpanded(false); }; // the first Escape gives the mouse back, the second collapses
    document.documentElement.style.overflow = "hidden"; window.addEventListener("keydown", close);
    const touch = window.matchMedia("(pointer: coarse)").matches, upright = () => touch && window.innerHeight > window.innerWidth;
    let locked = false, alive = true;
    const settle = () => { if (alive) setTurned(!locked && upright()); };
    if (touch && root.current?.requestFullscreen) {
      void root.current.requestFullscreen({ navigationUI: "hide" }).then(() => (screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> }).lock?.("landscape")).then(() => { locked = true; }).catch(() => undefined).finally(settle);
    } else settle();
    const left = () => { if (!document.fullscreenElement && locked) setExpanded(false); };
    window.addEventListener("resize", settle); document.addEventListener("fullscreenchange", left);
    return () => { alive = false; document.documentElement.style.overflow = before; window.removeEventListener("keydown", close); window.removeEventListener("resize", settle); document.removeEventListener("fullscreenchange", left); screen.orientation?.unlock?.(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); setTurned(false); };
  }, [expanded]);

  // With a mouse: a click on the world takes the pointer (the mouse then turns the camera without a button held, as in
  // any game), and Escape gives it back. The browser keeps that Escape for itself, so it takes a second one to collapse.
  useEffect(() => {
    const changed = () => { const on = !!document.pointerLockElement && document.pointerLockElement === stageElement.current; if (!on) releasedAt.current = performance.now(); setLocked(on); };
    // The browser releases the pointer on Escape by itself. If an Escape reaches the page while it is still taken (some do), release it here: Escape always gives the mouse back.
    const release = (e: globalThis.KeyboardEvent) => { if (e.code === "Escape" && document.pointerLockElement === stageElement.current) document.exitPointerLock(); };
    document.addEventListener("pointerlockchange", changed); window.addEventListener("keydown", release, true);
    return () => { document.removeEventListener("pointerlockchange", changed); window.removeEventListener("keydown", release, true); if (document.pointerLockElement) document.exitPointerLock(); };
  }, []);

  /** Stand the character next to the first vehicle of a kind, on its driver's side. */
  const go = (name: ModelName) => { const a = assets.current, v = a?.world.vehicles.find((x) => x.name === name); if (!a || !v) return; const m = v.pose(); a.world.teleport([m[9] + m[0] * 2.4, m[10] + 0.5, m[11] + m[2] * 2.4]); relit.current = true; };
  const change = (next: Partial<{ mode: Mode; hour: number; carry: boolean; denoise: boolean }>) => { settings.current = { ...settings.current, ...next }; if ("mode" in next || "hour" in next) relit.current = true; else dirty.current = true; }; // new light makes the old picture wrong; how it is carried and filtered does not
  const key = (event: KeyboardEvent, down: boolean) => {
    const k = event.code === "ShiftLeft" || event.code === "ShiftRight" ? "shift" : event.code === "Space" ? "space" : event.code;
    if (event.code === "Escape") return; // the window's listener decides (it knows whether this Escape only released the pointer)
    if (!(k in KEYS) && k !== "shift" && k !== "space" && k !== "KeyF" && k !== "KeyQ" && k !== "KeyE" && k !== "KeyB" && k !== "KeyG" && k !== "KeyX" && k !== "KeyV") return;
    if (k !== "shift") event.preventDefault(); // the arrows and the space bar would scroll the page
    if (k === "KeyF") { if (down && !event.repeat) interact.current = true; return; }
    if (k === "KeyG") { if (down && !event.repeat) passenger.current = true; return; }
    if (k === "KeyX") { if (down && !event.repeat) switchSeat.current = true; return; }
    if (k === "KeyV") { if (down && !event.repeat && assets.current?.world.driving()) { firstPerson.current = !firstPerson.current; dirty.current = true; } return; }
    if (k === "space" && down && !event.repeat) jump.current = true; // held, it is the car's brake
    if (down) held.current.add(k); else held.current.delete(k);
  };
  // On a phone a vertical swipe still scrolls the page (touch-pan-y): the browser cancels the pointer and the drag ends.
  const look = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current && !lockedNow.current) return;
    const o = orbit.current;
    let dx = lockedNow.current ? event.movementX : event.clientX - (drag.current?.x ?? event.clientX), dy = lockedNow.current ? event.movementY : event.clientY - (drag.current?.y ?? event.clientY);
    if (turnedNow.current) [dx, dy] = [dy, -dx]; // the overlay is a quarter turn clockwise: its right is the screen's down
    o.yaw += dx * 0.006; o.pitch = Math.max(-1.2, Math.min(0.45, o.pitch - dy * 0.005));
    if (drag.current) drag.current = { x: event.clientX, y: event.clientY };
    dirty.current = true;
  };

  const settings$ = (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.mode}>
        <span className="label">{t.mode}</span>
        {MODES.map((m) => <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} aria-pressed={mode === m} disabled={!tracer.live} onClick={() => { setMode(m); change({ mode: m }); }} data-testid={`playground-mode-${m}`}>{t[m]}</Button>)}
      </div>
      {/* the one switch of this article's subject: keep last frame's picture across a movement, or start from nothing every frame */}
      <Button size="sm" variant={carry ? "default" : "outline"} aria-pressed={carry} disabled={!tracer.live} onClick={() => { setCarry(!carry); change({ carry: !carry }); }} data-testid="playground-carry">{t.carry}</Button>
      <Button size="sm" variant={denoise ? "default" : "outline"} aria-pressed={denoise} disabled={!tracer.live} onClick={() => { setDenoise(!denoise); change({ denoise: !denoise }); }} data-testid="playground-denoise">{t.denoise}</Button>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.place}>
        <span className="label">{t.place}</span>
        {([["car", t.placeCar], ["heli", t.placeHeli], ["airplane", t.placePlane]] as const).map(([name, text]) => <Button key={name} size="sm" variant="outline" disabled={!ready} onClick={() => go(name)} data-testid={`playground-go-${name}`}>{text}</Button>)}
      </div>
      <label className="flex min-w-44 flex-1 items-center gap-3">
        <span className="label shrink-0">{t.hour} {String(Math.floor(hour)).padStart(2, "0")}:{String(Math.round((hour % 1) * 60)).padStart(2, "0")}</span>
        <Slider value={[hour]} min={6.5} max={17.5} step={0.25} aria-label={t.hour} disabled={!tracer.live} onValueChange={(v) => { const h = Array.isArray(v) ? v[0] : v; setHour(h); change({ hour: h }); }} />
      </label>
    </>
  );
  // held for as long as they are pressed: down / brake, and up / throttle
  const holdDown = { onPointerDown: () => { down.current = true; }, onPointerUp: () => { down.current = false; }, onPointerLeave: () => { down.current = false; }, onPointerCancel: () => { down.current = false; } };
  const holdUp = { onPointerDown: () => { hover.current = true; }, onPointerUp: () => { hover.current = false; }, onPointerLeave: () => { hover.current = false; }, onPointerCancel: () => { hover.current = false; } };
  const stop = { onPointerDown: (e: PointerEvent) => e.stopPropagation(), onClick: (e: MouseEvent) => e.stopPropagation() }; // a press on a control is not the start of a camera drag, nor a click that takes the pointer

  return (
    // Expanded, this is a game: the world covers the window and everything else floats over it. `turned`: a quarter turn, for an upright phone that cannot be asked to rotate.
    <div ref={root} className={cn("text-sm", expanded ? "fixed inset-0 z-50 overflow-hidden bg-black" : "grid gap-4")}
      role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? t.picture : undefined} data-expanded={expanded} data-turned={turned}>
      <div ref={stageElement} tabIndex={0} role="application" aria-label={t.picture} className={cn("relative outline-none", expanded ? "touch-none" : "touch-pan-y rounded-md focus-visible:ring-2 focus-visible:ring-ring", expanded && !turned && "size-full")}
        // The quarter turn is on this inner element: a browser overrides the transform of the fullscreen element itself.
        style={expanded && turned ? { position: "absolute", top: 0, left: "100%", width: "100dvh", height: "100dvw", transform: "rotate(90deg)", transformOrigin: "top left" } : undefined} onKeyDown={(e) => key(e, true)} onKeyUp={(e) => key(e, false)} onBlur={() => held.current.clear()}
        onPointerDown={(e) => {
          e.currentTarget.focus({ preventScroll: true });
          if (locked) return;
          drag.current = { x: e.clientX, y: e.clientY }; pressedAt.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId);
        }}
        // A click with a mouse (a press that did not turn into a drag) takes the pointer, in the article as well as expanded, where the
        // browser can. On the click and not on the press: a browser refuses a document that the press itself has only just focused.
        onClick={(e) => {
          const native = e.nativeEvent as globalThis.PointerEvent, moved = Math.hypot(e.clientX - pressedAt.current.x, e.clientY - pressedAt.current.y);
          if (!ready || locked || moved > 4 || (native.pointerType && native.pointerType !== "mouse") || typeof e.currentTarget.requestPointerLock !== "function") return;
          void Promise.resolve(e.currentTarget.requestPointerLock()).catch(() => undefined); // refused: dragging still turns the camera
        }} onPointerMove={look} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} data-testid="playground-stage" data-ready={ready} data-seat={seat}>
        <Stage canvas={canvas} status={tracer.status} label={t.picture} t={t} testid="playground-canvas" wide fill={expanded}>
          {!ready && tracer.live && (
            <div className="absolute inset-0 grid place-items-center" {...stop}>
              <Button size="lg" disabled={entered} onClick={() => setEntered(true)} className="shadow-lg" data-testid="playground-enter">{entered ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}{entered ? t.entering : t.enter}</Button>
            </div>
          )}
          {/* top right: what the renderer is doing, and the way out */}
          <div className="absolute top-2 right-2 flex items-center gap-2" {...stop}>
            {expanded && seen && <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[11px] text-white/85 backdrop-blur-sm tabular">{seen.spp.toLocaleString()} {t.sppShort} · {seen.ms.toFixed(1)} {t.ms}{level > 0 && ` · ${LEVELS[level].size.join("×")}`}</span>}
            <Button size="sm" variant="secondary" className="opacity-90" onClick={() => { if (!expanded) setTools(!window.matchMedia("(pointer: coarse)").matches); setExpanded(!expanded); }} aria-pressed={expanded} data-testid="playground-expand">{expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}{expanded ? t.collapse : t.expand}</Button>
          </div>
          {/* top left, expanded only: the settings, folded away on a phone until asked for */}
          {expanded && !locked && ( // with the pointer taken there is nothing to click them with
            <div className="absolute top-2 left-2 flex max-w-[min(46rem,calc(100%-11rem))] items-start gap-2" {...stop}>
              <Button size="icon" variant="secondary" className="shrink-0 opacity-90" aria-label={t.settings} aria-pressed={tools} onClick={() => setTools(!tools)} data-testid="playground-tools"><SlidersHorizontal className="size-4" aria-hidden /></Button>
              {tools && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-white/15 bg-background/80 px-3 py-2 backdrop-blur-sm">{settings$}</div>}
            </div>
          )}
          {/* bottom left: the site's thumb stick. Expanded on a machine with a mouse and a keyboard it would only be in the way. */}
          <div className={cn("absolute bottom-2 left-2 opacity-80", expanded && "bottom-4 left-4 [@media(pointer:fine)]:hidden", !ready && "hidden")} {...stop}>
            <Stick label={t.stick} onChange={(x, y) => { stick.current = [x, y]; }} quarterTurn={turned} className={cn("bg-background/70 backdrop-blur-sm", expanded ? "size-28" : "size-24")} testId="playground-stick" />
          </div>
          {/* bottom right: what a stick cannot say (touch), or what the keys are right now (keyboard) */}
          <div className={cn("absolute right-2 bottom-2 flex max-w-[calc(100%-7.5rem)] flex-wrap-reverse justify-end gap-2", expanded && "right-4 bottom-4 [@media(pointer:fine)]:hidden", !ready && "hidden")} {...stop}>
            {(seat === "driving" || seat === "riding" || (seat === "flying" && craft === "heli")) && <Button size="sm" variant="secondary" className="opacity-90" onClick={() => { switchSeat.current = true; }} data-testid="playground-switch"><ArrowLeftRight className="size-4" aria-hidden /><span className="max-[480px]:sr-only">{t.switchSeat}</span></Button>}
            {seat !== "foot" && <Button size="sm" variant="secondary" className="opacity-90" onClick={() => { interact.current = true; }} data-testid="playground-interact"><CarFront className="size-4" aria-hidden /><span className="max-[480px]:sr-only">{seat === "near" ? t.getIn : t.getOut}</span></Button>}
            {seat === "flying" && <Button size="sm" variant="secondary" className="opacity-90" {...holdDown} data-testid="playground-down"><ArrowDownToLine className="size-4" aria-hidden /><span className="max-[480px]:sr-only">{t.descend}</span></Button>}
            <Button size="sm" variant="secondary" className="opacity-90" onClick={() => { jump.current = true; }} {...(seat === "driving" || seat === "flying" ? holdUp : {})} data-testid="playground-jump"><ArrowUpFromLine className="size-4" aria-hidden /><span className="max-[480px]:sr-only">{seat === "driving" ? t.brake : seat === "flying" ? t.climb : t.jump}</span></Button>
          </div>
          {expanded && ready && <div className="absolute right-4 bottom-4 hidden [@media(pointer:fine)]:block"><Hints t={t} seat={seat} craft={craft} /></div>}
          {/* what the mouse is doing, and how to get it back: at the bottom, clear of the settings */}
          {ready && <p className={cn("pointer-events-none absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap", expanded ? "bottom-4" : "bottom-2", "rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-white/90 backdrop-blur-md [@media(pointer:fine)_and_(min-width:481px)]:block")} data-testid="playground-lock" data-locked={locked}>{locked ? t.lockOn : expanded ? t.lockOff : t.lockOffArticle}</p>}
        </Stage>
      </div>
      {!expanded && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Readout label={t.spp} value={<span data-testid="playground-spp">{seen ? seen.spp.toLocaleString() : "–"}</span>} />
            <Readout label={t.msPerSample} value={seen?.ms ? seen.ms.toFixed(1) : "–"} unit={t.ms} tone="plain" />
            <Readout label={t.movingTriangles} value={seen?.moving ? seen.moving.toLocaleString() : "–"} tone="plain" />
            <Readout label={t.treeMs} value={seen?.tree ? seen.tree.toFixed(1) : "–"} unit={t.ms} tone="plain" />
            <Readout label={t.rendered} value={<span data-testid="playground-size">{LEVELS[level].size.join(" × ")}</span>} tone={level ? "alt" : "plain"} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">{settings$}</div>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <p className="max-w-[60ch] text-muted-foreground">{t.hint}</p>
            <Button size="sm" variant="outline" aria-expanded={help} aria-controls="playground-help" onClick={() => setHelp((h) => !h)} data-testid="playground-help-toggle"><Keyboard className="size-4" aria-hidden />{t.help}<ChevronDown className={cn("size-4 transition-transform", help && "rotate-180")} aria-hidden /></Button>
          </div>
          {help && (
            <div id="playground-help" className="grid gap-x-8 gap-y-5 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="playground-help">
              {t.legend.map((group) => (
                <section key={group.id}>
                  <div role="heading" aria-level={3} className="label mb-2 text-foreground">{group.title}</div>
                  <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
                    {group.keys.map(([keys, what]) => (
                      <div key={what} className="contents">
                        <dt className="flex flex-wrap gap-1">{keys.split(" ").map((k) => <kbd key={k} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none">{k}</kbd>)}</dt>
                        <dd className="text-muted-foreground">{what}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">{t.helpTouch}</p>
            </div>
          )}
          <p className="label normal-case">{PLAYGROUND_CREDIT}; Rapier (Dimforge), Apache-2.0</p>
        </>
      )}
    </div>
  );
}
