import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A small line drawing per article, in the site's three signal colours: what the model in that article
 * actually does, reduced to a glyph. Decorative only (the title beside it says the same thing in words),
 * plain SVG so it costs no JavaScript, and deterministic so server and client agree.
 */
const S = "var(--signal)";
const S2 = "var(--signal-2)";
const S3 = "var(--signal-3)";
const DIM = "color-mix(in oklab, var(--foreground) 22%, transparent)";

/** Same numbers on every render: covers are hydrated inside the client-side post index. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A 7 on a 9 × 9 pixel grid, with the 3 × 3 kernel that slides over it. */
function Cnn() {
  const lit = new Set(["2,2", "3,2", "4,2", "5,2", "6,2", "6,3", "5,4", "5,5", "4,6", "4,7"]);
  const cells = [];
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const on = lit.has(`${x},${y}`);
      cells.push(<rect key={`${x},${y}`} x={39 + x * 9} y={9.5 + y * 9} width={7.5} height={7.5} rx={1} fill={on ? S : DIM} opacity={on ? 1 : 0.45} />);
    }
  return (
    <>
      {cells}
      <rect x={82.5} y={17} width={28.5} height={28.5} rx={2} fill="none" stroke={S2} strokeWidth={1.5} />
      <path d="M111 31 H128" stroke={S2} strokeWidth={1.2} strokeDasharray="2 2.5" />
      <rect x={128} y={26} width={10} height={10} rx={1.5} fill={S2} />
    </>
  );
}

/** A flock, a gap between two pipes, and the one flight path that gets through. */
function Flappy() {
  return (
    <>
      <path d="M10 88 H150" stroke={DIM} strokeWidth={1} />
      {[[64, 0, 34], [64, 62, 26], [116, 0, 20], [116, 48, 40]].map(([x, y, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y + (y ? 0 : 6)} width={16} height={h} rx={2} fill="none" stroke={S3} strokeWidth={1.4} />
      ))}
      <path d="M12 62 Q30 30 48 52 T72 50 T98 40 T124 36 T150 30" fill="none" stroke={S} strokeWidth={1.4} strokeDasharray="1 4" strokeLinecap="round" />
      {[[22, 70, 0.35], [30, 58, 0.5], [18, 46, 0.35], [38, 66, 0.6]].map(([x, y, o]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3.2} fill={S} opacity={o} />
      ))}
      <circle cx={48} cy={52} r={4.6} fill={S2} />
    </>
  );
}

const PRICE = (() => {
  const rand = rng(3), pts: [number, number][] = [];
  for (let i = 0, v = 62; i < 30; i++) {
    v = Math.max(18, Math.min(84, v + (rand() - 0.52) * 11 - (i > 8 && i < 15 ? 3 : 0) + (i > 20 ? 2.5 : 0)));
    pts.push([r1(12 + i * 4.7), r1(v)]);
  }
  return pts;
})();

/** A price line with the agent's buys (below) and sells (above). */
function Trading() {
  const pts = PRICE;
  const marks = [[4, true], [10, false], [15, true], [24, false], [27, true]] as const;
  return (
    <>
      {[28, 50, 72].map((y) => <path key={y} d={`M10 ${y} H150`} stroke={DIM} strokeWidth={0.8} strokeDasharray="1 5" />)}
      <path d={`M${pts.map((p) => p.join(" ")).join(" L")}`} fill="none" stroke={S} strokeWidth={1.6} strokeLinejoin="round" />
      {marks.map(([i, buy]) => {
        const [x, y] = pts[i];
        const d = buy ? `M${x} ${y + 7} l-4 7 h8 z` : `M${x} ${y - 7} l-4 -7 h8 z`;
        return <path key={i} d={d} fill={buy ? S3 : S2} />;
      })}
    </>
  );
}

/** The attention map of a model that reverses a string of digits: every output looks at the mirrored input. */
function Transformer() {
  const n = 7;
  const rand = rng(11);
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.abs(x - (n - 1 - y));
      const w = d === 0 ? 1 : d === 1 ? 0.28 + rand() * 0.15 : rand() * 0.12;
      cells.push(<rect key={`${x},${y}`} x={41 + x * 11.4} y={10.5 + y * 11.4} width={10} height={10} rx={1.5} fill={d === 0 ? S3 : S} opacity={r1(0.1 + w * 0.9)} />);
    }
  return (
    <>
      {cells}
      <path d="M30 14 V86 M26 82 l4 5 4 -5" fill="none" stroke={DIM} strokeWidth={1} />
      <path d="M44 93 H120 M116 89 l5 4 -5 4" fill="none" stroke={DIM} strokeWidth={1} />
    </>
  );
}

/** One trunk, two heads: a box and a mask around the same fruit. */
function Hydra() {
  return (
    <>
      <path d="M14 50 H46 M46 50 C58 50 58 28 72 28 M46 50 C58 50 58 72 72 72" fill="none" stroke={S} strokeWidth={1.5} />
      {[14, 30, 46].map((x) => <circle key={x} cx={x} cy={50} r={3} fill={S} />)}
      <circle cx={75} cy={28} r={3} fill={S2} />
      <circle cx={75} cy={72} r={3} fill={S3} />
      <circle cx={116} cy={52} r={19} fill={S3} opacity={0.3} />
      <circle cx={116} cy={52} r={19} fill="none" stroke={S3} strokeWidth={1.2} />
      <path d="M116 33 q2 -8 9 -10" fill="none" stroke={S3} strokeWidth={1.2} />
      <rect x={93} y={19} width={46} height={56} fill="none" stroke={S2} strokeWidth={1.4} strokeDasharray="4 3" />
      {[[93, 19], [139, 19], [93, 75], [139, 75]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 2} y={y - 2} width={4} height={4} fill={S2} />)}
    </>
  );
}

/** The quadruped in side view, mid-trot: one diagonal pair of feet down, the other in the air. */
function Lite3() {
  const leg = (hx: number, kx: number, ky: number, fx: number, fy: number, c: string) => (
    <g key={`${hx}-${fx}`}>
      <path d={`M${hx} 46 L${kx} ${ky} L${fx} ${fy}`} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={kx} cy={ky} r={2.2} fill="var(--background)" stroke={c} strokeWidth={1.2} />
    </g>
  );
  return (
    <>
      <path d="M10 82 H150" stroke={DIM} strokeWidth={1} />
      <path d="M22 88 h10 M52 88 h16 M92 88 h10 M122 88 h16" stroke={DIM} strokeWidth={1} />
      {leg(52, 44, 62, 56, 74, S3)}
      {leg(106, 98, 60, 112, 72, S3)}
      {leg(56, 66, 64, 58, 82, S)}
      {leg(110, 120, 64, 114, 82, S)}
      <rect x={44} y={34} width={76} height={14} rx={6} fill="var(--background)" stroke={S} strokeWidth={1.6} />
      <rect x={118} y={30} width={14} height={11} rx={3} fill="var(--background)" stroke={S} strokeWidth={1.6} />
      <circle cx={128} cy={35} r={1.6} fill={S2} />
      <path d="M58 82 m-5 0 h10 M114 82 m-5 0 h10" stroke={S2} strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

/** Noise on the left, an apple on the right, and the points in between on their way. */
function Diffusion() {
  const rand = rng(7);
  const dots = Array.from({ length: 150 }, (_, i) => {
    const a = rand() * Math.PI * 2;
    // A cardioid on its side is an apple's outline, dimple up.
    const rho = 18 * (1 + Math.cos(a)) * (0.86 + rand() * 0.14);
    const ax = 116 + rho * Math.sin(a), ay = 36 + rho * Math.cos(a) * 0.95;
    const nx = 10 + rand() * 78, ny = 10 + rand() * 80;
    const t = Math.min(1, Math.max(0, (i / 150) * 1.5 - 0.1 + rand() * 0.15));
    return { x: r1(nx + (ax - nx) * t), y: r1(ny + (ay - ny) * t), t: r1(t) };
  });
  return (
    <>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.t > 0.95 ? 1.5 : 1.15} fill={d.t > 0.95 ? S2 : d.t > 0.45 ? S3 : S} opacity={r1(0.35 + d.t * 0.65)} />
      ))}
      <path d="M116 38 q1 -11 9 -15" fill="none" stroke={S} strokeWidth={1.4} />
    </>
  );
}

/** For an article without a drawing of its own yet: its number as a constellation on the grid. */
function Generic({ seed }: { seed: number }) {
  const rand = rng(seed * 97 + 1);
  const pts = Array.from({ length: 7 }, (_, i) => [r1(18 + i * 20.5 + rand() * 6), r1(20 + rand() * 60)] as const);
  return (
    <>
      <path d={`M${pts.map((p) => p.join(" ")).join(" L")}`} fill="none" stroke={S} strokeWidth={1.2} opacity={0.7} />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.2 : 2.2} fill={[S, S3, S2][i % 3]} />)}
    </>
  );
}

const covers: Record<string, () => ReactNode> = {
  "cnn-from-scratch": Cnn,
  "ai-flappy-bird": Flappy,
  "trading-agent": Trading,
  "transformer-from-scratch": Transformer,
  "hydranet-fruit": Hydra,
  "lite3-walking": Lite3,
  "diffusion-points": Diffusion,
};

export function PostCover({ slug, no, className }: { slug: string; no: number; className?: string }) {
  const Art = covers[slug];
  return (
    <svg viewBox="0 0 160 100" className={cn("block h-auto w-full", className)} aria-hidden focusable="false">
      {Art ? <Art /> : <Generic seed={no} />}
    </svg>
  );
}
