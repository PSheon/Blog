"use client";

import { useEffect, useRef, useState } from "react";
import { runWhenSeen } from "@/components/lab/run-when-seen";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { draw, readPalette } from "@/content/posts/ai-flappy-bird/components/render";
import { FlappyWorld, WORLD } from "@/content/posts/ai-flappy-bird/components/world";
import { StationReset } from "./reset";

/**
 * "Act": article 002's flock. Fifty birds with random 2-2-1 brains; the ones that last longest breed the next
 * generation. Runs at two and a half times the article's normal speed, by the clock, so that a reader sees a few generations die
 * before the first one flies.
 */
export default function HeroAct({ t }: { t: { generation: string; alive: string; best: string; again: string } }) {
  const canvas = useRef<HTMLCanvasElement>(null), still = useReducedMotion();
  const [seen, setSeen] = useState({ generation: 1, alive: 50, best: 0 });
  // Bumping this restarts the effect below with a brand new flock, which is what "evolve again" means here.
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const world = new FlappyWorld(), palette = readPalette(el);
    // By the clock, not by the frame: three ticks a frame was 180 a second on a 60 Hz screen and 360 on a 120 Hz one,
    // which is where it looked frantic. 150 a second everywhere: a generation of beginners still dies in a second or
    // two, and a bird that has learned can be followed by eye.
    const TICKS_PER_SECOND = 150;
    let frame = 0, n = 0, last = 0, owed = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      owed += Math.min(0.1, last ? (now - last) / 1000 : 0) * TICKS_PER_SECOND;
      last = now;
      for (; owed >= 1; owed--) world.step();
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(el.clientWidth * dpr), h = Math.round(el.clientHeight * dpr);
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      draw(ctx, world, palette, w / WORLD.width);
      if (n++ % 6 === 0) setSeen({ generation: world.generation, alive: world.alive, best: Math.max(world.best, world.passed) });
    };
    if (still) { draw(ctx, world, palette, (el.width = Math.round(el.clientWidth)) / WORLD.width); return; }
    // Off screen or in a background tab the flock waits; `last` is forgotten so the pause is not paid back as ticks.
    return runWhenSeen(el, () => { last = 0; frame = requestAnimationFrame(loop); }, () => cancelAnimationFrame(frame));
  }, [still, run]);

  return (
    // Sized by the panel (a container query). Narrow (every phone): the flock on top at full width, the three numbers
    // in a row under it. Wide: side by side, like the other stations.
    <div className="@container h-full">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3 @[26rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @[26rem]:grid-rows-1 @[26rem]:items-center @[26rem]:gap-5">
        {/* As large as fits both ways, at the world's own shape. */}
        <div className="grid h-full min-h-0 place-items-center [container-type:size]">
          <canvas ref={canvas} aria-hidden className="rounded-sm border border-border bg-background text-foreground" style={{ width: `min(100cqw, 100cqh * ${WORLD.width} / ${WORLD.height})`, aspectRatio: `${WORLD.width} / ${WORLD.height}` }} />
        </div>
        <dl className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-center gap-3 border-t border-border pt-3 font-mono @[26rem]:grid-cols-1 @[26rem]:gap-4 @[26rem]:border-t-0 @[26rem]:pt-0">
          {([[t.generation, seen.generation], [t.alive, seen.alive], [t.best, seen.best]] as const).map(([label, value], i) => (
            <div key={label} className="flex flex-col gap-1 @[26rem]:flex-row @[26rem]:items-baseline @[26rem]:justify-between @[26rem]:gap-2 @[26rem]:border-b @[26rem]:border-border @[26rem]:pb-2">
              <dt className="label">{label}</dt>
              <dd className={`tabular leading-none ${i === 0 ? "text-2xl text-signal-2 @[26rem]:text-4xl" : "text-2xl"}`}>{value}</dd>
            </div>
          ))}
          <StationReset label={t.again} onClick={() => { setSeen({ generation: 1, alive: 50, best: 0 }); setRun((n) => n + 1); }} testId="hero-act-again" />
        </dl>
      </div>
    </div>
  );
}
