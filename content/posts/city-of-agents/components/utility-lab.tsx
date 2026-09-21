"use client";

import { useState } from "react";
import { useLabels } from "./labels";
import { Param } from "@/components/lab/param";
import { PARAMS, utility } from "./sim";

/** Fig. 03: two things to do, each with a need behind it and a walk in front of it. The same function the city uses picks. */
export function UtilityLab() {
  const t = useLabels(), [options, setOptions] = useState([{ need: 0.8, walk: 40 }, { need: 0.7, walk: 5 }]);
  const scores = options.map((o) => utility({ action: "eat", place: 0, need: o.need, travelMinutes: o.walk, current: false }, PARAMS)), winner = scores[0] >= scores[1] ? 0 : 1;
  const set = (i: number, patch: Partial<{ need: number; walk: number }>) => setOptions((all) => all.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-6 sm:grid-cols-2">
        {options.map((o, i) => (
          <div key={i} className={`grid gap-3 rounded-md border p-3 ${i === winner ? "border-signal" : "border-border"}`} data-testid={`utility-option-${i}`}>
            <p className="label flex justify-between"><span className="text-foreground">{i === 0 ? t.optionA : t.optionB}</span>{i === winner && <span className="text-signal">{t.wins}</span>}</p>
            <Param label={t.need} shown={o.need.toFixed(2)} value={o.need} min={0} max={1} step={0.01} onChange={(v) => set(i, { need: v })} />
            <Param label={t.walk} value={o.walk} min={0} max={90} step={1} onChange={(v) => set(i, { walk: v })} />
            <div>
              <div className="flex items-baseline justify-between"><span className="label">{t.utilityOf}</span><span className="font-mono text-lg tabular text-signal">{scores[i].toFixed(3)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(0, Math.min(1, scores[i])) * 100}%` }} /></div>
            </div>
          </div>
        ))}
      </div>
      <p className="label">{t.formula}</p>
    </div>
  );
}
