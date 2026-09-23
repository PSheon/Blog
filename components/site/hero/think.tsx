"use client";

import { useEffect, useRef, useState } from "react";
import { HeatCanvas } from "@/components/lab/heat-canvas";
import { runWhenSeen } from "@/components/lab/run-when-seen";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Trainer } from "@/content/posts/transformer-from-scratch/components/task";
import { StationReset } from "./reset";
import { mulberry32 } from "@/lib/ml";

const PROBLEM = [3, 1, 4, 1, 5, 9], WANT = [...PROBLEM].reverse();

interface View { steps: number; output: number[]; map: Float64Array | null; done: boolean }

const N = PROBLEM.length;
/**
 * The part of an attention map that answers "which input digit is each output digit looking at": rows are the six
 * positions that write the answer (the "→" and the first five answer digits), columns the six input digits. Of the
 * layer's heads, the one that does the reversing is shown: the one with most weight on the anti-diagonal.
 */
function lookup(heads: Float64Array[], T: number): Float64Array | null {
  let best: Float64Array | null = null, bestScore = -1;
  for (const head of heads) {
    const part = new Float64Array(N * N);
    let score = 0;
    for (let k = 0; k < N; k++) for (let c = 0; c < N; c++) {
      const v = head[(N + k) * T + c];
      part[k * N + c] = v;
      if (c === N - 1 - k) score += v;
    }
    if (score > bestScore) { bestScore = score; best = part; }
  }
  return best;
}

/**
 * "Think": article 004's one-layer Transformer, trained from random weights while you watch. It learns to write six
 * digits backwards in a couple of seconds, and the attention map grows the anti-diagonal that does it.
 */
export default function HeroThink({ t }: { t: { steps: string; input: string; output: string; attention: string; again: string } }) {
  const [view, setView] = useState<View>({ steps: 0, output: [], map: null, done: false });
  const [run, setRun] = useState(0);

  const root = useRef<HTMLDivElement>(null), calm = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const trainer = new Trainer("reverse", mulberry32(7 + run));
    let frame = 0, streak = 0, finished = false;
    const loop = () => {
      const deadline = performance.now() + 10;
      do trainer.step(); while (performance.now() < deadline);
      const g = trainer.generate(PROBLEM), right = g.output.every((d, i) => d === WANT[i]);
      streak = right ? streak + 1 : 0;
      // Getting the answer right comes early; the clean anti-diagonal on the map, which is the point of the picture,
      // takes a few hundred steps more. Then stop spending the reader's battery.
      const done = (trainer.steps >= 700 && streak > 30 && trainer.accuracy(12) === 1) || trainer.steps > 4000;
      // With reduced motion the map does not flicker its way there: it trains out of sight and the finished picture appears once.
      if (!calm || done) setView({ steps: trainer.steps, output: g.output, map: lookup(g.attention[0] ?? [], g.tokens.length), done });
      if (done) finished = true; else frame = requestAnimationFrame(loop);
    };
    // It trains only while it can be seen and the tab is in front (DESIGN §2).
    return runWhenSeen(el, () => { if (!finished) frame = requestAnimationFrame(loop); }, () => cancelAnimationFrame(frame));
  }, [run, calm]);

  // Six boxes share whatever width the column has (it is narrow on a phone and on a small laptop alike), up to 1.75rem each.
  const box = "grid aspect-square w-full place-items-center rounded-sm border bg-background text-[clamp(0.75rem,4.2cqw,1.25rem)] leading-none";
  const row = "grid max-w-[12.5rem] grid-cols-6 gap-1";
  return (
    <div ref={root} data-station="think" className="@container grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 sm:gap-5">
      <div className="mx-auto w-full max-w-[15rem]">
        {/* Input digits along the top, the answer down the side: a trained model lights the anti-diagonal. */}
        <div className="grid grid-cols-[1rem_1fr] gap-1 font-mono text-[0.7rem] text-muted-foreground">
          <span />
          <div className="grid grid-cols-6">{PROBLEM.map((d, i) => <span key={i} className="text-center">{d}</span>)}</div>
          <div className="grid grid-rows-6">{WANT.map((d, i) => <span key={i} className="grid place-items-center text-signal">{d}</span>)}</div>
          <HeatCanvas data={view.map} w={view.map ? N : 1} h={view.map ? N : 1} max={1} label={t.attention} />
        </div>
        <p className="label mt-1.5 text-center">{t.attention}</p>
      </div>
      <div className="grid min-w-0 gap-3 font-mono sm:gap-4">
        <div>
          <p className="label mb-1.5">{t.input}</p>
          <p className={row}>{PROBLEM.map((d, i) => <span key={i} className={`${box} border-border`}>{d}</span>)}</p>
        </div>
        <div>
          <p className="label mb-1.5">{t.output}</p>
          <p className={row} data-testid="hero-think-output">
            {WANT.map((want, i) => {
              const got = view.output[i];
              return <span key={i} className={`${box} ${got === want ? "border-signal text-signal" : "border-border text-muted-foreground"}`}>{got ?? "·"}</span>;
            })}
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
          <span className="label">{t.steps}</span>
          <span className="tabular text-signal-3">{view.steps.toLocaleString()}</span>
          <StationReset label={t.again} onClick={() => setRun((r) => r + 1)} testId="hero-think-again" />
        </p>
      </div>
    </div>
  );
}
