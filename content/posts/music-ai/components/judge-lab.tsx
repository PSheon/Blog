"use client";

import { Check, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import type { Piece, Report } from "./music";
import { PianoRoll, VoiceLegend } from "./piano-roll";
import { usePlayer, useStopOnLeave } from "./player";
import { useSharedWorker } from "./shared-worker";

import { TimbrePicker } from "./composer-lab";
import type { Timbre } from "./synth";

/** Fig. 02: the reader is the judge. Two candidates, one pick, one DPO step; the numbers show what the picks did. */
export function JudgeLab() {
  const t = useLabels();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "thinking" | "failed">("idle");
  const [pair, setPair] = useState<[Piece, Piece] | null>(null), [round, setRound] = useState(0);
  const [stats, setStats] = useState<{ choices: number; now: Report; before: Report } | null>(null);
  const [timbre, setTimbre] = useState<Timbre>("pad");
  const player = usePlayer();
  useStopOnLeave();
  // The reply arrives long after the click, so the worker callback reads the timbre through a ref.
  const timbreRef = useRef(timbre);
  useEffect(() => { timbreRef.current = timbre; }, [timbre]);
  const send = useSharedWorker((data) => {
    if (data.type === "loading") setState("loading");
    else if (data.type === "failed") setState("failed");
    else if (data.type === "pair") { setPair(data.pieces); setRound((r) => r + 1); setState("ready"); }
    else if (data.type === "judged") setStats({ choices: data.choices, now: data.now, before: data.before });
    else if (data.type === "sample") void player.play("judge-fresh", data.piece, timbreRef.current);
  });
  const load = () => { setStats(null); send({ type: "judge" }); };
  const pick = (winner: 0 | 1) => {
    player.stop();
    setState("thinking");
    send({ type: "choose", winner });
  };

  if (state === "idle" || state === "loading" || state === "failed")
    return (
      <div className="grid place-items-center gap-3 py-10 text-center text-sm">
        <Button size="sm" onClick={load} disabled={state === "loading"} data-testid="music-judge-load"><Play aria-hidden />{t.judgeStart}</Button>
        <p className="max-w-md text-muted-foreground">{state === "loading" ? t.judgeLoading : state === "failed" ? t.failed : `${t.judgeNote} ${t.judgeHint}`}</p>
      </div>
    );

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium" role="status">{state === "thinking" ? t.thinking : t.judgeReady}</p>
        <TimbrePicker value={timbre} onChange={(v) => { setTimbre(v); player.restyle(v); }} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => {
          const key = `judge-${round}-${i}`, piece = pair?.[i] ?? null, playing = player.playing === key;
          return (
            <div key={i} className="grid gap-2 rounded-sm border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="label text-foreground">{t.candidate(i)}</p>
                <Button size="sm" variant="outline" disabled={!piece} onClick={() => (playing ? player.stop() : piece && void player.play(key, piece, timbre))}>
                  {playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? t.stopPlay : t.play}
                </Button>
              </div>
              {piece && <PianoRoll piece={piece} label={t.roll(0)} playKey={key} className="h-24 w-full" />}
              <Button size="sm" onClick={() => pick(i as 0 | 1)} disabled={state !== "ready"} data-testid={`music-pick-${i}`}><Check aria-hidden />{t.pick}</Button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VoiceLegend names={t.voices} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!stats || state === "thinking"} onClick={() => { const playing = player.playing === "judge-fresh"; player.stop(); if (!playing) send({ type: "sample" }); }} data-testid="music-judge-listen">
            {player.playing === "judge-fresh" ? <Pause aria-hidden /> : <Volume2 aria-hidden />}{t.judgeListen}
          </Button>
          <Button size="sm" variant="outline" disabled={!stats} onClick={() => { player.stop(); load(); }}><RotateCcw aria-hidden />{t.judgeReset}</Button>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="label">{stats ? `${t.choices(stats.choices)} · ${t.since}` : t.judgeHint}</p>
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="music-judge-stats">
            <Readout label={t.held} value={`${(stats.before.held * 100).toFixed(0)} → ${(stats.now.held * 100).toFixed(0)}`} unit="%" tone="plain" />
            <Readout label={t.parallels} value={`${stats.before.parallels.toFixed(1)} → ${stats.now.parallels.toFixed(1)}`} unit={t.per100} tone="plain" />
            <Readout label={t.crossings} value={`${(stats.before.crossings * 100).toFixed(0)} → ${(stats.now.crossings * 100).toFixed(0)}`} unit="%" tone="plain" />
            <Readout label={t.inKey} value={`${(stats.before.inKey * 100).toFixed(0)} → ${(stats.now.inKey * 100).toFixed(0)}`} unit="%" tone="plain" />
          </div>
        )}
      </div>
    </div>
  );
}
