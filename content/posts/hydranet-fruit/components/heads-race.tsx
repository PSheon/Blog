"use client";

import { Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { createSceneSource } from "./emoji";
import { useLabels } from "./labels";
import { type Heads, HydraNet } from "./model";
import type { Scene } from "./scene";

const SAMPLES = 6000;
const ORDER: Heads[] = ["both", "box", "mask"];

interface Row {
  box: number | null;
  mask: number | null;
  perSec: number;
  seconds: number;
}

/**
 * The experiment behind the article's claim, run in the reader's browser: the same weights, the
 * same images, three choices of heads. Within one race the three networks share their seeds, so they
 * differ only in what is trained. Each new race uses new seeds: re-running is how the reader sees that
 * a gap from a single run is mostly noise.
 */
export function HeadsRace() {
  const t = useLabels();
  const [rows, setRows] = useState<Partial<Record<Heads, Row>>>({});
  const [progress, setProgress] = useState<{ heads: Heads; done: number } | null>(null);
  const cancel = useRef(false);
  const [race, setRace] = useState(0);

  useEffect(() => () => void (cancel.current = true), []);

  const run = async () => {
    cancel.current = false;
    const seed = race + 1;
    setRace(seed);
    setRows({});
    const source = createSceneSource();
    const test: Scene[] = Array.from({ length: 60 }, ((r) => () => source.next(r))(mulberry32(777)));

    for (const heads of ORDER) {
      const net = new HydraNet({ heads, skip: "slim", boxWeight: 1 }, mulberry32(1000 + seed));
      const data = mulberry32(2000 + seed);
      let trainMs = 0;
      while (net.seen < SAMPLES) {
        if (cancel.current) return;
        const deadline = performance.now() + 12;
        do {
          const batch = Array.from({ length: 8 }, () => source.next(data));
          const t0 = performance.now();
          net.step(batch);
          trainMs += performance.now() - t0;
        } while (performance.now() < deadline && net.seen < SAMPLES);
        setProgress({ heads, done: net.seen / SAMPLES });
        await new Promise((r) => requestAnimationFrame(r));
      }
      const score = net.evaluate(test);
      setRows((prev) => ({
        ...prev,
        [heads]: { box: heads === "mask" ? null : score.box, mask: heads === "box" ? null : score.mask, perSec: (SAMPLES / trainMs) * 1000, seconds: trainMs / 1000 },
      }));
    }
    setProgress(null);
  };

  const done = ORDER.every((h) => rows[h]);
  const separate = done ? rows.box!.seconds + rows.mask!.seconds : null;
  const cell = "border-b border-border/60 px-3 py-2 text-right tabular";

  return (
    <div className="grid gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{t.raceIntro}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={run} disabled={progress !== null} data-testid="hy-race">
          <Flag />
          {done ? t.raceAgain : t.race}
        </Button>
        {race > 0 && !progress && <p className="label">{t.raceSeed(race)}</p>}
        {progress && (
          <p className="text-sm text-muted-foreground" role="status">
            {t.racing(t.headNames[progress.heads], Math.round(progress.done * 100))}
          </p>
        )}
      </div>
      {/* Scrolls sideways on a phone, so it has to be reachable by keyboard (WCAG 2.1.1). */}
      <div tabIndex={0} role="group" aria-label={t.raceCols.config} className="overflow-x-auto rounded-sm border border-border bg-background">
        <table className="w-full min-w-[30rem] border-collapse font-mono text-xs" data-testid="hy-race-table">
          <thead className="text-muted-foreground">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-normal">{t.raceCols.config}</th>
              <th className="border-b border-border px-3 py-2 text-right font-normal">{t.raceCols.box}</th>
              <th className="border-b border-border px-3 py-2 text-right font-normal">{t.raceCols.mask}</th>
              <th className="border-b border-border px-3 py-2 text-right font-normal">{t.raceCols.speed}</th>
              <th className="border-b border-border px-3 py-2 text-right font-normal">{t.raceCols.time}</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((h) => {
              const r = rows[h];
              return (
                <tr key={h}>
                  <td className="border-b border-border/60 px-3 py-2 font-sans text-sm">{t.headNames[h]}</td>
                  <td className={cell}>{r ? (r.box === null ? "–" : r.box.toFixed(3)) : ""}</td>
                  <td className={cell}>{r ? (r.mask === null ? "–" : r.mask.toFixed(3)) : ""}</td>
                  <td className={cell}>{r ? Math.round(r.perSec) : ""}</td>
                  <td className={cell}>{r ? t.seconds(r.seconds) : <span className="font-sans text-muted-foreground">{t.notRun}</span>}</td>
                </tr>
              );
            })}
            <tr>
              <td className="px-3 py-2 font-sans text-sm text-muted-foreground" colSpan={4}>{t.raceTwo}</td>
              <td className="px-3 py-2 text-right tabular text-signal-2">{separate === null ? "" : t.seconds(separate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
