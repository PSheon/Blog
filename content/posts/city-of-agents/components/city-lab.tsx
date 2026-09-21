"use client";

import { Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { personName, useLabels } from "./labels";
import { formatTime, type Mode, PARAMS } from "./sim";
import { SWATCH, useCity } from "./use-city";

const RATES = [1, 5, 20], MODES: Mode[] = ["utility", "fsm", "random"];

export function Legend() {
  const t = useLabels();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label={t.legend}>
      {(Object.keys(SWATCH) as (keyof typeof SWATCH)[]).map((k) => (
        <li key={k} className="label flex items-center gap-1.5">
          <span className="dark contents"><span aria-hidden className={`size-2.5 rounded-full border border-border ${SWATCH[k]}`} /></span>
          {t.actions[k]}
        </li>
      ))}
    </ul>
  );
}

/**
 * The city and the people in it, with as few controls as the point needs: play, speed, follow someone. With `modes`,
 * also who decides and whether duty exists — the same city and the same legs under a different head.
 */
export function CityLab({ seed = 1, n = 8, agents = 300, modes = false }: { seed?: number; n?: number; agents?: number; modes?: boolean }) {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const { session, ready, panel, publish } = useCity(root, canvas, { seed, n, agents }, 0);
  const [, refresh] = useState(0), s = session.current, running = s?.running ?? true, rate = s?.rate ?? 1, follow = panel?.follow ?? -1;
  const act = (f: () => void) => { f(); s?.touch(); publish(); refresh((v) => v + 1); };

  return (
    <div ref={root} className="grid gap-3 text-sm">
      {/* The scene has its own sky, so it and its colours stay the same in both themes. */}
      <div className="dark relative">
        <canvas ref={canvas} role="img" aria-label={t.scene} className="aspect-[4/5] w-full cursor-pointer rounded-sm bg-[#070918] sm:aspect-[16/9]" data-testid="city-canvas"
          onClick={(e) => act(() => s?.setFollow(s.pick(e.clientX, e.clientY)))} />
        {!ready && <p className="label absolute inset-0 grid place-items-center text-muted-foreground">{t.loading}</p>}
        {follow >= 0 && <p className="label absolute top-2 left-2 rounded-sm bg-background/80 px-2 py-1 text-foreground" role="status">{t.following} · {personName(t, follow)}</p>}
      </div>
      <Legend />
      {modes && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.mode}>
            <span className="label mr-1">{t.mode}</span>
            {MODES.map((m) => <Button key={m} size="sm" variant={m === (panel?.mode ?? "utility") ? "default" : "ghost"} aria-pressed={m === (panel?.mode ?? "utility")} onClick={() => act(() => s?.setMode(m))} data-testid={`city-mode-${m}`}>{t.modes[m]}</Button>)}
          </div>
          <label className="label flex min-h-6 items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--signal)]" checked={panel?.duty ?? true} onChange={(e) => act(() => s?.setDuty(e.target.checked))} />
            {t.duty}
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.speed}>
          <Button size="sm" variant="outline" onClick={() => act(() => { if (s) s.running = !s.running; })}>
            {running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {running ? t.pause : t.play}
          </Button>
          {RATES.map((r) => <Button key={r} size="sm" variant={r === rate ? "default" : "ghost"} aria-pressed={r === rate} onClick={() => act(() => { if (s) s.rate = r; })}>{r}×</Button>)}
          <Button size="sm" variant="ghost" disabled={!ready} onClick={() => act(() => s?.setFollow(follow >= 0 ? -1 : Math.floor(Math.random() * (s?.frame.count ?? 1))))} data-testid="city-follow">
            {follow >= 0 ? t.backToCity : t.followSomeone}
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Readout label={t.clock} value={formatTime(panel?.t ?? PARAMS.startMinute)} tone="plain" />
          {modes && <Readout label={t.peak} value={Math.round((panel?.peak ?? 0) * 100)} unit="%" />}
          <Readout label={t.frame} value={(panel?.frame ?? 0).toFixed(1)} unit={t.frameUnit} />
        </div>
      </div>
    </div>
  );
}
