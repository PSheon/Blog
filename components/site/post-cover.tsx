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

/**
 * A lap of a corridor: the walls as lidar points, the wheels' own idea of the lap drifting open (pink), the
 * corrected one as a chain of poses (cyan), and the loop closure that pulls the ends together (violet).
 */
function Slam() {
  const rand = rng(8);
  // Walls: points along an outer and an inner rectangle, a little noisy, like a scan.
  const walls: [number, number][] = [];
  const box = (x0: number, y0: number, x1: number, y1: number, step: number) => {
    for (let x = x0; x <= x1; x += step) walls.push([x, y0], [x, y1]);
    for (let y = y0 + step; y < y1; y += step) walls.push([x0, y], [x1, y]);
  };
  box(22, 10, 138, 90, 5.8);
  box(50, 34, 110, 66, 5.8);
  // The true lap runs between the two; poses sit on it at even steps.
  const lap = (t: number): [number, number] => {
    // A superellipse: a rectangle with generous corners, which is what a car's lap of a corridor looks like.
    const a = t * Math.PI * 2 + Math.PI * 0.75, c = Math.cos(a), s = Math.sin(a);
    return [80 + 44 * Math.sign(c) * Math.abs(c) ** 0.45, 50 + 28 * Math.sign(s) * Math.abs(s) ** 0.45];
  };
  const poses = Array.from({ length: 18 }, (_, i) => lap(i / 18));
  // Dead reckoning: the same lap with an error that grows with distance, so it ends beside its start.
  const drift = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40, [x, y] = lap(t);
    return `${r1(x + t * t * 17)} ${r1(y + t * t * 12 - t * 3)}`;
  });
  const [ex, ey] = drift[40].split(" ").map(Number);
  return (
    <>
      {walls.map(([x, y], i) => <circle key={i} cx={r1(x + (rand() - 0.5) * 1.4)} cy={r1(y + (rand() - 0.5) * 1.4)} r={0.95} fill={DIM} />)}
      <path d={`M${drift.join(" L")}`} fill="none" stroke={S2} strokeWidth={1.2} strokeDasharray="2.5 2.5" opacity={0.85} />
      <path d={`M${poses.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")} Z`} fill="none" stroke={S} strokeWidth={1.3} />
      {poses.map(([x, y], i) => <circle key={i} cx={r1(x)} cy={r1(y)} r={i === 0 ? 3 : 1.9} fill={S} />)}
      <path d={`M${ex} ${ey} L${r1(poses[0][0])} ${r1(poses[0][1])}`} stroke={S3} strokeWidth={1.6} />
      <circle cx={ex} cy={ey} r={2.6} fill={S3} />
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

/** № 009: a block of the city from above, with people on the pavement coloured by what they are up to. */
function City() {
  const lots: [number, number, number, number][] = [[20, 16, 34, 26], [62, 16, 36, 26], [106, 16, 34, 26], [20, 58, 34, 26], [62, 58, 36, 26], [106, 58, 34, 26]];
  const people: [number, number, string][] = [[24, 49, S], [38, 52, S], [57, 30, S2], [58, 66, S3], [70, 50, S], [88, 53, S2], [101, 38, S], [102, 72, S3], [120, 50, S], [136, 52, S2]];
  return (
    <>
      {lots.map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke={DIM} strokeWidth={1} />
          <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={1} fill="var(--background)" stroke={i === 1 || i === 4 ? S : DIM} strokeWidth={i === 1 || i === 4 ? 1.6 : 1} />
        </g>
      ))}
      <path d="M57 44 v12 M101 44 v12 M56 47 h-2 M56 50 h-2 M56 53 h-2" stroke={DIM} strokeWidth={1} />
      <path d="M24 49 H57 V30" fill="none" stroke={S3} strokeWidth={1} strokeDasharray="2 3" />
      {people.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r={2.2} fill={c} />)}
    </>
  );
}

/** № 010: workers' lanes of tasks, a few of them long, and above them a bar that says it is nearly done. */
function Scheduler() {
  const tasks: [number, number, number, string][] = [[14, 52, 18, S3], [34, 52, 8, DIM], [44, 52, 10, DIM], [56, 52, 90, S], [14, 64, 10, DIM], [26, 64, 6, DIM], [34, 64, 12, DIM], [48, 64, 70, S3], [14, 76, 8, DIM], [24, 76, 14, DIM], [40, 76, 9, DIM], [51, 76, 8, DIM]];
  return (
    <>
      <rect x={14} y={22} width={132} height={10} rx={5} fill="none" stroke={DIM} strokeWidth={1} />
      <rect x={15.5} y={23.5} width={124} height={7} rx={3.5} fill={S2} />
      <path d="M96 40 V90" stroke={S} strokeWidth={1.2} strokeDasharray="2 3" />
      {tasks.map(([x, y, w, c], i) => <rect key={i} x={x} y={y} width={w} height={7} rx={2} fill={c === DIM ? "none" : c} stroke={c} strokeWidth={1} opacity={c === DIM ? 1 : 0.85} />)}
    </>
  );
}

/** № 011: a room seen from its open side. One ray bounces its way to the lamp; the left half is still snow, the right has cleared. */
function Light() {
  const next = rng(11), snow: [number, number, number][] = [];
  for (let i = 0; i < 46; i++) snow.push([r1(32 + next() * 46), r1(14 + next() * 72), next()]);
  return (
    <>
      <rect x={30} y={10} width={100} height={80} rx={2} fill="none" stroke={DIM} strokeWidth={1} />
      <rect x={56} y={30} width={48} height={40} fill="none" stroke={DIM} strokeWidth={1} />
      <path d="M30 10 L56 30 M130 10 L104 30 M30 90 L56 70 M130 90 L104 70" stroke={DIM} strokeWidth={1} />
      <path d="M30 10 L56 30 V70 L30 90 Z" fill={S2} opacity={0.22} />
      <path d="M130 10 L104 30 V70 L130 90 Z" fill={S3} opacity={0.22} />
      <path d="M68 17 H92 L88 23 H72 Z" fill={S} />
      {snow.map(([x, y, v], i) => <rect key={i} x={x} y={y} width={1.8} height={1.8} fill={v > 0.8 ? S : DIM} opacity={v > 0.8 ? 1 : 0.8} />)}
      <path d="M6 58 L92 79 L120 46 L81 21" fill="none" stroke={S} strokeWidth={1.4} strokeLinejoin="round" />
      <circle cx={6} cy={58} r={2.4} fill="var(--background)" stroke={S} strokeWidth={1.4} />
      <circle cx={92} cy={79} r={2.6} fill={DIM} stroke={S} strokeWidth={1} />
      <circle cx={120} cy={46} r={2.6} fill={S3} />
    </>
  );
}

/** № 012: the playground's loop against the sky, a car on the ground with its shadow, a helicopter above, and the sun that casts it all. */
function Playground() {
  return (
    <>
      <path d="M8 78 H152" stroke={DIM} strokeWidth={1} />
      <path d="M10 78 C40 78 52 70 66 52 C78 36 100 34 102 52 C104 68 84 70 82 54 C80 40 96 22 150 18" fill="none" stroke={S} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={132} cy={20} r={6} fill="none" stroke={S3} strokeWidth={1.4} />
      <path d="M132 8 v4 M132 28 v4 M120 20 h4 M140 20 h4" stroke={S3} strokeWidth={1.2} strokeLinecap="round" />
      <path d="M24 70 h22 l-3 -7 h-12 l-4 7 Z" fill={S2} />
      <circle cx={29} cy={72} r={2.6} fill="var(--background)" stroke={S2} strokeWidth={1.2} /><circle cx={42} cy={72} r={2.6} fill="var(--background)" stroke={S2} strokeWidth={1.2} />
      <path d="M22 80 L8 86 H34 L48 80 Z" fill={DIM} />
      <path d="M40 30 h18 M49 30 v4 M42 36 h12 l4 5 h-6 l-2 -2 h-8 Z" fill="none" stroke={S} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M132 26 L36 80" stroke={S3} strokeWidth={0.8} strokeDasharray="2 3" />
    </>
  );
}

/** A camera in a head, the patch of bench it sees, and the same patch where a knocked camera would put it; an arm carrying a block to its pad. */
function HeadCamera() {
  const eye: [number, number] = [26, 16];
  // The bench in perspective, and two views of it from the eye: as calibrated (solid) and knocked (dashed).
  const seen = "62,40 140,48 128,88 40,74", knocked = "72,50 150,60 136,97 48,82";
  return (
    <>
      <polygon points="30,44 150,38 158,92 18,84" fill="none" stroke={DIM} strokeWidth={1} />
      <polygon points={knocked} fill="none" stroke={S2} strokeWidth={1} strokeDasharray="2.5 2.5" opacity={0.85} />
      <polygon points={seen} fill={S} fillOpacity={0.08} stroke={S} strokeWidth={1.2} />
      {seen.split(" ").map((p, i) => <path key={i} d={`M${eye[0]} ${eye[1]} L${p.replace(",", " ")}`} stroke={S} strokeWidth={0.6} opacity={0.45} />)}
      {/* the head camera */}
      <g transform={`translate(${eye[0]} ${eye[1]}) rotate(32)`}>
        <rect x={-7} y={-5} width={14} height={10} rx={2} fill="var(--background)" stroke="var(--foreground)" strokeWidth={1.4} />
        <circle cx={7} cy={0} r={2.6} fill={S} />
      </g>
      {/* the pad, and the way there */}
      <polygon points="104,64 122,66 119,77 100,74" fill="none" stroke={S3} strokeWidth={1.6} />
      <path d="M86 50 Q98 44 110 66" fill="none" stroke={S3} strokeWidth={1} strokeDasharray="2 3" />
      {/* the arm: base, two links, a gripper holding the block */}
      <rect x={58} y={70} width={11} height={9} rx={1.5} fill={DIM} />
      <path d="M63.5 70 L74 34 L86 47" fill="none" stroke="var(--foreground)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      {[[63.5, 70], [74, 34], [86, 47]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.4} fill="var(--background)" stroke="var(--foreground)" strokeWidth={1.2} />)}
      <path d="M81 49 v8 M91 49 v8 M81 49 h10" fill="none" stroke={S} strokeWidth={1.6} strokeLinecap="round" />
      <rect x={83} y={51} width={6} height={6} fill={S2} />
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
  "slam-2d": Slam,
  "city-of-agents": City,
  "task-scheduler": Scheduler,
  "light-from-noise": Light,
  "light-playground": Playground,
  "head-camera": HeadCamera,
};

export function PostCover({ slug, no, className }: { slug: string; no: number; className?: string }) {
  const Art = covers[slug];
  return (
    <svg viewBox="0 0 160 100" className={cn("block h-auto w-full", className)} aria-hidden focusable="false">
      {Art ? <Art /> : <Generic seed={no} />}
    </svg>
  );
}
