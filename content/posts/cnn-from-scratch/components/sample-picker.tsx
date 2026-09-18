"use client";

import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Labels } from "./labels";
import { setStrokes } from "./store";
import { SAMPLES } from "./strokes";

/** Keyboard-reachable input: load an example digit, or clear the canvas. */
export function SamplePicker({ t, digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }: { t: Labels; digits?: number[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label mr-1">{t.samples}</span>
      {digits.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setStrokes(SAMPLES[d])}
          className="grid size-7 place-items-center rounded-sm border border-border bg-background font-mono text-xs transition-colors hover:border-signal hover:text-signal"
        >
          {d}
        </button>
      ))}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setStrokes([])}>
        <Eraser />
        {t.clear}
      </Button>
    </div>
  );
}
