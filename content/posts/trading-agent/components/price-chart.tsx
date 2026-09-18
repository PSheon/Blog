import type { Trade } from "./trading";

interface Props {
  closes: number[];
  dates: string[];
  trades: Trade[];
  label: string;
}

const W = 720, H = 260;
const PAD = { top: 14, right: 12, bottom: 24, left: 40 };

/** Closing price as a line; buys are cyan triangles below it, sells pink triangles above. */
export function PriceChart({ closes, dates, trades, label }: Props) {
  const lo = Math.floor(Math.min(...closes) / 10) * 10;
  const hi = Math.ceil(Math.max(...closes) / 10) * 10;
  const x = (i: number) => PAD.left + (i / (closes.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = closes.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join("");

  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 20) ticks.push(v);
  // First trading day of each quarter
  const quarters = dates.map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || (d.slice(5, 7) !== dates[i - 1].slice(5, 7) && ["04", "07", "10"].includes(d.slice(5, 7))));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
          <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" className="fill-muted-foreground font-mono">{v}</text>
        </g>
      ))}
      {quarters.map(({ d, i }) => (
        <text key={d} x={x(i)} y={H - 6} fontSize="10" textAnchor={i === 0 ? "start" : "middle"} className="fill-muted-foreground font-mono">
          {d.slice(0, 7)}
        </text>
      ))}
      <path d={path} fill="none" stroke="var(--foreground)" strokeOpacity="0.75" strokeWidth="1.25" strokeLinejoin="round" />
      {trades.map((t, k) => {
        const cx = x(t.day);
        const cy = y(t.price);
        return t.action === "buy" ? (
          <path key={k} d={`M${cx} ${cy + 5}l4 7h-8z`} fill="var(--signal)" />
        ) : (
          <path key={k} d={`M${cx} ${cy - 5}l4 -7h-8z`} fill="var(--signal-2)" />
        );
      })}
    </svg>
  );
}
