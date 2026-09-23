"use client";

import { useRef } from "react";
import type { Piece } from "./music";
import { usePlayhead } from "./player";

/** Soprano to bass. Each voice wears one series colour (DESIGN §2's order), and the legend names them. */
export const VOICE_COLOURS = ["var(--signal)", "var(--signal-3)", "var(--signal-2)", "var(--chart-5)"];
const LOW = 36, HIGH = 84, STEP_W = 8, ROW_H = 2.4;

/** A piano roll: time to the right, pitch upward, one bar per note. A playhead crosses it while `playKey` plays. */
export function PianoRoll({ piece, label, playKey, className }: { piece: Piece | null; label: string; playKey: string; className?: string }) {
  const head = useRef<SVGLineElement>(null);
  const steps = Math.max(piece?.pitches.length ?? 48, 1);
  const W = steps * STEP_W, H = (HIGH - LOW) * ROW_H;
  usePlayhead(playKey, (f) => {
    const line = head.current;
    if (!line) return;
    line.style.opacity = f === null ? "0" : "1";
    if (f !== null) line.setAttribute("transform", `translate(${(f * W).toFixed(1)} 0)`);
  });

  const notes: { x: number; y: number; w: number; v: number }[] = [];
  if (piece)
    for (let v = 0; v < 4; v++)
      for (let t = 0; t < piece.pitches.length; ) {
        const p = piece.pitches[t][v];
        if (p < 0) { t++; continue; }
        let len = 1;
        while (t + len < piece.pitches.length && piece.pitches[t + len][v] === p && !piece.onset[t + len][v]) len++;
        notes.push({ x: t * STEP_W, y: (HIGH - Math.min(HIGH, Math.max(LOW, p))) * ROW_H, w: len * STEP_W, v });
        t += len;
      }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={className ?? "h-32 w-full"}>
      {/* A faint line at every bar (eight eighths), and C3 / C4 / C5 as the only pitch rules. */}
      {Array.from({ length: Math.floor(steps / 8) + 1 }, (_, i) => <line key={`b${i}`} x1={i * 64} x2={i * 64} y1={0} y2={H} stroke="var(--grid)" vectorEffect="non-scaling-stroke" />)}
      {[48, 60, 72].map((c) => <line key={c} x1={0} x2={W} y1={(HIGH - c) * ROW_H} y2={(HIGH - c) * ROW_H} stroke="var(--grid)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />)}
      {notes.map((n, i) => <rect key={i} x={n.x + 0.6} y={n.y - ROW_H * 0.6} width={Math.max(1, n.w - 1.2)} height={ROW_H * 1.2} rx={1.2} fill={VOICE_COLOURS[n.v]} opacity={0.9} />)}
      <line ref={head} x1={0} x2={0} y1={0} y2={H} stroke="var(--foreground)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ opacity: 0 }} />
    </svg>
  );
}

export function VoiceLegend({ names }: { names: string[] }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ background: VOICE_COLOURS[i] }} aria-hidden />
          {n}
        </span>
      ))}
    </p>
  );
}
