import { cn } from "@/lib/utils";

interface Props {
  probs: Float32Array | null;
  prediction: number | null;
  compact?: boolean;
}

/** Ten horizontal bars, one per class. The winner is lit; the rest stay dim. */
export function ProbBars({ probs, prediction, compact }: Props) {
  return (
    <ol className={cn("grid", compact ? "gap-[3px]" : "gap-1.5")} aria-label="class probabilities">
      {Array.from({ length: 10 }, (_, d) => {
        const p = probs ? probs[d] : 0;
        const win = d === prediction;
        return (
          <li key={d} className="grid grid-cols-[1ch_1fr_4ch] items-center gap-2.5 font-mono text-xs tabular">
            <span className={win ? "text-signal" : "text-muted-foreground"}>{d}</span>
            <span className="h-2.5 overflow-hidden rounded-[1px] bg-foreground/10">
              <span
                className={cn("block h-full origin-left transition-transform duration-150", win ? "bg-signal" : "bg-muted-foreground/50")}
                style={{ transform: `scaleX(${p})` }}
              />
            </span>
            <span className={cn("text-right", win ? "text-foreground" : "text-muted-foreground")}>
              {(p * 100).toFixed(p >= 0.9995 ? 0 : 1)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
