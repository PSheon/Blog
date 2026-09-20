"use client";

import { Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { Legend } from "./city-lab";
import { personName, useLabels } from "./labels";
import { DepartureChart, EventStream, StatusTable, Timeline } from "./overseer-panel";
import { Param } from "./param";
import { MAX_N, MIN_N, type Mode, PARAMS } from "./sim";
import { useCity } from "./use-city";

const MODES: Mode[] = ["utility", "fsm", "random"];

/**
 * Fig. 05: the whole bench. The scene on the left; on the right everyone's state, the event record as sentences, every
 * knob, and a timeline that goes back through the record without re-simulating anything.
 */
export function OverseerLab({ seed = 1, n = 8, agents = 300 }: { seed?: number; n?: number; agents?: number }) {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const { session, ready, panel, publish } = useCity(root, canvas, { seed, n, agents }, 9);
  const [, refresh] = useState(0), [count, setCount] = useState<number | null>(null), s = session.current;
  const act = (f: () => void) => { f(); s?.touch(); publish(); refresh((v) => v + 1); };
  const running = s?.running ?? true, follow = panel?.follow ?? -1, setup = s?.setup ?? { seed, n, agents };

  return (
    <div ref={root} className="grid gap-4 text-sm lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-3">
        <div className="dark relative">
          <canvas ref={canvas} role="img" aria-label={t.scene} className="aspect-[4/5] w-full cursor-pointer rounded-sm bg-[#070918] sm:aspect-[4/3]" data-testid="city-canvas"
            onClick={(e) => act(() => s?.setFollow(s.pick(e.clientX, e.clientY)))} />
          {!ready && <p className="label absolute inset-0 grid place-items-center text-muted-foreground">{t.loading}</p>}
          {follow >= 0 && <p className="label absolute top-2 left-2 rounded-sm bg-background/80 px-2 py-1 text-foreground" role="status">{t.following} · {personName(t, follow)}</p>}
          {panel?.replaying && <p className="label absolute top-2 right-2 rounded-sm bg-background/80 px-2 py-1 text-signal-2">● {t.replay}</p>}
        </div>
        <Legend />
        <p className="label">{t.pickHint}</p>
        {panel && <Timeline t={t} panel={panel} onSeek={(time) => act(() => s?.setReplay(time >= panel.now ? null : time))} onLive={() => act(() => s?.setReplay(null))} />}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Readout label={t.peak} value={Math.round((panel?.peak ?? 0) * 100)} unit="%" />
          <Readout label={t.sync} value={Math.round((panel?.sync ?? 0) * 100)} unit="%" tone="plain" />
          <Readout label={t.frame} value={(panel?.frame ?? 0).toFixed(1)} unit={t.frameUnit} />
          <Readout label={t.calls} value={panel?.calls ?? 0} tone="muted" />
        </div>
        {panel && <DepartureChart t={t} histogram={panel.histogram} people={panel.people.length} />}
        <p className="label">{t.peakHint}</p>
      </div>

      <div className="grid content-start gap-4">
        <p className="label text-foreground">{t.overseer}</p>
        {panel && s && <StatusTable t={t} city={panel.city} people={panel.people} follow={follow} onFollow={(id) => act(() => s.setFollow(id))} />}
        {panel && <EventStream t={t} city={panel.city} events={panel.events} />}
        <div className="grid gap-3 border-t border-border pt-3">
          <p className="label text-foreground">{t.knobs}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => act(() => { if (s) s.running = !s.running; })} data-testid="city-play">
              {running ? <Pause aria-hidden /> : <Play aria-hidden />}
              {running ? t.pause : t.play}
            </Button>
            <label className="label ml-2 flex min-h-6 items-center gap-2">
              <input type="checkbox" className="size-4 accent-[var(--signal)]" checked={panel?.duty ?? true} onChange={(e) => act(() => s?.setDuty(e.target.checked))} />
              {t.duty}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.mode}>
            {MODES.map((m) => <Button key={m} size="sm" variant={m === (panel?.mode ?? "utility") ? "secondary" : "ghost"} aria-pressed={m === (panel?.mode ?? "utility")} onClick={() => act(() => s?.setMode(m))} data-testid={`overseer-mode-${m}`}>{t.modes[m]}</Button>)}
          </div>
          <Param label={t.rate} shown={`${s?.rate ?? 1}×`} value={s?.rate ?? 1} min={1} max={20} step={1} onChange={(v) => act(() => { if (s) s.rate = v; })} />
          <Param label={t.count} value={count ?? setup.agents} min={10} max={300} step={10} onChange={setCount} />
          <Param label={t.separation} shown={(s?.world.separationWeight ?? PARAMS.separationWeight).toFixed(1)} value={s?.world.separationWeight ?? PARAMS.separationWeight} min={0} max={3} step={0.1} onChange={(v) => act(() => { if (s) s.world.separationWeight = v; })} />
          <Param label={`N × N`} shown={`${setup.n} × ${setup.n}`} value={setup.n} min={MIN_N} max={MAX_N} step={1} onChange={(v) => act(() => s?.rebuild({ ...setup, n: v, agents: count ?? setup.agents }))} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label">{t.seed} <span className="font-mono tabular text-foreground">{setup.seed}</span></span>
            <span className="flex gap-1.5">
              {count !== null && count !== setup.agents && <Button size="sm" variant="outline" onClick={() => act(() => { s?.rebuild({ ...setup, agents: count }); setCount(null); })}>{count} {t.people} ↵</Button>}
              <Button size="sm" variant="outline" onClick={() => act(() => s?.rebuild({ ...setup, seed: setup.seed + 1, agents: count ?? setup.agents }))} data-testid="city-regenerate">{t.regenerate}</Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
