interface Series {
  values: ArrayLike<number>;
  color: string;
  dashed?: boolean;
}

interface Props {
  series: Series[];
  /** Fixed vertical range, so the lines do not rescale while you watch them. */
  range: [number, number];
  /** Horizontal slots; a series shorter than this is drawn from the left. */
  slots: number;
  label: string;
  className?: string;
}

/** A few time series on one fixed scale, with a zero line. */
export function Traces({ series, range: [lo, hi], slots, label, className }: Props) {
  const W = 300, H = 72, pad = 4;
  const x = (i: number) => pad + (i / (slots - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={className ?? "h-20 w-full"}>
      {lo < 0 && hi > 0 && <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />}
      {series.map(({ values, color, dashed }, s) => (
        <polyline
          key={s}
          points={Array.from(values, (v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={dashed ? "3 4" : undefined}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
