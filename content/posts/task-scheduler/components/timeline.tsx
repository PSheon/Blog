import type { Job, Schedule } from "./sim";

const KIND = ["fill-chart-1", "fill-chart-2", "fill-chart-3", "fill-chart-5"], LANE = 12, WIDTH = 600;

/**
 * What the scheduler did: a row per worker, a block per attempt at a task, coloured by the kind of task. An attempt that
 * failed is an empty pink outline with a stroke through it, so it reads without colour too. `at` (0–1) dims what has not
 * happened yet and draws the present as a vertical line; leave it out for the finished job.
 */
export function Timeline({ job, run, workers, at, label }: { job: Job; run: Schedule; workers: number; at?: number; label: string }) {
  const now = at ?? 1, height = workers * LANE + 4;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label={label}>
      {run.attempts.map((a, i) => {
        // Rounded: node and the browser disagree in the last digits of exp and log, and a hydrated attribute has to match.
        const x = ((a.from / run.total) * WIDTH).toFixed(2), w = Math.max(1, ((a.to - a.from) / run.total) * WIDTH - 0.8).toFixed(2), y = a.worker * LANE + 2, begun = a.from / run.total <= now, over = a.to / run.total <= now;
        if (a.ok) return <rect key={i} x={x} y={y} width={w} height={LANE - 3} rx={1.5} className={KIND[job.tasks[a.task].kind % KIND.length]} opacity={over ? 0.9 : begun ? 0.5 : 0.12} />;
        return (
          <g key={i} opacity={begun ? 1 : 0.15} className="stroke-signal-2">
            <rect x={x} y={y} width={w} height={LANE - 3} rx={1.5} fill="none" strokeWidth={1} />
            <line x1={x} y1={y + LANE - 3} x2={Number(x) + Number(w)} y2={y} strokeWidth={1} />
          </g>
        );
      })}
      {at !== undefined && <line x1={(now * WIDTH).toFixed(2)} x2={(now * WIDTH).toFixed(2)} y1={0} y2={height} className="stroke-foreground" strokeWidth={1.5} />}
    </svg>
  );
}
