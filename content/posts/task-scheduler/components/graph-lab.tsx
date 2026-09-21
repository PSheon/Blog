"use client";

import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { DEFAULT_JOB, type Job, makeJob, Scheduler, type Schedule, type Step } from "./sim";
import { KIND, Timeline } from "./timeline";
import { useVisible } from "./use-visible";

/** "step" is the Next step button; a number is the id of a running task the reader has just made fail. */
type Action = "step" | number;

const SMALL = { ...DEFAULT_JOB, tasks: 14, layers: 4, skew: 0.7 }, WORKERS = 3, SEED = 5, W = 360, H = 250, R = 14;

/** The scheduler after these actions, and what the last one did. A step alternates between rule 2 and rule 3. */
function replay(job: Job, actions: Action[]): { s: Scheduler; last: Step[] } {
  const s = new Scheduler(job.tasks, WORKERS, job.tasks.map((x) => x.attempts));
  let phase: "assign" | "advance" = "assign", last: Step[] = [];
  for (const action of actions) {
    if (s.left === 0) break;
    if (typeof action === "number") { const killed = s.kill(action); if (killed) { last = [killed]; phase = "assign"; } continue; }
    if (phase === "assign") { last = s.assign(); phase = "advance"; if (last.length) continue; } // nobody free or nothing ready: go straight on to rule 3
    last = [s.advance()]; phase = "assign";
  }
  return { s, last };
}

/**
 * Fig. 02: the scheduler one rule at a time, on a job small enough to see whole. "Next step" alternates between rule 2
 * (free workers take ready tasks) and rule 3 (jump to the end of the next attempt). A running task can be clicked to
 * make it fail on the spot; rule 4 then does the rest.
 */
export function GraphLab() {
  const t = useLabels(), reduced = useReducedMotion(), root = useRef<HTMLDivElement>(null), visible = useVisible(root);
  const job = useMemo(() => makeJob(SEED, SMALL), []);
  // What the reader has done so far. The picture is that list replayed from the start: fourteen tasks cost nothing to redo,
  // and nothing mutable has to live between renders.
  const [actions, setActions] = useState<Action[]>([]), [playing, setPlaying] = useState(false);
  const { s, last } = useMemo(() => replay(job, actions), [job, actions]), over = s.left === 0;
  const step = () => setActions((all) => [...all, "step"]), kill = (id: number) => setActions((all) => [...all, id]);
  const reset = () => { setActions([]); setPlaying(false); };

  useEffect(() => {
    if (!playing || over) return;
    const timer = window.setInterval(() => { if (visible.current && !document.hidden) step(); }, reduced ? 1200 : 700);
    return () => clearInterval(timer);
  }, [playing, over, reduced, visible]);

  // Where each task sits: a column per layer, spread evenly down it.
  const layers = Array.from({ length: SMALL.layers }, (_, l) => job.tasks.filter((x) => x.layer === l));
  const at = (id: number) => { const task = job.tasks[id], column = layers[task.layer], k = column.indexOf(task); return { x: 36 + (task.layer * (W - 72)) / (SMALL.layers - 1), y: ((k + 1) * H) / (column.length + 1) }; };
  const ready = new Set(s.ready()), touched = new Set(last.map((x) => x.task));
  const soFar: Schedule = { start: s.start, finish: s.finish, worker: s.worker, total: Math.max(s.now, 0.001), attempts: [...s.log, ...s.running.map((id) => ({ task: id, worker: s.worker[id], from: s.sinceOf(id), to: s.now, ok: true }))] };
  const sentence = last.length === 0 ? t.stepStart : last.map((x) => (x.rule === 2 ? t.stepTake.replace("{w}", String(x.worker + 1)).replace("{t}", String(x.task + 1)) : (x.ok ? t.stepDone : t.stepFailed).replace("{t}", String(x.task + 1)).replace("{m}", x.at.toFixed(1)))).join(" ");

  return (
    <div ref={root} className="grid gap-4 text-sm" data-testid="graph-lab">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-xl text-foreground" role="group" aria-label={t.graph}>
        {job.tasks.flatMap((task) => task.deps.map((d) => { const a = at(d), b = at(task.id); return <line key={`${d}-${task.id}`} x1={a.x + R} y1={a.y} x2={b.x - R} y2={b.y} className={s.finished[d] ? "stroke-muted-foreground" : "stroke-border"} strokeWidth={1} markerEnd="url(#arrow)" />; }))}
        <defs><marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6 z" className="fill-muted-foreground" /></marker></defs>
        {job.tasks.map((task) => {
          const { x, y } = at(task.id), running = s.busy[task.id] === 1, done = s.finished[task.id] === 1, isReady = ready.has(task.id), what = running ? t.nodeRunning.replace("{w}", String(s.worker[task.id] + 1)) : done ? t.nodeDone : isReady ? t.nodeReady : t.nodeWaiting;
          const body = (
            <>
              <circle cx={x} cy={y} r={R} className={done ? `${KIND[task.kind % KIND.length]} stroke-transparent` : running ? "fill-panel stroke-signal" : isReady ? "fill-panel stroke-foreground" : "fill-panel stroke-border"} strokeWidth={running || isReady ? 2 : 1} strokeDasharray={isReady && !running ? "3 2" : undefined} opacity={done ? 0.85 : 1} />
              {touched.has(task.id) && <circle cx={x} cy={y} r={R + 4} fill="none" className="stroke-signal-3" strokeWidth={1.5} />}
              <text x={x} y={y + 3.5} textAnchor="middle" className={`font-mono text-[10px] ${done ? "fill-background" : "fill-current"}`}>{running ? `w${s.worker[task.id] + 1}` : task.id + 1}</text>
            </>
          );
          // Only a running task can be interfered with, so only that is a button.
          return running
            ? <g key={task.id} role="button" tabIndex={0} aria-label={`${t.task} ${task.id + 1}: ${what}. ${t.killHint}`} className="cursor-pointer" onClick={() => kill(task.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kill(task.id); } }} data-testid={`node-running-${task.id}`}>{body}</g>
            : <g key={task.id} role="img" aria-label={`${t.task} ${task.id + 1}: ${what}`}>{body}</g>;
        })}
      </svg>
      <Timeline job={job} run={soFar} workers={WORKERS} label={t.timeline} />
      <p className="min-h-10 text-sm" role="status" data-testid="graph-status">{over ? t.stepOver.replace("{m}", s.now.toFixed(1)) : sentence}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={step} disabled={over || playing} data-testid="graph-step"><StepForward aria-hidden />{t.nextStep}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPlaying(!playing)} disabled={over}>{playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? t.pause : t.autoplay}</Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw aria-hidden />{t.reset}</Button>
        </div>
        <div className="flex gap-6">
          <Readout label={t.clock} value={s.now.toFixed(1)} unit={t.minutes} tone="plain" />
          <Readout label={t.readyCount} value={ready.size} />
          <Readout label={t.leftCount} value={s.left} tone="muted" />
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {([["stroke-border", undefined, t.nodeWaiting], ["stroke-foreground", "3 2", t.nodeReady], ["stroke-signal", undefined, t.nodeRunningShort]] as const).map(([stroke, dash, name]) => (
          <li key={name} className="label flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><circle cx="7" cy="7" r="5.5" fill="none" className={stroke} strokeWidth="1.5" strokeDasharray={dash} /></svg>{name}</li>
        ))}
        <li className="label flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full bg-chart-1 opacity-85" />{t.nodeDone}</li>
      </ul>
    </div>
  );
}
