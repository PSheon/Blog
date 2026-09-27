"use client";

import { ACTIVITIES } from "./sim";
import { FILL } from "./use-city";

/** Columns per day: one every ten minutes. */
export const SLOTS = 144;
const H = 60;
/** Walking and doing nothing are drawn lighter, so the four activities carry the picture. */
const WEIGHT: Record<(typeof ACTIVITIES)[number], number> = { sleep: 1, work: 1, eat: 1, social: 1, walking: 0.55, idle: 0.25 };

export type ActivityLayer = { columns: readonly (ArrayLike<number> | null)[]; opacity?: number };

/**
 * A day as stacked columns, one every ten minutes: what share of people were doing what, sleep at the bottom. One path
 * per activity and layer, not a rectangle per cell, so a live chart redrawn a few times a second stays cheap. Later
 * layers are drawn over earlier ones; `now` marks a slot with a line.
 */
export function ActivityColumns({ layers, now, label, className = "h-28" }: { layers: ActivityLayer[]; now?: number; label: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${SLOTS} ${H}`} preserveAspectRatio="none" className={`w-full rounded-sm border border-border ${className}`} role="img" aria-label={label}>
      {layers.map((layer, l) => ACTIVITIES.map((kind, k) => {
        let d = "";
        layer.columns.forEach((column, x) => {
          if (!column) return;
          let y = H;
          for (let j = 0; j < k; j++) y -= column[j] * H;
          const h = column[k] * H;
          if (h > 0.05) d += `M${x} ${(y - h).toFixed(2)}h1.02v${h.toFixed(2)}h-1.02z`;
        });
        return d ? <path key={`${l}-${kind}`} d={d} className={FILL[kind]} opacity={WEIGHT[kind] * (layer.opacity ?? 1)} /> : null;
      }))}
      {now !== undefined && <line x1={now} x2={now} y1={0} y2={H} className="stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function HourTicks() {
  return <div className="label flex justify-between" aria-hidden><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>;
}
