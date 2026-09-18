"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";
import { Param } from "./param";
import { pushRobot, useRig } from "./rig";
import type { Knobs, Lite3Sim } from "./sim";
import { Stage } from "./stage";
import { Traces } from "./traces";

const ID = "push";
const KNOBS: Partial<Knobs> = {};
const WINDOW = 6, RATE = 30, SLOTS = WINDOW * RATE;
/** A shove counts as survived if it is still up this long afterwards (s). */
const VERDICT_AFTER = 2.5;

interface Shove {
  newtons: number;
  side: "away" | "toward";
  outcome: "pending" | "stood" | "fell";
}

/** Fig. 04: shove it sideways for a tenth of a second and see whether it stays up. */
export function PushLab() {
  const t = useLabels();
  const { active } = useRig();
  const [newtons, setNewtons] = useState(150);
  const [log, setLog] = useState<Shove[]>([]);
  const [tilt, setTilt] = useState<number[]>([]);
  const state = useRef({ tilt: [] as number[], since: 0, shown: 0, pendingAt: null as number | null }); // pendingAt: simulated time of the shove

  const settle = (outcome: Shove["outcome"]) => {
    state.current.pendingAt = null;
    setLog((l) => l.map((s, i) => (i === 0 && s.outcome === "pending" ? { ...s, outcome } : s)));
  };

  const onFrame = useCallback((sim: Lite3Sim, dt: number) => {
    const st = state.current;
    if (st.pendingAt !== null) {
      if (sim.fallen) settle("fell");
      else if (sim.time < st.pendingAt) st.pendingAt = null; // it was reset under us
      else if (sim.time - st.pendingAt > VERDICT_AFTER) settle("stood");
    }
    if ((st.since += dt) < 1 / RATE) return;
    st.since = 0;
    st.tilt = [...st.tilt, (sim.tilt * 180) / Math.PI].slice(-SLOTS);
    if (++st.shown % 3 === 0) setTilt(st.tilt);
  }, []);

  const shove = (side: Shove["side"]) => {
    // The camera looks across the robot from its right, so a shove towards its left (+y) goes away from the reader.
    state.current.pendingAt = pushRobot(side === "away" ? newtons : -newtons);
    setLog((l) => [{ newtons, side, outcome: "pending" as const }, ...l.filter((s) => s.outcome !== "pending")].slice(0, 8));
  };

  const live = active === ID;
  const busy = log[0]?.outcome === "pending";
  return (
    <div className="grid gap-4 text-sm">
      <Stage id={ID} knobs={KNOBS} onFrame={onFrame} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-4">
          <Param label={t.force} shown={`${newtons} N`} value={newtons} min={50} max={400} step={25} onChange={setNewtons} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!live || busy} onClick={() => shove("away")} data-testid="lite3-push-away"><ArrowUp />{t.pushAway}</Button>
            <Button variant="outline" disabled={!live || busy} onClick={() => shove("toward")} data-testid="lite3-push-toward"><ArrowDown />{t.pushToward}</Button>
          </div>
          <div>
            <p className="label">{t.tiltTrace}</p>
            <Traces label={t.tiltTrace} slots={SLOTS} range={[0, 45]} series={[{ values: tilt, color: "var(--signal)" }]} />
          </div>
        </div>
        <div>
          <p className="label mb-2">{t.pushLog}</p>
          {log.length === 0 ? (
            <p className="text-muted-foreground">{t.pushEmpty}</p>
          ) : (
            <ol className="grid gap-1 font-mono tabular" data-testid="lite3-push-log">
              {log.map((s, i) => (
                <li key={log.length - i} className="flex justify-between gap-3 border-b border-border/60 py-1">
                  <span>{s.newtons} N · {s.side === "away" ? t.pushAway : t.pushToward}</span>
                  <span className={cn(s.outcome === "fell" && "text-signal-2", s.outcome === "stood" && "text-signal", s.outcome === "pending" && "text-muted-foreground")}>{t.outcomes[s.outcome]}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
