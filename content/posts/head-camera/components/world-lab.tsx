"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNear } from "@/components/lab/use-near";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { HOLD, HOME, K, type Kind, NO_SHIFT, Policy, SIZE, TOL, type XY, advance, bones, onBench, picture, towards, view } from "./model";
import { useLabels } from "./labels";
import { Param } from "./param";
import { useMine } from "./trained";
import type { BenchView } from "./view3d";

/** A policy step every this many ms; the arm is drawn moving smoothly between steps. */
const STEP_MS = 160;
/**
 * 17 cm from where the hand rests (HOME is about [0.385, 0]) and on the camera's side, where the arm never hides it. From
 * [0.3, −0.16] the forearm covers the block in the head camera's picture and the hand wobbles 3–4 cm off after arriving.
 */
const START_BLOCK: XY = [0.46, 0.15];
const DOTS = ["#ffff00", "#00ff00", "#ff00ff", "#ffffff", "#000000", "#ff8000", "#00a0ff", "#a0ffa0"];
const deg = Math.PI / 180;

type Phase = "home" | "look" | "go";
interface World {
  tip: XY; from: XY; at: number; block: XY; held: number;
  phase: Phase; goal: XY | null; seen: Uint8Array | null; keys: XY[];
  drag: "block" | "orbit" | null; px: number; py: number;
}

function paint(canvas: HTMLCanvasElement | null, bytes: Uint8Array) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const image = context.createImageData(SIZE, SIZE);
  for (let i = 0, o = 0; i < bytes.length; i += 3, o += 4) { image.data[o] = bytes[i]; image.data[o + 1] = bytes[i + 1]; image.data[o + 2] = bytes[i + 2]; image.data[o + 3] = 255; }
  context.putImageData(image, 0, 0);
}

/**
 * Prototype (not yet reviewed): drag the red block anywhere in the shaded area, turn the head camera, and watch the two
 * checkpoints. keep-looking re-reads the picture every step; look-once goes home, takes one picture and drives there.
 */
export function WorldLab() {
  const t = useLabels(), mine = useMine();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), eye = useRef<HTMLCanvasElement>(null);
  const near = useNear(root), reduced = useReducedMotion();
  const [policies, setPolicies] = useState<Record<Kind, Policy> | null>(null), [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind | "mine">("closed"), [pitch, setPitch] = useState(0), [yaw, setYaw] = useState(0);
  const [noise, setNoise] = useState(0), [light, setLight] = useState(1), [playing, setPlaying] = useState<boolean | null>(null);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState({ gap: 0, there: false, keys: [] as XY[], phase: "home" as Phase });
  const running = playing ?? !reduced;
  const world = useRef<World>({ tip: [...HOME], from: [...HOME], at: 0, block: [...START_BLOCK], held: 0, phase: "home", goal: null, seen: null, keys: [], drag: null, px: 0, py: 0 });
  const knobs = useRef({ kind, pitch, yaw, noise, light, running, mine });
  useEffect(() => { knobs.current = { kind, pitch, yaw, noise, light, running, mine }; }, [kind, pitch, yaw, noise, light, running, mine]);

  useEffect(() => {
    if (!near || policies) return;
    Promise.all((["closed", "open"] as const).map((k) => fetch(`/posts/head-camera/${k}.json`).then((r) => { if (!r.ok) throw new Error(`${k}: ${r.status}`); return r.json(); })))
      .then(([closed, open]) => setPolicies({ closed: new Policy(closed), open: new Policy(open) }))
      .catch(() => setFailed(true));
  }, [near, policies]);

  // Switching policy starts the episode again from home, so both are judged from the same start.
  useEffect(() => { const w = world.current; w.phase = "home"; w.goal = null; w.held = 0; }, [kind]);

  useEffect(() => {
    if (!policies || !canvas.current) return;
    let bench: BenchView | null = null, frame = 0, alive = true, visible = true, last = performance.now();
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: "100px" });
    io.observe(canvas.current);
    const step = () => {
      const w = world.current, k = knobs.current, policy = k.kind === "mine" ? k.mine ?? policies.closed : policies[k.kind], shift = { ...NO_SHIFT, pitch: k.pitch * deg, yaw: k.yaw * deg };
      w.from = w.tip;
      if (k.kind !== "open") {
        const bytes = view(w.tip, w.block, shift), r = policy.run(picture(bytes, k.noise, k.light));
        w.tip = advance(w.tip, r.out); w.seen = bytes; w.keys = r.keypoints;
      } else if (w.phase === "home") {
        w.tip = advance(w.tip, towards(w.tip, HOME));
        if (Math.hypot(w.tip[0] - HOME[0], w.tip[1] - HOME[1]) < 1e-6) w.phase = "look";
      } else if (w.phase === "look") {
        const bytes = view(HOME, w.block, shift), r = policy.run(picture(bytes, k.noise, k.light));
        w.goal = Policy.place(r.out); w.seen = bytes; w.keys = r.keypoints; w.phase = "go";
      } else if (w.goal) w.tip = advance(w.tip, towards(w.tip, w.goal));
      const gap = Math.hypot(w.tip[0] - w.block[0], w.tip[1] - w.block[1]);
      w.held = gap < TOL ? w.held + 1 : 0;
      if (w.seen) paint(eye.current, w.seen);
      setStatus({ gap, there: w.held >= HOLD, keys: w.keys, phase: w.phase });
    };
    const tick = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      if (!bench || !visible) return;
      const w = world.current, k = knobs.current;
      if (k.running && now - last >= STEP_MS) { last = now; w.at = now; step(); }
      const f = k.running ? Math.min(1, (now - w.at) / STEP_MS) : 1, shown: XY = [w.from[0] + (w.tip[0] - w.from[0]) * f, w.from[1] + (w.tip[1] - w.from[1]) * f];
      bench.render({ bones: bones(shown), block: [w.block[0], w.block[1], 0.02], ghostBlock: k.kind === "open" && w.phase === "go" ? w.goal : null, held: w.drag === "block" ? "block" : null, look: { yaw: k.yaw * deg, pitch: k.pitch * deg }, time: now });
    };
    import("./view3d").then(({ BenchView }) => BenchView.create(canvas.current!)).then((b) => { if (alive) { bench = b; step(); } else b.dispose(); });
    frame = requestAnimationFrame(tick);

    const c = canvas.current, ndc = (e: PointerEvent): XY => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
    const down = (e: PointerEvent) => {
      if (!bench) return;
      const w = world.current, [x, y] = ndc(e);
      w.drag = bench.grabs(x, y) ? "block" : "orbit"; w.px = e.clientX; w.py = e.clientY;
      bench.hover(w.drag === "block" ? "block" : null); bench.stopHinting(); setTouched(true);
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const w = world.current;
      if (!bench) return;
      if (!w.drag) { const [x, y] = ndc(e), over = bench.grabs(x, y); bench.hover(over); c.style.cursor = over ? "grab" : ""; return; }
      if (w.drag === "orbit") { bench.orbit(e.clientX - w.px, e.clientY - w.py); w.px = e.clientX; w.py = e.clientY; return; }
      const [x, y] = ndc(e), p = bench.benchAt(x, y);
      if (p) w.block = onBench(p, w.block);
    };
    const up = () => {
      const w = world.current;
      if (w.drag === "block" && knobs.current.kind === "open") { w.phase = "home"; w.goal = null; } // look-once looks again only when the block is put down
      w.drag = null;
      bench?.hover(null);
    };
    // The site switches theme by a class on <html>: repaint the fog to match.
    const themes = new MutationObserver(() => bench?.retheme());
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => {
      alive = false; cancelAnimationFrame(frame); io.disconnect(); themes.disconnect(); bench?.dispose();
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up);
    };
  }, [policies]);

  const reset = () => {
    const w = world.current;
    const seen = view(HOME, START_BLOCK, { ...NO_SHIFT, pitch: pitch * deg, yaw: yaw * deg });
    Object.assign(w, { tip: [...HOME], from: [...HOME], block: [...START_BLOCK], held: 0, phase: "home", goal: null, seen, keys: [] });
    paint(eye.current, seen);
    setStatus({ gap: Math.hypot(HOME[0] - START_BLOCK[0], HOME[1] - START_BLOCK[1]), there: false, keys: [], phase: "home" });
  };
  const panel = "rounded-md border border-border/70 bg-background/75 shadow-sm backdrop-blur-md";
  const choices: { id: Kind | "mine"; label: string }[] = [{ id: "closed", label: t.closed }, { id: "open", label: t.open }, ...(mine ? [{ id: "mine" as const, label: t.mine }] : [])];
  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-border bg-background sm:aspect-[16/10]">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing" role="img" aria-label={t.bench} data-testid="headcam-bench" />
        {!policies && <p className="absolute inset-0 grid place-items-center text-muted-foreground" role={failed ? "alert" : "status"}>{failed ? t.failed : t.loading}</p>}

        {/* Who drives: a segmented switch, top left. */}
        <div className={`absolute top-3 left-3 flex gap-0.5 p-0.5 ${panel}`} role="group" aria-label={t.policy}>
          {choices.map((c) => (
            <button key={c.id} type="button" aria-pressed={kind === c.id} onClick={() => setKind(c.id)} data-testid={`headcam-${c.id}`}
              className={`rounded-[5px] px-2.5 py-1 font-sans text-[13px] transition-colors ${kind === c.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              {c.label}
            </button>
          ))}
        </div>

        {/* What the network sees, picture in picture, top right. */}
        <figure className={`absolute top-3 right-3 w-[34%] max-w-[190px] overflow-hidden ${panel}`}>
          <div className="relative aspect-square w-full bg-[#181c2c]">
            <canvas ref={eye} width={SIZE} height={SIZE} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" role="img" aria-label={t.eye} data-testid="headcam-eye" />
            <svg viewBox="-1 -1 2 2" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {status.keys.slice(0, K).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.05} fill={DOTS[i]} stroke="#000" strokeWidth={0.014} />)}
            </svg>
          </div>
          <figcaption className="px-2 py-1.5 font-mono text-[10.5px] leading-snug text-muted-foreground">{kind === "open" ? t.eyeOnce : t.eyeNow}</figcaption>
        </figure>

        {/* How it is doing, bottom left. */}
        <div className={`absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 ${panel}`} role="status" data-testid="headcam-status-panel">
          <span className={`size-2 rounded-full ${status.there ? "bg-signal" : "animate-pulse bg-signal-2"}`} aria-hidden />
          <span className="font-sans text-[13px]" data-testid="headcam-status">{status.there ? t.there : kind === "open" && status.phase !== "go" ? t.homing : t.going}</span>
          <span className="font-mono text-[13px] tabular text-muted-foreground" data-testid="headcam-gap">{(status.gap * 100).toFixed(1)} cm</span>
        </div>

        {/* Play and reset, bottom right. */}
        <div className="absolute right-3 bottom-3 flex gap-1.5">
          <Button size="icon-sm" variant="outline" className="bg-background/75 backdrop-blur-md" aria-label={running ? t.pause : t.play} onClick={() => setPlaying(!running)}>{running ? <Pause /> : <Play />}</Button>
          <Button size="icon-sm" variant="outline" className="bg-background/75 backdrop-blur-md" aria-label={t.reset} onClick={reset}><RotateCcw /></Button>
        </div>
        {!touched && policies && <p className="label pointer-events-none absolute inset-x-0 bottom-14 text-center">{t.benchHint}</p>}
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <fieldset className="grid gap-4">
          <legend className="mb-3 font-sans text-[13px] font-semibold">{t.cameraGroup}</legend>
          <Param label={t.pitch} shown={`${pitch}°`} value={pitch} min={-10} max={20} step={1} onChange={setPitch} />
          <Param label={t.yaw} shown={`${yaw}°`} value={yaw} min={-20} max={20} step={1} onChange={setYaw} />
        </fieldset>
        <fieldset className="grid gap-4">
          <legend className="mb-3 font-sans text-[13px] font-semibold">{t.pictureGroup}</legend>
          <Param label={t.noise} shown={noise.toFixed(2)} value={noise} min={0} max={0.15} step={0.01} onChange={setNoise} />
          <Param label={t.light} shown={`${Math.round(light * 100)}%`} value={light} min={0.5} max={1.2} step={0.05} onChange={setLight} />
        </fieldset>
      </div>
      <p className="text-muted-foreground">{t.dots}</p>
    </div>
  );
}
