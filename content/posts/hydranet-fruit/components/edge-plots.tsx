import { MASK } from "./scene";

interface Props {
  /** left, right, top, bottom — each a distribution over MASK bins. */
  edges: ArrayLike<number>[];
  /** Predicted and true edge positions as fractions of the image side, same order. */
  predicted: number[];
  truth: number[];
  names: string[];
}

const W = 160, H = 56;

/** Each box edge is a probability distribution over position; the edge is its expected value. */
export function EdgePlots({ edges, predicted, truth, names }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
      {edges.map((dist, k) => {
        const peak = Math.max(...Array.from(dist), 1e-9);
        return (
          <figure key={k}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={names[k]}>
              {Array.from(dist, (p, i) => (
                <rect key={i} x={(i * W) / MASK + 1} width={W / MASK - 2} y={H - 4 - (p / Math.max(peak, 0.2)) * (H - 10)} height={(p / Math.max(peak, 0.2)) * (H - 10)} fill="var(--signal-3)" opacity={0.85} />
              ))}
              <line x1={truth[k] * W} x2={truth[k] * W} y1={0} y2={H - 4} stroke="var(--signal-2)" strokeDasharray="3 3" />
              <line x1={predicted[k] * W} x2={predicted[k] * W} y1={0} y2={H - 4} stroke="var(--signal)" strokeWidth="1.5" />
              <line x1={0} x2={W} y1={H - 4} y2={H - 4} stroke="var(--rule)" />
            </svg>
            <figcaption className="label mt-1 flex justify-between">
              <span className="text-foreground">{names[k]}</span>
              <span>{(predicted[k] * 32).toFixed(1)} px</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
