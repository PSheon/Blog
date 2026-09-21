"use client";

import { Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Sparkline } from "@/components/lab/sparkline";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import data from "../aapl-2024.json";
import { useLabels } from "./labels";
import { PriceChart } from "./price-chart";
import { type Result, Trainer, buyAndHold } from "./trading";

const STORAGE_KEY = "trading-agent:last-run:v1";
const LOG_ROWS = 60;

interface Run {
  result: Result;
  history: number[];
  params: { generations: number; population: number; mutation: number };
}

const hold = buyAndHold(data.closes);
const yearChange = (data.closes[data.closes.length - 1] / data.closes[0] - 1) * 100;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

function Param({ label, value, unit, min, max, disabled, onChange }: {
  label: string; value: number; unit?: string; min: number; max: number; disabled: boolean; onChange(v: number): void;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-sm tabular">{value}{unit}</span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={label}
        valueText={`${value}${unit ?? ""}`}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </label>
  );
}

export function TradingLab() {
  const t = useLabels();
  // Thirty, because that is what the article's numbers were measured at.
  const [generations, setGenerations] = useState(30);
  const [population, setPopulation] = useState(50);
  const [mutation, setMutation] = useState(15);
  const [run, setRun] = useState<Run | null>(null);
  const [progress, setProgress] = useState<{ generation: number; history: number[] } | null>(null);
  const [restored, setRestored] = useState(false);
  const timer = useRef<number | null>(null);

  // Bring back the reader's previous run, if this browser has one.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved) as Run;
        if (!parsed?.result?.trades || !Array.isArray(parsed.history)) return;
        setRun(parsed);
        setGenerations(parsed.params.generations);
        setPopulation(parsed.params.population);
        setMutation(parsed.params.mutation);
        setRestored(true);
      } catch {
        // Unreadable or blocked storage: start fresh.
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setProgress(null);
  };

  const train = () => {
    stop();
    setRestored(false);
    const trainer = new Trainer({ closes: data.closes, size: population, mutationRate: mutation / 100 });
    const params = { generations, population, mutation };

    // One generation per task, yielding in between so the page can repaint.
    const tick = () => {
      const { generation } = trainer.step();
      if (generation < generations) {
        setProgress({ generation, history: [...trainer.history] });
        timer.current = window.setTimeout(tick, 0);
        return;
      }
      const finished: Run = { result: trainer.best(), history: [...trainer.history], params };
      timer.current = null;
      setProgress(null);
      setRun(finished);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finished));
      } catch {
        // Storage full or blocked: the result still shows, it just won't persist.
      }
    };
    setProgress({ generation: 0, history: [] });
    timer.current = window.setTimeout(tick, 0);
  };

  const clear = () => {
    stop();
    setRun(null);
    setRestored(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clear
    }
  };

  const training = progress !== null;
  const history = progress?.history ?? run?.history ?? [];
  const result = training ? null : (run?.result ?? null);
  const buys = result?.trades.filter((x) => x.action === "buy").length ?? 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <p className="font-mono text-2xl leading-none">{data.symbol}</p>
          <p className="label mt-1.5">{t.period}</p>
        </div>
        <Readout label={t.change} value={pct(yearChange)} unit="%" tone="plain" className="text-right" />
      </div>

      <PriceChart closes={data.closes} dates={data.dates} trades={result?.trades ?? []} label={t.chart} />
      <p className="label -mt-3 flex gap-4">
        <span><span className="text-signal">▲</span> {t.buy}</span>
        <span><span className="text-signal-2">▼</span> {t.sell}</span>
      </p>

      <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-3">
        <Param label={t.generations} value={generations} min={1} max={100} disabled={training} onChange={setGenerations} />
        <Param label={t.population} value={population} min={10} max={500} disabled={training} onChange={setPopulation} />
        <Param label={t.mutation} value={mutation} unit="%" min={1} max={100} disabled={training} onChange={setMutation} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {training ? (
          <Button size="sm" variant="outline" onClick={stop}>
            <Square />
            {t.stop}
          </Button>
        ) : (
          <Button size="sm" onClick={train} data-testid="train">
            <Play />
            {run ? t.retrain : t.train}
          </Button>
        )}
        {run && !training && (
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 />
            {t.clear}
          </Button>
        )}
        <p className="text-sm text-muted-foreground" role="status">
          {training ? t.training(progress.generation, generations) : restored ? t.restored : !run ? t.idle : null}
        </p>
      </div>

      {training && (
        <div className="h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <div
            className="triad-gradient h-full origin-left transition-transform duration-150"
            style={{ transform: `scaleX(${progress.generation / generations})` }}
          />
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="label mb-1 flex justify-between">
            <span>{t.evolution}</span>
            <span>{t.holdLine} ({pct(hold.roi)}%)</span>
          </p>
          <Sparkline values={history} label={t.evolution} window={100} reference={hold.roi} />
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
            <Readout label={t.roi} value={<span data-testid="roi">{pct(result.roi)}</span>} unit="%" large className="col-span-2 sm:col-span-1 lg:col-span-2" />
            <Readout label={t.hold} value={pct(hold.roi)} unit="%" tone="alt" />
            <Readout label={t.gains} value={`${result.gains >= 0 ? "+" : "−"}$${Math.abs(result.gains).toFixed(0)}`} tone="plain" />
            <Readout label={`${t.buys} / ${t.sells}`} value={`${buys} / ${result.trades.length - buys}`} tone="plain" />
            <Readout label={t.shares} value={result.shares} tone="plain" />
          </div>

          <div>
            <p className="label mb-2">{t.log}</p>
            {result.trades.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noTrades}</p>
            ) : (
              <div tabIndex={0} role="group" aria-label={t.log} className="max-h-72 overflow-auto rounded-sm border border-border bg-background">
                <table className="w-full min-w-[28rem] border-collapse font-mono text-xs tabular">
                  <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                    <tr className="[&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                      <th>{t.day}</th>
                      <th>{t.action}</th>
                      <th className="text-right">{t.price}</th>
                      <th className="text-right">{t.ret}</th>
                      <th className="text-right">{t.cash}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, LOG_ROWS).map((trade, i) => (
                      <tr key={i} className="[&>td]:border-b [&>td]:border-border/60 [&>td]:px-3 [&>td]:py-1.5">
                        <td>{data.dates[trade.day]}</td>
                        <td className={trade.action === "buy" ? "text-signal" : "text-signal-2"}>
                          {trade.action === "buy" ? t.buy : t.sell}
                        </td>
                        <td className="text-right">{trade.price.toFixed(2)}</td>
                        <td className="text-right">{trade.returnPct === undefined ? "" : `${pct(trade.returnPct)}%`}</td>
                        <td className="text-right">{trade.cash.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.trades.length > LOG_ROWS && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t.more(result.trades.length - LOG_ROWS)}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
