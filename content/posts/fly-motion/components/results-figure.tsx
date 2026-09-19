import results from "./results.json";

type Task = "catdog" | "mnist";
type Model = "cnn" | "pixels" | "shuffled" | "fly" | "frozen";

interface Props {
  task: Task;
  /** Names for the five models, and the words for the chance line and the number of runs. */
  labels: Record<Model, string> & { chance: string; runs: (n: number) => string };
}

const mean = (runs: number[]) => runs.reduce((a, b) => a + b, 0) / runs.length;

/**
 * Test accuracy of every model on one task: a bar for the mean, a tick for each seed, a line at chance.
 * Built from HTML rather than a scaled SVG so the text stays readable on a phone.
 */
export function ResultsFigure({ task, labels }: Props) {
  const { rows, chance } = results[task];
  return (
    <div className="grid gap-2 p-4 text-sm text-foreground" role="img" aria-label={rows.map((r) => `${labels[r.model as Model]} ${mean(r.runs).toFixed(1)}%`).join("、")}>
      {rows.map((row) => {
        const m = mean(row.runs), real = row.model === "fly";
        return (
          <div key={row.model} className="grid grid-cols-[minmax(6.5rem,9rem)_1fr_3rem] items-center gap-3" title={`${row.runs.map((r) => r.toFixed(1)).join(" / ")}%（${labels.runs(row.runs.length)}）`}>
            <span className={real ? "text-right font-semibold" : "text-right"}>{labels[row.model as Model]}</span>
            <span className="relative h-5 rounded-sm bg-muted/60">
              <span className="absolute inset-y-0 left-0 rounded-sm bg-signal" style={{ width: `${m}%`, opacity: real ? 1 : 0.45 }} />
              {row.runs.length > 1 && row.runs.map((r, k) => <span key={k} className="absolute -inset-y-0.5 w-0.5 bg-foreground" style={{ left: `${r}%` }} />)}
              <span className="absolute -inset-y-1 border-l-2 border-dashed border-signal-2" style={{ left: `${chance}%` }} />
            </span>
            <span className="font-mono tabular">{m.toFixed(1)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(6.5rem,9rem)_1fr_3rem] gap-3 text-xs text-muted-foreground">
        <span />
        <span className="relative h-4 font-mono">
          {chance >= 25 && <span className="absolute left-0">0%</span>}
          <span className={chance >= 25 ? "absolute -translate-x-1/2 whitespace-nowrap" : "absolute whitespace-nowrap"} style={{ left: `${chance}%` }}>{labels.chance} {chance}%</span>
          <span className="absolute right-0">100%</span>
        </span>
        <span />
      </div>
    </div>
  );
}
