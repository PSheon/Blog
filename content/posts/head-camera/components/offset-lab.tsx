"use client";

import { useMemo, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useLabels } from "./labels";
import { AREA, HEAD, NO_SHIFT, type XY, backProject, project } from "./model";
import { Param } from "./param";

const deg = Math.PI / 180, H = 0.02;
/** Nine places on the bench, inside the area blocks are drawn from. */
const SPOTS: XY[] = [0.26, 0.36, 0.46].flatMap((x) => [-0.16, 0, 0.16].map((y) => [x, y] as XY));
/** Bench metres → drawing: x runs up the page (away from the arm's base), y to the left, as seen from behind the arm. */
const at = ([x, y]: XY) => `${(-y * 100).toFixed(2)},${(-x * 100).toFixed(2)}`;

/**
 * Fig. 02: the bench from above. Each red square is a block; the dashed pink one is where a perfect calculation puts it
 * when the camera has been knocked and the calculation still believes the old pose. No learning here, only geometry.
 */
export function OffsetLab() {
  const t = useLabels();
  const [pitch, setPitch] = useState(5), [yaw, setYaw] = useState(0);
  const believed = useMemo(() => SPOTS.map((p) => backProject(project([p[0], p[1], H], { ...NO_SHIFT, pitch: pitch * deg, yaw: yaw * deg }), H)), [pitch, yaw]);
  const errors = believed.map((b, i) => Math.hypot(b[0] - SPOTS[i][0], b[1] - SPOTS[i][1])), mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  // The camera's heading on the page. Bench (x, y) draws at (−y, −x), and SVG's rotate() turns "up" clockwise, so a
  // bench direction (lx, ly) is the rotation atan2(−ly, lx).
  const lx = HEAD.target[0] - HEAD.eye[0], ly = HEAD.target[1] - HEAD.eye[1], c = Math.cos(yaw * deg), sn = Math.sin(yaw * deg);
  const heading = Math.atan2(-(lx * sn + ly * c), lx * c - ly * sn) / deg;
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <svg viewBox="-42 -80 84 102" role="img" aria-label={t.offsetView} className="w-full rounded-md border border-border bg-background" data-testid="headcam-offset">
        <rect x={-36} y={-74} width={72} height={80} rx={1} fill="var(--panel)" stroke="var(--border)" strokeWidth={0.3} />
        <rect x={-AREA.y[1] * 100} y={-AREA.x[1] * 100} width={(AREA.y[1] - AREA.y[0]) * 100} height={(AREA.x[1] - AREA.x[0]) * 100} fill="none" stroke="var(--signal-3)" strokeWidth={0.3} strokeDasharray="1.2 0.8" />
        <circle cx={0} cy={0} r={4} fill="var(--muted-foreground)" opacity={0.5} />
        {/* The head camera and where it points. */}
        <g transform={`translate(${at([HEAD.eye[0], HEAD.eye[1]])}) rotate(${heading.toFixed(1)})`}>
          <path d="M0,0 L-16,-40 L16,-40 Z" fill="var(--signal)" opacity={0.14} />
          <rect x={-3} y={-2.2} width={6} height={4.4} rx={0.8} fill="var(--foreground)" />
        </g>
        {SPOTS.map((p, i) => {
          const [bx, by] = at(believed[i]).split(",").map(Number), [px, py] = at(p).split(",").map(Number);
          return (
            <g key={i}>
              <line x1={px} y1={py} x2={bx} y2={by} stroke="var(--signal-2)" strokeWidth={0.35} />
              <rect x={px - 2} y={py - 2} width={4} height={4} fill="#d63c3c" />
              <rect x={bx - 2} y={by - 2} width={4} height={4} fill="none" stroke="var(--signal-2)" strokeWidth={0.5} strokeDasharray="1 0.6" />
            </g>
          );
        })}
      </svg>
      <div className="grid content-start gap-4">
        <Param label={t.pitch} shown={`${pitch}°`} value={pitch} min={-10} max={20} step={1} onChange={setPitch} />
        <Param label={t.yaw} shown={`${yaw}°`} value={yaw} min={-20} max={20} step={1} onChange={setYaw} />
        <Readout label={t.offsetMean} value={(mean * 100).toFixed(1)} unit="cm" tone={mean < 0.03 ? "signal" : "alt"} />
        <p className="text-muted-foreground">{t.offsetNote}</p>
      </div>
    </div>
  );
}
