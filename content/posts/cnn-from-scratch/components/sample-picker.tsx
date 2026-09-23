"use client";

import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Labels } from "./labels";
import { setStrokes } from "./store";
import { SAMPLES } from "./strokes";

/**
 * Keyboard-reachable input: load an example digit, or clear the canvas.
 *
 * It has to stay one row. Label plus six digits plus a worded button is about 330 px, which fits the instrument on
 * a desktop and not on a phone — and wrapped, the eraser ended up on a line of its own under the digits. So the
 * pieces that are only there for comfort go as the panel narrows: the group's label first, then the word beside the
 * eraser, which holds on down to a 17rem panel so that on a phone this control still reads the way the other
 * stations' reset buttons do. The container query asks about the panel, not the window: this sits in the hero on a
 * laptop as well as in the article on a phone.
 */
export function SamplePicker({ t, digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }: { t: Labels; digits?: number[] }) {
  return (
    <div className="@container">
      <div className="flex items-center gap-1.5">
        <span className="label mr-1 hidden @[19rem]:inline">{t.samples}</span>
        <div role="group" aria-label={t.samples} className="flex items-center gap-1.5">
          {digits.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setStrokes(SAMPLES[d])}
              className="tap grid size-6 place-items-center rounded-sm border border-border bg-background font-mono text-xs transition-colors hover:border-signal hover:text-signal @[19rem]:size-7"
            >
              {d}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" aria-label={t.clear} className="ml-auto" onClick={() => setStrokes([])}>
          <Eraser />
          <span className="hidden @[17rem]:inline">{t.clear}</span>
        </Button>
      </div>
    </div>
  );
}
