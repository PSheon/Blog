"use client";

import { Check, Heart, Pause, Play, Shuffle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TimbrePicker } from "./composer-lab";
import { useLabels } from "./labels";
import { PianoRoll, VoiceLegend } from "./piano-roll";
import { usePlayer, useStopOnLeave } from "./player";
import type { BlindItem } from "./protocol";
import { useSharedWorker } from "./shared-worker";
import type { Timbre } from "./synth";

type Who = BlindItem["who"];
const WHO: Who[] = ["bach", "ai", "rules"];
const LETTERS = ["A", "B", "C"];

/** Fig. 03: Bach, the AI and five lines of maths, unlabelled. Guess who wrote what, and say which one you liked. */
export function BlindLab() {
  const t = useLabels();
  const [state, setState] = useState<"idle" | "loading" | "listening" | "revealed" | "failed">("idle");
  const [items, setItems] = useState<BlindItem[]>([]);
  const [guesses, setGuesses] = useState<(Who | null)[]>([null, null, null]);
  const [favourite, setFavourite] = useState<number | null>(null);
  const [timbre, setTimbre] = useState<Timbre>("pad");
  const player = usePlayer();
  useStopOnLeave();
  const send = useSharedWorker((data) => {
    if (data.type === "loading") setState("loading");
    else if (data.type === "failed") setState("failed");
    else if (data.type === "blind") { setItems(data.items); setState("listening"); }
  });

  const deal = () => {
    player.stop();
    setGuesses([null, null, null]);
    setFavourite(null);
    setItems([]);
    send({ type: "blind" });
  };

  if (state === "idle" || state === "loading" || state === "failed")
    return (
      <div className="grid place-items-center gap-3 py-10 text-center text-sm">
        <Button size="sm" onClick={deal} disabled={state === "loading"} data-testid="music-blind-deal"><Shuffle aria-hidden />{t.blindStart}</Button>
        <p className="max-w-md text-muted-foreground">{state === "failed" ? t.failed : state === "loading" ? t.judgeLoading : t.blindHow}</p>
      </div>
    );

  const revealed = state === "revealed";
  const right = items.filter((item, i) => guesses[i] === item.who).length;

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">{t.blindHow}</p>
        <TimbrePicker value={timbre} onChange={(v) => { setTimbre(v); player.restyle(v); }} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item, i) => {
          const key = `blind-${i}-${item.who}`, playing = player.playing === key;
          const correct = guesses[i] === item.who;
          return (
            <div key={key} className={cn("grid content-start gap-2 rounded-sm border p-3", revealed ? (correct ? "border-signal/60" : "border-signal-2/60") : "border-border", "bg-background/40")}>
              <div className="flex items-center justify-between gap-2">
                <p className="label text-foreground">{LETTERS[i]}</p>
                <Button size="sm" variant="outline" onClick={() => (playing ? player.stop() : void player.play(key, item.piece, timbre))} data-testid={`music-blind-play-${i}`}>
                  {playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? t.stopPlay : t.play}
                </Button>
              </div>

              {/* No roll before the answers: a chorale and a block-chord machine look nothing alike, which would give it away. */}
              {revealed && <PianoRoll piece={item.piece} label={t.rollPlain} playKey={key} className="h-20 w-full" />}

              <fieldset className="grid gap-1.5" disabled={revealed}>
                <legend className="label mb-1">{t.blindGuess}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WHO.map((who) => (
                    <button key={who} type="button" aria-pressed={guesses[i] === who} onClick={() => setGuesses((g) => g.map((x, k) => (k === i ? who : x)))}
                      className={cn("tap rounded-sm border px-2 py-1 text-xs transition-colors disabled:opacity-60",
                        guesses[i] === who ? "border-signal bg-signal/10 text-signal" : "border-input text-muted-foreground hover:text-foreground")}>
                      {t.blindWho[who]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button type="button" aria-pressed={favourite === i} onClick={() => setFavourite(i)}
                className={cn("tap inline-flex items-center gap-1.5 self-start rounded-sm border px-2 py-1 text-xs transition-colors",
                  favourite === i ? "border-signal-2 bg-signal-2/10 text-signal-2" : "border-input text-muted-foreground hover:text-foreground")}>
                <Heart className={cn("size-3", favourite === i && "fill-current")} aria-hidden />{t.blindFavourite}
              </button>

              {revealed && (
                <div className="grid gap-1 border-t border-border pt-2 font-mono text-xs">
                  <p className={correct ? "text-signal" : "text-signal-2"}>
                    {t.blindAnswer}: {t.blindWho[item.who]} · {correct ? t.blindCorrect : t.blindWrong}
                  </p>
                  <p className="text-muted-foreground">{t.parallels} {item.report.parallels.toFixed(1)} · {t.blindChords} {item.report.chords.toFixed(0)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {revealed && <VoiceLegend names={t.voices} />}

      <div className="flex flex-wrap items-center gap-3" role="status">
        {revealed ? (
          <>
            <span className="font-mono tabular" data-testid="music-blind-score">{t.blindScore(right)}</span>
            {favourite !== null && items[favourite] && <span className="text-muted-foreground">{t.blindYours} {t.blindWho[items[favourite].who]}</span>}
            <Button size="sm" variant="outline" onClick={deal}><Shuffle aria-hidden />{t.blindAgain}</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => { player.stop(); setState("revealed"); }} disabled={guesses.some((g) => g === null)} data-testid="music-blind-reveal">
              <Check aria-hidden />{t.blindReveal}
            </Button>
            <span className="text-muted-foreground">{guesses.some((g) => g === null) ? t.blindNeedAll : t.blindWaiting}</span>
          </>
        )}
      </div>
    </div>
  );
}
