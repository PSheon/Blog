import kernels from "./wiring.json";
import { columnX, columnY } from "./wiring";

const SOURCES = [
  { type: "Mi1", color: "currentColor", label: "Mi1（興奮）" },
  { type: "Mi9", color: "#ff6e96", label: "Mi9（抑制）" },
  { type: "Mi4", color: "#79dafa", label: "Mi4（抑制）" },
];
const RANGE = 2, CELL = 26, SIZE = 150;

/** Where the inputs of each T4 subtype sit, straight from the connectome: dot area = synapses per cell. */
export function WiringFigure({ labels }: { labels: { caption: string; arrow: string } }) {
  const data = kernels as unknown as Record<string, [number, number, number][]>;
  return (
    <div className="grid gap-4 p-4 text-foreground">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["T4a", "T4b", "T4c", "T4d"].map((target) => {
          const centroid = (type: string) => {
            const taps = data[`${type}>${target}`] ?? [];
            const n = taps.reduce((s, t) => s + t[2], 0);
            return [taps.reduce((s, t) => s + columnX(t[0], t[1]) * t[2], 0) / n, taps.reduce((s, t) => s + columnY(t[0], t[1]) * t[2], 0) / n];
          };
          const [x9, y9] = centroid("Mi9"), [x4, y4] = centroid("Mi4");
          const px = (x: number) => SIZE / 2 + x * CELL, py = (y: number) => SIZE / 2 - y * CELL;
          return (
            <svg key={target} viewBox={`0 0 ${SIZE} ${SIZE + 22}`} role="img" aria-label={`${target}: ${labels.arrow}`} className="w-full">
              {Array.from({ length: (2 * RANGE + 1) ** 2 }, (_, i) => [Math.floor(i / (2 * RANGE + 1)) - RANGE, (i % (2 * RANGE + 1)) - RANGE]).map(([u, v]) => (
                <circle key={`${u},${v}`} cx={px(columnX(u, v))} cy={py(columnY(u, v))} r={CELL * 0.46} fill="none" stroke="currentColor" strokeOpacity={0.15} />
              ))}
              {SOURCES.flatMap(({ type, color }) =>
                (data[`${type}>${target}`] ?? []).filter(([u, v]) => Math.abs(u) <= RANGE && Math.abs(v) <= RANGE).map(([u, v, n]) => (
                  <circle key={`${type}${u},${v}`} cx={px(columnX(u, v))} cy={py(columnY(u, v))} r={Math.sqrt(n) * 1.9} fill={color} fillOpacity={type === "Mi1" ? 0.35 : 0.85} />
                )),
              )}
              <line x1={px(x9)} y1={py(y9)} x2={px(x4)} y2={py(y4)} stroke="currentColor" strokeWidth={2} markerEnd="url(#fly-arrow)" />
              <text x={SIZE / 2} y={SIZE + 16} textAnchor="middle" fontSize="13" fill="currentColor" className="font-mono">{target}</text>
            </svg>
          );
        })}
      </div>
      <svg width="0" height="0" aria-hidden>
        <defs>
          <marker id="fly-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
      </svg>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {SOURCES.map((s) => (
          <span key={s.type} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: s.color, opacity: s.type === "Mi1" ? 0.35 : 0.85 }} />
            {s.label}
          </span>
        ))}
        <span>{labels.caption}</span>
      </p>
    </div>
  );
}
