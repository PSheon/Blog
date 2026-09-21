import type { Bar } from "./sim";

/** One colour and one dash pattern per bar, the same in every figure; the lines are labelled too, so colour is never the only cue. */
export const STROKE: Record<Bar, string> = { count: "stroke-signal-2", work: "stroke-signal-3", plan: "stroke-signal", learn: "stroke-chart-5" };
export const FILL: Record<Bar, string> = { count: "bg-signal-2", work: "bg-signal-3", plan: "bg-signal", learn: "bg-chart-5" };
const DASH: Record<Bar, string | undefined> = { count: undefined, work: "6 3", plan: undefined, learn: "2 3" };
const W = 300, H = 220, L = 34, B = 26, R = 8, T = 8;

export type Curve = { bar: Bar; label: string; points: ArrayLike<number> };

/** Shown progress against time that has really passed. An honest bar is the diagonal; a bar that races ahead bulges above it. `upTo` draws only the first part (a run in progress). */
export function CalibrationChart({ curves, label, axis, upTo = 1, top = 1 }: { curves: Curve[]; label: string; axis: { x: string; y: string; honest: string }; upTo?: number; /** Top of the vertical axis. 1 draws shown progress with its diagonal; less draws a distance from the truth, where honest is the floor. */ top?: number }) {
  const x = (v: number) => L + v * (W - L - R), y = (v: number) => H - B - (Math.min(v, top) / top) * (H - B - T), gap = top < 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-muted-foreground" role="img" aria-label={label}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={x(0)} x2={x(1)} y1={y(v * top)} y2={y(v * top)} className="stroke-border" strokeWidth={0.5} />
          <text x={L - 5} y={y(v * top) + 3} textAnchor="end" className="fill-current font-mono text-[8px]">{Math.round(v * top * 100)}</text>
          <text x={x(v)} y={H - B + 11} textAnchor="middle" className="fill-current font-mono text-[8px]">{Math.round(v * 100)}</text>
        </g>
      ))}
      {gap ? <text x={x(0.98)} y={y(0) - 4} textAnchor="end" className="fill-current font-mono text-[8px]">{axis.honest} = 0</text> : (
        <>
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="stroke-muted-foreground" strokeDasharray="3 3" strokeWidth={1} />
          <text x={x(0.62)} y={y(0.55)} className="fill-current font-mono text-[8px]" transform={`rotate(-36 ${x(0.62)} ${y(0.55)})`}>{axis.honest}</text>
          <line x1={x(0)} x2={x(1)} y1={y(0.9)} y2={y(0.9)} className="stroke-signal-2" strokeWidth={0.5} strokeDasharray="1 3" />
        </>
      )}
      {curves.map(({ bar, points }) => {
        const n = points.length - 1, last = Math.max(1, Math.round(upTo * n));
        return <polyline key={bar} fill="none" className={STROKE[bar]} strokeWidth={1.8} strokeDasharray={DASH[bar]} strokeLinejoin="round" points={Array.from({ length: last + 1 }, (_, k) => `${x(k / n).toFixed(1)},${y(points[k]).toFixed(1)}`).join(" ")} />;
      })}
      <text x={x(0.5)} y={H - 2} textAnchor="middle" className="fill-current font-mono text-[8px]">{axis.x} →</text>
      <text x={9} y={y(0.5)} textAnchor="middle" className="fill-current font-mono text-[8px]" transform={`rotate(-90 9 ${y(0.5)})`}>{axis.y} →</text>
    </svg>
  );
}

export function Legend({ curves }: { curves: Curve[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {curves.map(({ bar, label }) => (
        <li key={bar} className="label flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden><line x1="0" x2="22" y1="3" y2="3" className={STROKE[bar]} strokeWidth="2" strokeDasharray={DASH[bar]} /></svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
