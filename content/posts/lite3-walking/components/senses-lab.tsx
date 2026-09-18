"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";
import { JOINTS, OBS, SENSES, type Sense } from "./policy";
import { resetRobot, useRig } from "./rig";
import type { Knobs, Lite3Sim } from "./sim";
import { Stage } from "./stage";

const ID = "senses";
const GROUPS = Object.keys(SENSES) as Sense[];
const RATE = 12;

/** Fig. 02: everything the policy is shown and everything it answers, with a blindfold per sense. */
export function SensesLab() {
  const t = useLabels();
  const { active } = useRig();
  const [blind, setBlind] = useState<Sense | null>(null);
  const [seen, setSeen] = useState({ obs: new Float32Array(OBS), action: new Float32Array(JOINTS), speed: 0, up: 0, fallen: false, falls: 0 });
  const tally = useRef({ since: 0, speed: 0, falls: 0, wasDown: false, start: 0 });
  const knobs = useMemo<Partial<Knobs>>(() => ({ blind }), [blind]);

  const onFrame = useCallback((sim: Lite3Sim, dt: number) => {
    const c = tally.current, [vx, vy] = sim.velocity;
    c.speed += (Math.hypot(vx, vy) - c.speed) * Math.min(1, dt / 0.35);
    if (sim.fallen && !c.wasDown) c.falls++;
    c.wasDown = sim.fallen;
    if ((c.since += dt) < 1 / RATE) return;
    c.since = 0;
    setSeen({ obs: sim.observation.slice(), action: sim.action.slice(), speed: c.speed, up: sim.fellAt ?? sim.time, fallen: sim.fallen, falls: c.falls });
  }, []);

  const choose = (sense: Sense) => {
    tally.current.falls = 0;
    resetRobot(); // every blindfold starts from the same standing pose, like the measurements in the text
    setBlind((b) => (b === sense ? null : sense));
  };

  const live = active === ID;
  return (
    <div className="grid gap-4 text-sm">
      <Stage id={ID} knobs={knobs} onFrame={onFrame} note={seen.fallen && live ? t.fell : undefined} />
      <div className="grid grid-cols-3 gap-3">
        <Readout label={t.upFor} value={live ? seen.up.toFixed(1) : "–"} unit={t.seconds} tone={seen.fallen ? "alt" : "signal"} />
        <Readout label={t.got} value={live ? seen.speed.toFixed(2) : "–"} unit={t.mps} tone="plain" />
        <Readout label={t.fallsCount} value={live ? seen.falls : "–"} tone="plain" />
      </div>
      <div>
        <p className="label mb-2">{t.senses}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {GROUPS.map((sense) => {
            const [from, to] = SENSES[sense], off = blind === sense;
            return (
              <div key={sense} className="grid min-w-0 gap-1.5">
                <Bars values={seen.obs.subarray(from, to)} limit={1.5} muted={off} label={t.senseNames[sense]} />
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <span className={cn("truncate", off && "text-muted-foreground line-through")}>{t.senseNames[sense]}</span>
                  {/* Blindfolding the command is the same as asking it to stand still, so it gets no switch. */}
                  {sense !== "command" && (
                    <Button size="sm" variant={off ? "default" : "outline"} aria-pressed={off} aria-label={`${t.blindfold}: ${t.senseNames[sense]}`} onClick={() => choose(sense)}>
                      {off ? t.blinded : t.blindfold}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="label mb-2">{t.actions}</p>
        <Bars values={seen.action} limit={3} label={t.actions} tone="alt" />
      </div>
    </div>
  );
}

/** Signed bars around a centre line; values beyond ±limit are clipped. */
function Bars({ values, limit, muted, label, tone = "signal" }: { values: Float32Array; limit: number; muted?: boolean; label: string; tone?: "signal" | "alt" }) {
  const n = values.length, H = 40;
  return (
    <svg viewBox={`0 0 ${n * 10} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("h-10 w-full rounded-sm border border-border bg-background", muted && "opacity-40")}>
      <line x1={0} x2={n * 10} y1={H / 2} y2={H / 2} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
      {Array.from(values, (v, i) => {
        const h = (Math.min(limit, Math.abs(v)) / limit) * (H / 2 - 2);
        return <rect key={i} x={i * 10 + 1.5} width={7} y={v >= 0 ? H / 2 - h : H / 2} height={h} fill={tone === "alt" ? "var(--signal-2)" : "var(--signal)"} />;
      })}
    </svg>
  );
}
