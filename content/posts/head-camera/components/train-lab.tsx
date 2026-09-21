"use client";

import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Sparkline } from "@/components/lab/sparkline";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { HOLD, HOME, K, NO_SHIFT, Policy, SIZE, TOL, type XY, advance, picture, somewhere, view } from "./model";
import { Param } from "./param";
import type { Reply, Request } from "./protocol";

const DOTS = ["#ffff00", "#00ff00", "#ff00ff", "#ffffff", "#000000", "#ff8000", "#00a0ff", "#a0ffa0"];

function paint(canvas: HTMLCanvasElement | null, bytes: Uint8Array) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const image = context.createImageData(SIZE, SIZE);
  for (let i = 0, o = 0; i < bytes.length; i += 3, o += 4) { image.data[o] = bytes[i]; image.data[o + 1] = bytes[i + 1]; image.data[o + 2] = bytes[i + 2]; image.data[o + 3] = 255; }
  context.putImageData(image, 0, 0);
}
const deg = Math.PI / 180, TRIAL_MS = 130, MAX_STEPS = 40;

type Progress = Extract<Reply, { type: "progress" }>;
type Done = Extract<Reply, { type: "done" }>;

/** Fig. 02: the reader trains keep-looking + shaken camera in a worker, watches the keypoints settle, then tests it. */
export function TrainLab() {
  const t = useLabels();
  const worker = useRef<Worker | null>(null), probe = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "training" | "testing" | "done">("idle");
  const [pitch, setPitch] = useState(0), [trial, setTrial] = useState({ reached: 0, tried: 0, keys: [] as XY[] }), tilt = useRef(0);
  useEffect(() => { tilt.current = pitch; }, [pitch]);
  const [progress, setProgress] = useState<Progress | null>(null), [losses, setLosses] = useState<number[]>([]), [done, setDone] = useState<Done | null>(null);

  // The probe is the worker's fixed picture (train.worker.ts PROBE); draw it before training so the figure is not empty.
  useEffect(() => { paint(probe.current, view([0.34, -0.1], [0.44, 0.08], NO_SHIFT)); return () => worker.current?.terminate(); }, []);

  const start = () => {
    worker.current?.terminate();
    const w = new Worker(new URL("./train.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.type === "probe") paint(probe.current, data.bytes);
      else if (data.type === "progress") { setProgress(data); setLosses((l) => [...l, data.loss]); }
      else if (data.type === "testing") setState("testing");
      else { setDone(data); setState("done"); setTrial({ reached: 0, tried: 0, keys: [] }); w.terminate(); worker.current = null; }
    };
    setProgress(null); setLosses([]); setDone(null); setState("training");
    w.postMessage({ type: "start", seed: Math.floor(Math.random() * 2 ** 31) } satisfies Request);
  };
  const stop = () => { worker.current?.terminate(); worker.current = null; setState("idle"); };

  // Once trained, the reader's own model runs episode after episode in the same little picture, under a tilt they choose.
  useEffect(() => {
    if (!done) return;
    const policy = new Policy(done.saved);
    let tip: XY = [...HOME], block = somewhere(Math.random), steps = 0, held = 0, rest = 0, reached = 0, tried = 0;
    const timer = setInterval(() => {
      const shift = { ...NO_SHIFT, pitch: tilt.current * deg };
      if (rest > 0) { if (--rest === 0) { tip = [...HOME]; block = somewhere(Math.random); steps = 0; held = 0; } return; }
      const bytes = view(tip, block, shift), r = policy.run(picture(bytes));
      paint(probe.current, bytes);
      tip = advance(tip, r.out); steps++;
      held = Math.hypot(tip[0] - block[0], tip[1] - block[1]) < TOL ? held + 1 : 0;
      if (held >= HOLD || steps >= MAX_STEPS) { tried++; if (held >= HOLD) reached++; rest = 5; }
      setTrial({ reached, tried, keys: r.keypoints });
    }, TRIAL_MS);
    return () => clearInterval(timer);
  }, [done]);

  const keys: XY[] = done ? trial.keys : progress?.keypoints ?? [];
  const fraction = progress ? progress.step / progress.steps : 0;
  const eta = progress && progress.step > 0 ? (progress.seconds / progress.step) * (progress.steps - progress.step) : null;
  return (
    <div className="grid gap-4 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
        <div className="grid content-start gap-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#181c2c]">
            <canvas ref={probe} width={SIZE} height={SIZE} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" role="img" aria-label={t.eye} data-testid="headcam-probe" />
            <svg viewBox="-1 -1 2 2" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {keys.slice(0, K).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.05} fill={DOTS[i]} stroke="#000" strokeWidth={0.012} />)}
            </svg>
          </div>
          <p className="label">{done ? t.trialLabel : t.probe}</p>
        </div>
        <div className="grid content-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {state === "training" ? (
              <Button size="sm" variant="outline" onClick={stop}><Square aria-hidden />{t.stop}</Button>
            ) : (
              <Button size="sm" onClick={start} disabled={state === "testing"} data-testid="headcam-train"><Play aria-hidden />{state === "done" ? t.again : t.train}</Button>
            )}
            <span className="text-muted-foreground">{t.trainNote}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label={t.step}>
            <div className="h-full bg-signal transition-[width]" style={{ width: `${fraction * 100}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Readout label={t.step} value={`${progress?.step ?? 0}`} tone="muted" />
            <Readout label={t.seconds} value={(progress?.seconds ?? 0).toFixed(0)} unit={t.secondsUnit} tone="muted" />
            <Readout label={t.eta} value={eta === null || state !== "training" ? "–" : eta.toFixed(0)} unit={t.secondsUnit} tone="muted" />
          </div>
          <div>
            <p className="label">{t.loss}</p>
            <Sparkline values={losses} label={t.loss} window={200} />
          </div>
          <div role="status" data-testid="headcam-train-status">
            {state === "testing" && <p className="text-muted-foreground">{t.testing}</p>}
            {done && (
              <div className="grid gap-2">
                <p className="label">{t.result} · {t.episodes(done.episodes)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Readout label={t.straight} value={(done.straight * 100).toFixed(0)} unit="%" />
                  <Readout label={t.pitched} value={(done.pitched * 100).toFixed(0)} unit="%" />
                </div>
                <p className="label mt-2">{t.trialTitle}</p>
                <Param label={t.pitch} shown={`${pitch}°`} value={pitch} min={-10} max={20} step={1} onChange={setPitch} />
                <p className="font-mono tabular" data-testid="headcam-trial">{t.trialCount(trial.reached, trial.tried)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
