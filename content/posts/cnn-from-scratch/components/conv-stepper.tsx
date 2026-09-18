"use client";

import { useEffect, useState } from "react";
import { Controls } from "@/components/lab/controls";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";

const N = 6;
const K = 3;
const OUT = N - K + 1;

// A bright vertical bar on a dark field, so the vertical-edge kernel has something to find.
const INPUT = [
  0, 0, 1, 1, 0, 0,
  0, 0, 1, 1, 0, 0,
  0, 0, 1, 1, 0, 0,
  0, 0, 1, 1, 0, 0,
  0, 1, 1, 0, 0, 0,
  0, 1, 1, 0, 0, 0,
];
const KERNEL = [-1, 0, 1, -1, 0, 1, -1, 0, 1];

function windowAt(pos: number) {
  const oy = Math.floor(pos / OUT);
  const ox = pos % OUT;
  const values = KERNEL.map((_, k) => INPUT[(oy + Math.floor(k / K)) * N + ox + (k % K)]);
  return { oy, ox, values, sum: values.reduce((s, v, k) => s + v * KERNEL[k], 0) };
}

export function ConvStepper() {
  const t = useLabels();
  const reduced = useReducedMotion();
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const { ox, oy, values, sum } = windowAt(pos);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setPos((p) => (p + 1) % (OUT * OUT)),
      reduced ? 1400 : 700,
    );
    return () => clearInterval(id);
  }, [playing, reduced]);

  const inWindow = (i: number) => {
    const y = Math.floor(i / N), x = i % N;
    return y >= oy && y < oy + K && x >= ox && x < ox + K;
  };

  const cell = "grid aspect-square place-items-center rounded-[2px] border font-mono text-xs tabular sm:text-sm";

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-[6fr_3fr_4fr] items-center gap-4 sm:gap-8">
        <div>
          <div className="grid grid-cols-6 gap-0.5" role="img" aria-label={`${t.input} 6×6`}>
            {INPUT.map((v, i) => (
              <span
                key={i}
                className={cn(
                  cell,
                  inWindow(i) ? "border-signal bg-signal/15 text-foreground" : "border-border text-muted-foreground",
                  v === 1 && !inWindow(i) && "bg-muted text-foreground",
                )}
              >
                {v}
              </span>
            ))}
          </div>
          <p className="label mt-1.5">{t.input} 6×6</p>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-0.5">
            {KERNEL.map((v, i) => (
              <span key={i} className={cn(cell, "border-border", v > 0 && "text-signal", v < 0 && "text-signal-2")}>
                {v}
              </span>
            ))}
          </div>
          <p className="label mt-1.5">{t.kernel}</p>
        </div>

        <div>
          <div className="grid grid-cols-4 gap-0.5" role="img" aria-label={`${t.output} 4×4`}>
            {Array.from({ length: OUT * OUT }, (_, i) => {
              const done = i <= pos;
              const v = windowAt(i).sum;
              return (
                <span
                  key={i}
                  className={cn(
                    cell,
                    i === pos ? "border-signal bg-signal/15" : "border-border",
                    done && v > 0 && "text-signal",
                    done && v < 0 && "text-signal-2",
                    !done && "text-transparent",
                  )}
                >
                  {done ? v : 0}
                </span>
              );
            })}
          </div>
          <p className="label mt-1.5">{t.output} 4×4</p>
        </div>
      </div>

      <p className="rounded-sm border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed tabular sm:text-[0.8125rem]" aria-live="off">
        {values.map((v, k) => (
          <span key={k} className={cn("whitespace-nowrap", KERNEL[k] === 0 && "text-muted-foreground")}>
            {k > 0 && <span className="text-muted-foreground"> + </span>}
            {v}·<span className={cn(KERNEL[k] > 0 && "text-signal", KERNEL[k] < 0 && "text-signal-2")}>({KERNEL[k]})</span>
          </span>
        ))}
        <span className="text-muted-foreground"> = </span>
        <strong className={cn(sum > 0 && "text-signal", sum < 0 && "text-signal-2")}>{sum}</strong>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Controls
          playing={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onStep={() => setPos((p) => (p + 1) % (OUT * OUT))}
          onReset={() => {
            setPlaying(false);
            setPos(0);
          }}
          labels={t}
        />
        <span className="label">
          {t.position} ({oy}, {ox}) · {pos + 1}/{OUT * OUT}
        </span>
      </div>
    </div>
  );
}
