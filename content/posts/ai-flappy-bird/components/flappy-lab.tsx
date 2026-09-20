"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Sparkline } from "@/components/lab/sparkline";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Brain } from "./brain";
import { useLabels } from "./labels";
import { draw, readPalette } from "./render";
import { FlappyWorld, WORLD } from "./world";

const SPEEDS = [1, 2, 5, 10, "max"] as const;
type Speed = (typeof SPEEDS)[number];

interface Snapshot {
  generation: number;
  alive: number;
  score: number;
  best: number;
  history: number[];
  weights: number[] | null;
  activations: number[][] | null;
}

function snapshot(world: FlappyWorld): Snapshot {
  const leader = world.leader;
  return {
    generation: world.generation,
    alive: world.alive,
    score: world.passed,
    best: world.best,
    history: world.history,
    weights: leader ? Array.from(leader.brain.weights) : null,
    activations: leader ? leader.brain.activations.map((a) => Array.from(a)) : null,
  };
}

export function FlappyLab() {
  const t = useLabels();
  const reduced = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<FlappyWorld | null>(null);
  const speedRef = useRef<Speed>(1);
  const [speed, setSpeed] = useState<Speed>(1);
  // null = follow the reader's motion preference until they press the button themselves.
  const [wantPlaying, setWantPlaying] = useState<boolean | null>(null);
  const playing = wantPlaying ?? !reduced;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  // Bumped on restart so the loop below picks up the fresh world.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const world = (worldRef.current ??= new FlappyWorld());
    const palette = readPalette(canvas);
    let frame = 0;
    let visible = true;

    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1); // a 3× phone would draw 2.25 times the pixels for nothing
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      draw(ctx, world, palette, w / WORLD.width);
      setSnap(snapshot(world));
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible) return;
      const s = speedRef.current;
      if (s === "max") {
        // As many ticks as fit in a slice of the frame, so the page stays responsive.
        const deadline = performance.now() + 10;
        while (performance.now() < deadline) world.step();
      } else {
        for (let i = 0; i < s; i++) world.step();
      }
      paint();
    };

    // Don't burn a core on an instrument nobody is looking at. Watch the whole instrument,
    // not the canvas: on a phone the controls and readouts sit a screen below it.
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(rootRef.current ?? canvas);
    paint();
    if (playing) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [playing, resolvedTheme, epoch]);

  const restart = () => {
    worldRef.current = new FlappyWorld();
    setEpoch((e) => e + 1);
    setWantPlaying(true);
  };

  return (
    <div ref={rootRef} className="grid gap-5 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-7">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t.canvas}
        data-testid="flappy-canvas"
        className="mx-auto block w-full max-w-[19rem] rounded-sm border border-border bg-background"
        style={{ aspectRatio: `${WORLD.width} / ${WORLD.height}` }}
      />

      <div className="grid content-start gap-5">
        <div className="grid grid-cols-4 gap-3">
          <Readout label={t.generation} value={<span data-testid="flappy-generation">{snap?.generation ?? 1}</span>} large />
          <Readout label={t.alive} value={snap?.alive ?? 50} tone="plain" />
          <Readout label={t.score} value={snap?.score ?? 0} tone="plain" />
          <Readout label={t.best} value={snap?.best ?? 0} tone="alt" />
        </div>

        <div>
          <p className="label mb-1">{t.brain}</p>
          <div className="max-w-[26rem]">
            <Brain weights={snap?.weights ?? null} activations={snap?.activations ?? null} t={t} />
          </div>
          <p className="label flex gap-4">
            <span><span className="text-signal">━</span> {t.positive}</span>
            <span><span className="text-signal-2">━</span> {t.negative}</span>
          </p>
        </div>

        <div>
          <p className="label mb-1">{t.history}</p>
          {snap && snap.history.length > 0 ? (
            <Sparkline values={snap.history} label={t.history} />
          ) : (
            <p className="grid h-14 place-items-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
              {t.historyEmpty}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-4 md:col-span-2">
        <Button size="sm" variant="outline" onClick={() => setWantPlaying(!playing)}>
          {playing ? <Pause /> : <Play />}
          {playing ? t.pause : t.play}
        </Button>
        <div className="flex items-center gap-1.5" role="group" aria-label={t.speed}>
          <span className="label mr-1">{t.speed}</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => {
                speedRef.current = s;
                setSpeed(s);
              }}
              className={cn(
                "h-7 min-w-9 rounded-sm border px-1.5 font-mono text-xs transition-colors",
                speed === s ? "border-signal bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "max" ? t.max : `×${s}`}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={restart}>
          <RotateCcw />
          {t.restart}
        </Button>
      </div>
    </div>
  );
}
