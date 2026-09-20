"use client";

import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { Param } from "./param";
import { type CameraShift, expert, type ExpertState, NO_SHIFT, PARAMS, render, sentence, encode, World, type WorldEvent } from "./sim";

const BIG = 384, STEP_MS = 140, TILT: CameraShift = { ...NO_SHIFT, yaw: (5 * Math.PI) / 180 };

function paint(canvas: HTMLCanvasElement | null, bytes: Uint8Array, size: number) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const image = context.createImageData(size, size);
  for (let i = 0, o = 0; i < bytes.length; i += 3, o += 4) { image.data[o] = bytes[i]; image.data[o + 1] = bytes[i + 1]; image.data[o + 2] = bytes[i + 2]; image.data[o + 3] = 255; }
  context.putImageData(image, 0, 0);
}

/**
 * The world and the scripted expert, drawn by the same rasteriser that makes the model's 48 × 48 view. No model and no
 * three.js here: this is the bench the rest of the article stands on, and the reader can already get in its way.
 */
export function ExpertLab() {
  const t = useLabels(), reduced = useReducedMotion(), english = t.play === "Play";
  const big = useRef<HTMLCanvasElement>(null), eye = useRef<HTMLCanvasElement>(null), root = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null), seed = useRef(1), tilted = useRef(false), slip = useRef<number>(PARAMS.slip), pausedUntil = useRef(0);
  const [playing, setPlaying] = useState<boolean | null>(null), [slipShown, setSlipShown] = useState<number>(PARAMS.slip), [tilt, setTilt] = useState(false);
  const [shown, setShown] = useState<{ words: string; state: ExpertState; step: number; outcome: "running" | "success" | "failed"; event: WorldEvent | null }>({ words: "", state: "done", step: 0, outcome: "running", event: null });
  const running = playing ?? !reduced, live = useRef(running);
  useEffect(() => { live.current = running; });

  useEffect(() => {
    let timer = 0, visible = true, last: WorldEvent | null = null;
    const fresh = () => { const w = new World(seed.current++); w.slipRate = slip.current; world.current = w; last = null; };
    const draw = () => {
      const w = world.current as World, shift = tilted.current ? TILT : NO_SHIFT;
      paint(big.current, render(w, shift, BIG, 1), BIG); paint(eye.current, render(w, shift), PARAMS.image);
      setShown({ words: sentence(encode(w.task), english), state: expert(w).state, step: w.t, outcome: w.success ? "success" : w.failed ? "failed" : "running", event: last });
    };
    const tick = () => {
      timer = window.setTimeout(tick, STEP_MS);
      const w = world.current as World;
      if (!visible || document.hidden || !live.current || performance.now() < pausedUntil.current) return;
      if (w.success || w.failed) { fresh(); pausedUntil.current = performance.now() + 600; draw(); return; }
      w.slipRate = slip.current;
      w.step(expert(w).action);
      if (w.events.length) last = w.events[w.events.length - 1];
      if (w.success || w.failed) pausedUntil.current = performance.now() + 1200; // let the result be seen
      draw();
    };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: "100px" });
    if (root.current) io.observe(root.current);
    fresh(); draw();
    (root.current as (HTMLDivElement & { redraw?: () => void }) | null)!.redraw = draw;
    timer = window.setTimeout(tick, STEP_MS);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, [english]);

  const redraw = () => (root.current as (HTMLDivElement & { redraw?: () => void }) | null)?.redraw?.();
  const act = (f: (w: World) => void) => { if (world.current) { f(world.current); redraw(); } };

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="grid gap-4 grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <canvas ref={big} width={BIG} height={BIG} role="img" aria-label={t.big} className="aspect-square w-full rounded-sm bg-[#181c2c] [image-rendering:auto]" data-testid="vla-bench" />
        <div className="grid content-start gap-2">
          <canvas ref={eye} width={PARAMS.image} height={PARAMS.image} role="img" aria-label={t.eye} className="aspect-square w-full rounded-sm bg-[#181c2c] [image-rendering:pixelated]" data-testid="vla-eye" />
          <p className="label">{t.eyeLabel}</p>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Readout label={t.instruction} value={<span className="font-sans text-base" data-testid="vla-instruction">{shown.words}</span>} tone="plain" />
        <Readout label={t.state} value={<span className="font-sans text-base">{t.states[shown.state]}</span>} />
        <Readout label={t.step} value={`${shown.step} / ${PARAMS.maxSteps}`} tone="muted" />
        <Readout label={shown.event ? t.lastEvent : t.outcome} value={<span className="font-sans text-base" role="status">{shown.outcome !== "running" ? t[shown.outcome] : shown.event ? t.events[shown.event] : t.running}</span>} tone={shown.outcome === "failed" ? "alt" : "signal"} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setPlaying(!running)} data-testid="vla-play">{running ? <Pause aria-hidden /> : <Play aria-hidden />}{running ? t.pause : t.play}</Button>
        <Button size="sm" variant="ghost" onClick={() => act((w) => { const next = new World(seed.current++); next.slipRate = slip.current; world.current = next; void w; })}><SkipForward aria-hidden />{t.next}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.disturb}>
        <span className="label mr-1">{t.disturb}</span>
        <Button size="sm" variant="outline" onClick={() => act((w) => w.shoveArm())} data-testid="vla-shove">{t.shove}</Button>
        <Button size="sm" variant="outline" onClick={() => act((w) => w.nudgeBoard(w.task.nest))}>{t.nudge}</Button>
        <Button size="sm" variant="outline" onClick={() => act((w) => w.turnBoard(w.task.nest))} data-testid="vla-turn">{t.turn}</Button>
        <Button size="sm" variant={tilt ? "secondary" : "outline"} aria-pressed={tilt} onClick={() => { tilted.current = !tilt; setTilt(!tilt); redraw(); }}>{tilt ? t.cameraBack : t.camera}</Button>
      </div>
      <Param label={t.slip} shown={`${Math.round(slipShown * 100)}%`} value={slipShown} min={0} max={0.1} step={0.01} onChange={(v) => { slip.current = v; setSlipShown(v); }} />
    </div>
  );
}
