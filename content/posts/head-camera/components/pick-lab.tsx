"use client";

import { Pause, Play, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNear } from "@/components/lab/use-near";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { NO_SHIFT, type Vec3, type XY } from "./model";
import { Param } from "./param";
import { K, PICK_HOME, PICK_SIZE, PickPolicy, type PickState, STEP_XY, STEP_Z, decide, inBlockArea, layout, pickAct, pickBones, pickPicture, pickView, usable } from "./pick";
import type { BenchView, Target } from "./view3d";

const STEP_MS = 150;
const DOTS = ["#ffff00", "#00ff00", "#ff00ff", "#ffffff", "#000000", "#ff8000", "#00a0ff", "#a0ffa0"];
const deg = Math.PI / 180;
const DRIVERS = ["shaken", "fixed", "open"] as const;
type Driver = (typeof DRIVERS)[number];
const START: { block: XY; pad: XY } = { block: [0.44, 0.14], pad: [0.3, -0.12] };

interface World {
  s: PickState; from: Vec3; at: number; jaws: number;
  /** look-once: going home to look, or working from what it saw. */
  phase: "home" | "work"; belief: { block: XY; pad: XY } | null;
  done: boolean; seen: Float64Array | null; keys: XY[];
  drag: Target | "orbit" | null; px: number; py: number;
}
const fresh = (layout = START): World => ({ s: { hand: [...PICK_HOME], closed: false, holding: false, block: [...layout.block], pad: [...layout.pad] }, from: [...PICK_HOME], at: 0, jaws: 0, phase: "home", belief: null, done: false, seen: null, keys: [], drag: null, px: 0, py: 0 });

/** Paint what the network was shown: channel-first 0…1, with the reader's noise and light already in it. */
function paint(canvas: HTMLCanvasElement | null, picture: Float64Array) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const image = context.createImageData(PICK_SIZE, PICK_SIZE), n = PICK_SIZE * PICK_SIZE;
  for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) image.data[i * 4 + c] = Math.round(picture[c * n + i] * 255); image.data[i * 4 + 3] = 255; }
  context.putImageData(image, 0, 0);
}

/**
 * Fig. 01: pick the block up and put it on the pad, from the head camera alone. The reader drags the block and the pad,
 * knocks the camera, and switches between three checkpoints: look-once, keep-looking, and keep-looking trained with a
 * shaken camera.
 */
export function PickLab() {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), eye = useRef<HTMLCanvasElement>(null);
  const near = useNear(root), reduced = useReducedMotion();
  const [policies, setPolicies] = useState<Record<Driver, PickPolicy> | null>(null), [failed, setFailed] = useState(false), [no3d, setNo3d] = useState(false);
  const [driver, setDriver] = useState<Driver>("shaken"), [pitch, setPitch] = useState(0), [yaw, setYaw] = useState(0);
  const [noise, setNoise] = useState(0), [light, setLight] = useState(1), [playing, setPlaying] = useState<boolean | null>(null), [touched, setTouched] = useState(false);
  const [status, setStatus] = useState({ what: "fetch" as "fetch" | "carry" | "placed" | "home", placed: 0, keys: [] as XY[] });
  const running = playing ?? !reduced;
  const world = useRef<World>(fresh()), placed = useRef(0);
  const knobs = useRef({ driver, pitch, yaw, noise, light, running });
  useEffect(() => { knobs.current = { driver, pitch, yaw, noise, light, running }; }, [driver, pitch, yaw, noise, light, running]);

  useEffect(() => {
    if (!near || policies) return;
    // One hiccup should not leave the figure dead: each checkpoint is tried three times, a second apart.
    const load = async (d: Driver) => {
      for (let attempt = 0; ; attempt++) {
        try { const r = await fetch(`/posts/head-camera/pick-${d}.json`); if (!r.ok) throw new Error(`${d}: ${r.status}`); return await r.json(); }
        catch (error) { if (attempt === 2) throw error; await new Promise((ok) => setTimeout(ok, 1000)); }
      }
    };
    Promise.all(DRIVERS.map(load))
      .then((saved) => setPolicies(Object.fromEntries(DRIVERS.map((d, i) => [d, new PickPolicy(saved[i])])) as Record<Driver, PickPolicy>))
      .catch(() => setFailed(true));
  }, [near, policies]);

  /** Something changed under look-once's feet: let go, go home, look again. */
  const relook = () => { const w = world.current; w.phase = "home"; w.belief = null; w.done = false; };
  useEffect(relook, [driver]);

  useEffect(() => {
    if (!policies || !canvas.current) return;
    let bench: BenchView | null = null, frame = 0, alive = true, visible = true, last = performance.now();
    // Read the LAST entry: when the page is busy a batch can hold "out of view" and then "in view" for the same canvas,
    // and taking the first left the figure paused in plain sight (it showed up as one stalled run in forty).
    const io = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; }, { rootMargin: "100px" });
    io.observe(canvas.current);

    const step = () => {
      const w = world.current, k = knobs.current, policy = policies[k.driver], shift = { ...NO_SHIFT, pitch: k.pitch * deg, yaw: k.yaw * deg }, s = w.s;
      w.from = [...s.hand];
      if (!w.done) {
        if (policy.kind === "open" && w.phase === "home") {
          // Let go of whatever it holds, go home, then take the one picture.
          if (s.holding || s.closed) { s.holding = false; s.closed = false; s.block = inBlockArea(s.block); if (!usable(s.block)) s.block = [...START.block]; }
          const d: Vec3 = [PICK_HOME[0] - s.hand[0], PICK_HOME[1] - s.hand[1], PICK_HOME[2] - s.hand[2]];
          if (Math.hypot(...d) < 1e-6) {
            const image = pickPicture(pickView(s, shift), k.noise, k.light), r = policy.run(image, []);
            w.belief = PickPolicy.believed(r.out); w.seen = image; w.keys = r.keypoints; w.phase = "work";
          } else pickAct(s, [d[0] / STEP_XY, d[1] / STEP_XY, d[2] / STEP_Z, 0]);
        } else {
          const r = decide(policy, s, shift, w.belief, { noise: k.noise, dim: k.light });
          if (r.image) { w.seen = r.image; w.keys = r.keypoints ?? []; }
          if (pickAct(s, r.action) === "placed") { w.done = true; placed.current++; }
        }
      }
      else {
        // Job done: back out of the way, so the reader can see the block on the pad and reach both.
        const d: Vec3 = [PICK_HOME[0] - s.hand[0], PICK_HOME[1] - s.hand[1], PICK_HOME[2] - s.hand[2]];
        if (Math.hypot(...d) > 1e-6) pickAct(s, [s.hand[2] > 0.08 ? d[0] / STEP_XY : 0, s.hand[2] > 0.08 ? d[1] / STEP_XY : 0, d[2] / STEP_Z, 0]);
      }
      if (w.seen) paint(eye.current, w.seen);
      setStatus({ what: w.done ? "placed" : policy.kind === "open" && w.phase === "home" ? "home" : s.holding ? "carry" : "fetch", placed: placed.current, keys: w.keys });
    };

    const tick = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      if (!visible) return;
      const w = world.current, k = knobs.current, s = w.s;
      // The model runs whether or not the 3D view exists: without WebGL the camera's picture and the status still work.
      if (k.running && now - last >= STEP_MS) { last = now; w.at = now; step(); }
      if (!bench) return;
      const f = k.running ? Math.min(1, (now - w.at) / STEP_MS) : 1, hand: Vec3 = [w.from[0] + (s.hand[0] - w.from[0]) * f, w.from[1] + (s.hand[1] - w.from[1]) * f, w.from[2] + (s.hand[2] - w.from[2]) * f];
      w.jaws += ((s.closed ? 1 : 0) - w.jaws) * 0.3;
      const open = k.driver === "open" && w.phase === "work" && w.belief;
      bench.render({
        bones: pickBones(hand), jaws: w.jaws, pad: s.pad,
        block: s.holding ? hand : [s.block[0], s.block[1], 0.02],
        ghostBlock: open && !s.holding ? w.belief!.block : null, ghostPad: open ? w.belief!.pad : null,
        held: w.drag === "block" || w.drag === "pad" ? w.drag : null, look: { yaw: k.yaw * deg, pitch: k.pitch * deg }, time: now,
      });
    };
    import("./view3d").then(({ BenchView }) => BenchView.create(canvas.current!, "pick")).then((b) => { if (alive) bench = b; else b.dispose(); }).catch(() => { if (alive) setNo3d(true); });
    frame = requestAnimationFrame(tick);

    const c = canvas.current, ndc = (e: PointerEvent): XY => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]; };
    const down = (e: PointerEvent) => {
      if (!bench) return;
      const w = world.current, [x, y] = ndc(e), target = bench.grabs(x, y);
      w.drag = target ?? "orbit"; w.px = e.clientX; w.py = e.clientY;
      if (target === "block" && w.s.holding) { w.s.holding = false; } // pulled out of its hand: it is left closed on nothing
      if (target) { bench.hover(target); bench.stopHinting(); setTouched(true); }
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const w = world.current;
      if (!bench) return;
      const [x, y] = ndc(e);
      if (!w.drag) { const over = bench.grabs(x, y); bench.hover(over); c.style.cursor = over ? "grab" : ""; return; }
      if (w.drag === "orbit") { bench.orbit(e.clientX - w.px, e.clientY - w.py); w.px = e.clientX; w.py = e.clientY; return; }
      const p = bench.benchAt(x, y, w.drag === "block" ? 0.02 : 0);
      if (!p) return;
      // The block stays where the head camera can see it past the arm (BLOCK_AREA); the pad may go anywhere.
      const q: XY = w.drag === "block" ? inBlockArea(p) : [Math.max(0.22, Math.min(0.5, p[0])), Math.max(-0.22, Math.min(0.22, p[1]))];
      if (!usable(q)) return;
      if (w.drag === "block") w.s.block = q; else w.s.pad = q;
      w.done = false;
    };
    const up = () => {
      const w = world.current;
      // A block left behind in the arm's shadow (it was placed on a pad there, and the pad has been taken away) comes back in.
      if (w.drag === "pad" && !w.s.holding && Math.hypot(w.s.block[0] - w.s.pad[0], w.s.block[1] - w.s.pad[1]) > 0.03) w.s.block = inBlockArea(w.s.block);
      if ((w.drag === "block" || w.drag === "pad") && knobs.current.driver === "open") relook();
      w.drag = null;
      bench?.hover(null);
    };
    const themes = new MutationObserver(() => bench?.retheme());
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => {
      alive = false; cancelAnimationFrame(frame); io.disconnect(); themes.disconnect(); bench?.dispose();
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up);
    };
  }, [policies]);

  /** A new layout: block and pad somewhere else, everything back to the start. */
  const shuffle = () => { world.current = { ...fresh(layout(Math.random)), jaws: world.current.jaws }; };

  const panel = "rounded-md border border-border/70 bg-background/75 shadow-sm backdrop-blur-md";
  const names: Record<Driver, string> = { shaken: t.pickShaken, fixed: t.pickFixed, open: t.open };
  const words = { fetch: t.pickFetch, carry: t.pickCarry, placed: t.pickPlaced, home: t.homing };
  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-border bg-background sm:aspect-[16/10]">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing" role="img" aria-label={t.pickBench} data-testid="headcam-pick" />
        {!policies && <p className="absolute inset-0 grid place-items-center text-muted-foreground" role={failed ? "alert" : "status"}>{failed ? t.failed : t.loading}</p>}
        {no3d && <p className="absolute inset-0 grid place-items-center px-8 text-center text-muted-foreground" role="alert">{t.no3d}</p>}
        <div className={`absolute top-3 left-3 flex max-w-[60%] flex-wrap gap-0.5 p-0.5 ${panel}`} role="group" aria-label={t.policy}>
          {DRIVERS.map((d) => (
            <button key={d} type="button" aria-pressed={driver === d} onClick={() => setDriver(d)} data-testid={`headcam-pick-${d}`}
              className={`rounded-[5px] px-2.5 py-1 text-left font-sans text-[13px] transition-colors ${driver === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              {names[d]}
            </button>
          ))}
        </div>
        <figure className={`absolute top-3 right-3 w-[32%] max-w-[190px] overflow-hidden ${panel}`}>
          <div className="relative aspect-square w-full bg-[#181c2c]">
            <canvas ref={eye} width={PICK_SIZE} height={PICK_SIZE} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" role="img" aria-label={t.pickEye} data-testid="headcam-pick-eye" />
            <svg viewBox="-1 -1 2 2" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {status.keys.slice(0, K).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.045} fill={DOTS[i]} stroke="#000" strokeWidth={0.014} />)}
            </svg>
          </div>
          <figcaption className="px-2 py-1.5 font-mono text-[10.5px] leading-snug text-muted-foreground">{driver === "open" ? t.pickEyeOnce : t.pickEyeNow}</figcaption>
        </figure>
        <div className={`absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 ${panel}`} role="status">
          <span className={`size-2 rounded-full ${status.what === "placed" ? "bg-signal" : "animate-pulse bg-signal-2"}`} aria-hidden />
          <span className="font-sans text-[13px]" data-testid="headcam-pick-status">{words[status.what]}</span>
          <span className="font-mono text-[13px] tabular text-muted-foreground" data-testid="headcam-pick-count">{t.pickCount(status.placed)}</span>
        </div>
        <div className="absolute right-3 bottom-3 flex gap-1.5">
          <Button size="icon-sm" variant="outline" className="bg-background/75 backdrop-blur-md" aria-label={running ? t.pause : t.play} onClick={() => setPlaying(!running)}>{running ? <Pause /> : <Play />}</Button>
          <Button size="icon-sm" variant="outline" className="bg-background/75 backdrop-blur-md" aria-label={t.pickShuffle} onClick={shuffle} data-testid="headcam-pick-shuffle"><Shuffle /></Button>
        </div>
        {!touched && policies && <p className="label pointer-events-none absolute inset-x-0 bottom-14 text-center">{t.pickHint}</p>}
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
    </div>
  );
}
