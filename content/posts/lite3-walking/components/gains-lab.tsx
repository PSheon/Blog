"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { Param } from "./param";
import { KD, KP, TORQUE_LIMIT } from "./policy";
import { useRig } from "./rig";
import type { Knobs, Lite3Sim } from "./sim";
import { Stage } from "./stage";
import { Traces } from "./traces";

const ID = "gains";
/** Front-left knee: the joint that moves the most. */
const JOINT = 2;
const WINDOW = 2, RATE = 60, SLOTS = WINDOW * RATE;

/** Fig. 03: the policy asks for angles; a spring and a damper turn them into torque. Change the spring. */
export function GainsLab() {
  const t = useLabels();
  const { active } = useRig();
  const [kp, setKp] = useState(KP);
  const [kd, setKd] = useState(KD);
  const [seen, setSeen] = useState({ target: [] as number[], angle: [] as number[], torque: [] as number[], speed: 0, height: 0 });
  const trace = useRef({ target: [] as number[], angle: [] as number[], torque: [] as number[], speed: 0, since: 0, shown: 0 });
  const knobs = useMemo<Partial<Knobs>>(() => ({ kp, kd }), [kp, kd]);

  const onFrame = useCallback((sim: Lite3Sim, dt: number) => {
    const tr = trace.current, [vx, vy] = sim.velocity;
    tr.speed += (Math.hypot(vx, vy) - tr.speed) * Math.min(1, dt / 0.35);
    tr.target = [...tr.target, sim.targets[JOINT]].slice(-SLOTS);
    tr.angle = [...tr.angle, sim.jointAngles[JOINT]].slice(-SLOTS);
    tr.torque = [...tr.torque, sim.torques[JOINT]].slice(-SLOTS);
    if ((tr.since += dt) < 1 / 15) return;
    tr.since = 0;
    setSeen({ target: tr.target, angle: tr.angle, torque: tr.torque, speed: tr.speed, height: sim.position[2] });
  }, []);

  const live = active === ID;
  return (
    <div className="grid gap-4 text-sm">
      <Stage id={ID} knobs={knobs} onFrame={onFrame} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-4">
          <Param label={t.kp} shown={`${kp} N·m/rad`} value={kp} min={5} max={100} step={5} onChange={setKp} />
          <Param label={t.kd} shown={`${kd.toFixed(1)} N·m·s/rad`} value={kd} min={0.2} max={3} step={0.1} onChange={setKd} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t.trainedAt}</span>
            <Button size="sm" variant="outline" disabled={kp === KP && kd === KD} onClick={() => { setKp(KP); setKd(KD); }}>{t.backToTrained}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Readout label={t.speedAt05} value={live ? seen.speed.toFixed(2) : "–"} unit={t.mps} />
            <Readout label={t.height} value={live ? seen.height.toFixed(2) : "–"} unit="m" tone="plain" />
          </div>
        </div>
        <div className="grid content-start gap-3">
          <div>
            <p className="label">{t.kneeAngle}</p>
            <Traces label={t.kneeAngle} slots={SLOTS} range={[0.4, 2.4]} series={[{ values: seen.target, color: "var(--signal-2)", dashed: true }, { values: seen.angle, color: "var(--signal)" }]} />
            <p className="label flex gap-4">
              <span><span className="text-signal-2">┄</span> {t.targetAngle}</span>
              <span><span className="text-signal">─</span> {t.actualAngle}</span>
            </p>
          </div>
          <div>
            <p className="label">{t.kneeTorque(TORQUE_LIMIT)}</p>
            <Traces label={t.kneeTorque(TORQUE_LIMIT)} slots={SLOTS} range={[-TORQUE_LIMIT, TORQUE_LIMIT]} series={[{ values: seen.torque, color: "var(--foreground)" }]} />
          </div>
        </div>
      </div>
    </div>
  );
}
