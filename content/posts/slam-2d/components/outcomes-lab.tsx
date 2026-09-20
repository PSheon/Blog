"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { type Outcome, simulate } from "./outcomes";
import { OutcomesView } from "./outcomes-view3d";
import { PRESETS, type PresetId, applyPreset } from "./presets";
import { useVisible } from "./use-visible";

const CARDS: PresetId[] = ["noClosure", "drift", "camera", "wrong"];

/**
 * Fig. 05: the four ways it breaks, side by side. Each cell is the same two laps under a different setting, worked
 * out by the reader's browser when the figure scrolls into view; a button hands the setting to the car at the top.
 */
export function OutcomesLab() {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const [done, setDone] = useState<(Outcome | null)[]>([null, null, null, null]);

  useEffect(() => {
    let cancelled = false, view: OutcomesView | null = null, raf = 0;
    const onResize = () => view?.render();
    const start = async () => {
      const T = await import("three");
      if (cancelled || !canvas.current) return;
      view = new OutcomesView(T, canvas.current);
      window.addEventListener("resize", onResize);
      for (let i = 0; i < CARDS.length; i++) {
        const o = await simulate(PRESETS[CARDS[i]], () => cancelled);
        if (!o || cancelled) return;
        view.show(i, o);
        setDone((d) => d.map((v, j) => (j === i ? o : v)));
      }
    };
    // Wait until the figure is actually on screen: nobody should pay for this on page load.
    const wait = () => { if (visible.current && root.current && root.current.getBoundingClientRect().top < window.innerHeight) void start(); else raf = requestAnimationFrame(wait); };
    raf = requestAnimationFrame(wait);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); view?.dispose(); };
  }, [visible]);

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="relative">
        <canvas ref={canvas} className="aspect-[3/4] w-full rounded-md text-foreground sm:aspect-[16/10]" />
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[10px]">
          {CARDS.map((id, i) => (
            <div key={id} className="flex min-w-0 flex-col justify-between rounded-md border border-border p-2" data-testid={`slam-outcome-${id}`}>
              <div className="flex flex-col gap-0.5 self-start rounded bg-background/75 px-1.5 py-1 sm:w-full sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:bg-transparent sm:p-0">
                <span className="label">{t.cards[id]}</span>
                <span className="font-mono text-sm whitespace-nowrap tabular text-signal">{done[i] ? `${done[i]!.error.toFixed(2)} ${t.metres}` : t.computing}</span>
              </div>
              <Button size="sm" variant="outline" className="self-start bg-background/80" aria-label={`${t.cards[id]}: ${t.tryAbove}`} onClick={() => applyPreset(id)}>
                <span className="sm:hidden">{t.tryShort}</span>
                <span className="hidden sm:inline">{t.tryAbove}</span>
              </Button>
            </div>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground">{t.cardsNote}</p>
    </div>
  );
}
