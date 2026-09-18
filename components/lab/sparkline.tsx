interface Props {
  values: number[];
  label: string;
  /** Show at most this many trailing points. */
  window?: number;
  /** Optional horizontal reference line, in the same units as the values. */
  reference?: number;
  className?: string;
}

/** A bare trend line: no axes, because the shape is the message. */
export function Sparkline({ values, label, window = 60, reference, className }: Props) {
  const shown = values.slice(-window);
  const W = 300, H = 56, pad = 4;
  const lo = Math.min(...shown, reference ?? Infinity);
  const hi = Math.max(...shown, reference ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (shown.length <= 1 ? 0 : (i / (shown.length - 1)) * (W - pad * 2));
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const points = shown.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={className ?? "h-14 w-full"}>
      {reference !== undefined && shown.length > 0 && (
        <line x1={pad} x2={W - pad} y1={y(reference)} y2={y(reference)} stroke="var(--signal-2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      )}
      {shown.length > 1 && (
        <polyline points={points} fill="none" stroke="var(--signal)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      )}
      {shown.length > 0 && <circle cx={x(shown.length - 1)} cy={y(shown[shown.length - 1])} r="2.5" fill="var(--signal)" />}
    </svg>
  );
}
