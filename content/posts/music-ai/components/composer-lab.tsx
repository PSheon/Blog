"use client";

import { Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Sparkline } from "@/components/lab/sparkline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";
import { NGRAM_LOSS } from "./music";
import { PianoRoll, VoiceLegend } from "./piano-roll";
import { usePlayer, useStopOnLeave } from "./player";
import type { Reply, Request, Snapshot } from "./protocol";
import { TIMBRES, type Timbre } from "./synth";
import { createMusicWorker } from "./worker-factory";

/** 2,400 steps of 8 windows: about three minutes (69 ms a step in Chromium on an M4 Pro; docs/research/music-ai). */
const STEPS = 2400;

export function TimbrePicker({ value, onChange }: { value: Timbre; onChange(t: Timbre): void }) {
  const t = useLabels();
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.timbre}>
      <span className="label mr-1">{t.timbre}</span>
      {TIMBRES.map((name) => (
        <button key={name} type="button" aria-pressed={value === name} onClick={() => onChange(name)}
          className={cn("tap rounded-sm border px-2 py-1 text-xs transition-colors", value === name ? "border-signal bg-signal/10 text-signal" : "border-input text-muted-foreground hover:text-foreground")}>
          {t.timbres[name]}
        </button>
      ))}
    </div>
  );
}

/** Fig. 01: the reader trains a composer in a worker and hears what it writes at six moments on the way. */
export function ComposerLab() {
  const t = useLabels();
  const worker = useRef<Worker | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "training" | "done" | "failed">("idle");
  const [losses, setLosses] = useState<number[]>([]), [progress, setProgress] = useState({ step: 0, seconds: 0 });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]), [chosen, setChosen] = useState<number | null>(null);
  const [timbre, setTimbre] = useState<Timbre>("pad"), [autoplay, setAutoplay] = useState(true);
  // Once the reader picks a snapshot themselves, a new one no longer takes the stage from under them.
  const [pinned, setPinned] = useState(false), [unheard, setUnheard] = useState<number[]>([]);
  const player = usePlayer();
  useStopOnLeave();
  const auto = useRef({ autoplay, timbre, pinned });
  useEffect(() => { auto.current = { autoplay, timbre, pinned }; }, [autoplay, timbre, pinned]);
  useEffect(() => () => worker.current?.terminate(), []);

  const start = () => {
    worker.current?.terminate();
    const w = createMusicWorker();
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.type === "loading") setState("loading");
      else if (data.type === "failed") setState("failed");
      else if (data.type === "progress") { setState("training"); setProgress({ step: data.step, seconds: data.seconds }); setLosses((l) => [...l, data.loss]); }
      else if (data.type === "snapshot") {
        const s = data.snapshot;
        setSnapshots((list) => [...list, s]);
        if (auto.current.pinned) { setUnheard((u) => [...u, s.step]); return; }
        setChosen(s.step);
        if (auto.current.autoplay) void player.play(`snap-${s.step}`, s.piece, auto.current.timbre);
      } else if (data.type === "done") { setState("done"); w.terminate(); worker.current = null; }
    };
    setLosses([]); setSnapshots([]); setChosen(null); setProgress({ step: 0, seconds: 0 }); setPinned(false); setUnheard([]);
    w.postMessage({ type: "train", seed: Math.floor(Math.random() * 2 ** 31), steps: STEPS } satisfies Request);
  };
  const stop = () => { worker.current?.terminate(); worker.current = null; setState("idle"); };

  const shown = snapshots.find((s) => s.step === chosen) ?? snapshots.at(-1) ?? null;
  const key = shown ? `snap-${shown.step}` : "snap-none";
  const playing = player.playing === key;
  const busy = state === "loading" || state === "training";
  const eta = state === "training" && progress.step > 0 ? (progress.seconds / progress.step) * (STEPS - progress.step) : null;

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <Button size="sm" variant="outline" onClick={stop}><Square aria-hidden />{t.stopTrain}</Button>
        ) : (
          <Button size="sm" onClick={start} data-testid="music-train"><Play aria-hidden />{state === "done" ? t.again : t.train}</Button>
        )}
        <span className="text-muted-foreground">{state === "loading" ? t.loading : state === "failed" ? t.failed : t.trainNote}</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress.step / STEPS) * 100)} aria-label={t.step}>
        <div className="h-full bg-signal transition-[width]" style={{ width: `${(progress.step / STEPS) * 100}%` }} />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label={t.step} value={progress.step} tone="muted" />
            <Readout label={t.seconds} value={progress.seconds.toFixed(0)} unit={t.secondsUnit} tone="muted" />
            <Readout label={t.eta} value={eta === null ? "–" : eta.toFixed(0)} unit={t.secondsUnit} tone="muted" />
            <Readout label={t.val} value={shown ? shown.val.toFixed(2) : "–"} tone={shown && shown.val < NGRAM_LOSS ? "signal" : "muted"} />
          </div>
          <div>
            <p className="label">{t.loss}</p>
            <Sparkline values={losses} label={t.loss} window={STEPS} reference={NGRAM_LOSS} />
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.lossNote}</p>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">{t.snapshots}</p>
            <label className="tap inline-flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} className="size-4 accent-[var(--signal)]" />
              {t.autoplay}
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.snapshots}>
            {snapshots.map((s) => (
              <button key={s.step} type="button" aria-pressed={shown?.step === s.step}
                onClick={() => { setChosen(s.step); setPinned(true); setUnheard((u) => u.filter((x) => x !== s.step)); void player.play(`snap-${s.step}`, s.piece, timbre); }}
                className={cn("tap inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-xs tabular transition-colors", shown?.step === s.step ? "border-signal bg-signal/10 text-signal" : "border-input text-muted-foreground hover:text-foreground")}>
                {t.snapshotAt(s.step)}
                {unheard.includes(s.step) && <span className="rounded-full bg-signal-2/15 px-1 text-[0.625rem] text-signal-2">{t.isNew}</span>}
              </button>
            ))}
          </div>
          <div className="rounded-sm border border-border bg-background/40 p-2">
            {shown ? <PianoRoll piece={shown.piece} label={t.roll(shown.step)} playKey={key} /> : <p className="grid h-32 place-items-center text-center text-muted-foreground">{t.waiting}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VoiceLegend names={t.voices} />
            <Button size="sm" variant="outline" disabled={!shown} onClick={() => (playing ? player.stop() : shown && void player.play(key, shown.piece, timbre))} data-testid="music-play">
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? t.stopPlay : t.play}
            </Button>
          </div>
          <TimbrePicker value={timbre} onChange={(v) => { setTimbre(v); player.restyle(v); }} />
          {shown && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" data-testid="music-report">
              <Readout label={t.inKey} value={(shown.report.inKey * 100).toFixed(0)} unit="%" tone="plain" />
              <Readout label={t.crossings} value={(shown.report.crossings * 100).toFixed(0)} unit="%" tone="plain" />
              <Readout label={t.held} value={(shown.report.held * 100).toFixed(0)} unit="%" tone="plain" />
              <Readout label={t.parallels} value={shown.report.parallels.toFixed(1)} unit={t.per100} tone="plain" />
              <Readout label={t.copied} value={shown.copied} unit={t.eighths} tone="plain" />
            </div>
          )}
          {shown && (
            <p className="text-xs leading-relaxed text-muted-foreground">{t.metricsNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}
