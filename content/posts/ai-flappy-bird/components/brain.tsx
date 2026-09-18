import type { Labels } from "./labels";

interface Props {
  /** 6 weights of the 2-2-1 network: 4 input→hidden, then 2 hidden→output. */
  weights: ArrayLike<number> | null;
  /** Layer activations of the last forward pass. */
  activations: ArrayLike<number>[] | null;
  t: Labels;
}

const X = [92, 176, 260];
const Y2 = [34, 96];
const Y1 = [65];

/** The whole network, small enough to draw: line colour is the weight's sign, thickness its size. */
export function Brain({ weights, activations, t }: Props) {
  const layers = [Y2, Y2, Y1];
  const edges: { x1: number; y1: number; x2: number; y2: number; w: number }[] = [];
  let k = 0;
  for (let l = 1; l < 3; l++) {
    for (let j = 0; j < layers[l].length; j++) {
      for (let i = 0; i < layers[l - 1].length; i++) {
        edges.push({ x1: X[l - 1], y1: layers[l - 1][i], x2: X[l], y2: layers[l][j], w: weights?.[k] ?? 0 });
        k++;
      }
    }
  }
  const out = activations?.[2]?.[0] ?? 0.5;

  return (
    <svg viewBox="0 0 340 130" className="w-full" role="img" aria-label={t.brain}>
      {edges.map((e, i) => (
        <line
          key={i}
          {...e}
          stroke={e.w >= 0 ? "var(--signal)" : "var(--signal-2)"}
          strokeWidth={Math.min(6, 0.75 + Math.abs(e.w) * 2.2)}
          strokeOpacity={0.85}
          strokeLinecap="round"
        />
      ))}
      {layers.map((ys, l) =>
        ys.map((y, i) => {
          const a = Math.max(0, Math.min(1, activations?.[l]?.[i] ?? 0));
          return (
            <g key={`${l}-${i}`}>
              <circle cx={X[l]} cy={y} r="11" fill="var(--panel)" stroke="var(--rule)" />
              <circle cx={X[l]} cy={y} r="11" fill="var(--signal-3)" fillOpacity={a} />
            </g>
          );
        }),
      )}
      <g className="fill-muted-foreground font-mono" fontSize="9.5">
        <text x={X[0] - 16} y={Y2[0] + 3} textAnchor="end">{t.inputs[0]}</text>
        <text x={X[0] - 16} y={Y2[1] + 3} textAnchor="end">{t.inputs[1]}</text>
      </g>
      <text x={X[2] + 16} y={Y1[0] - 3} fontSize="9.5" className="fill-muted-foreground font-mono">{t.output}</text>
      <text
        x={X[2] + 16}
        y={Y1[0] + 10}
        fontSize="10.5"
        className="font-mono"
        fill={out > 0.5 ? "var(--signal)" : "var(--muted-foreground)"}
      >
        {out.toFixed(2)} {out > 0.5 ? t.flap : t.glide}
      </text>
    </svg>
  );
}
