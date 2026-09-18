"use client";

import { type KeyboardEvent, type PointerEvent, useCallback, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useLabels } from "./labels";
import { useRig } from "./rig";
import type { Knobs, Lite3Sim } from "./sim";
import { Stage } from "./stage";
import { Traces } from "./traces";

const ID = "remote";
/** Stick travel, each measured to be tracked without falling: forward / back (m/s), turn (rad/s), sidestep (m/s). */
const FORWARD = 2, BACK = 1, TURN = 1.5, SIDE = 0.8;
const WINDOW = 8, RATE = 10, SLOTS = WINDOW * RATE;
/** Two decimals, without the "-0.00" a tiny negative number would give. */
const fmt = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
const KEYS: Record<string, [number, number]> = { ArrowUp: [0, 1], w: [0, 1], ArrowDown: [0, -1], s: [0, -1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };

/** Fig. 01: drive it. The reader's command and what the robot actually does, side by side. */
export function RemoteLab() {
  const t = useLabels();
  const { active } = useRig();
  // Until the stick is touched it walks at the pace the article's numbers were measured at.
  const [stick, setStick] = useState<[number, number]>([0, 0.25]);
  const [strafe, setStrafe] = useState(false);
  const [seen, setSeen] = useState({ asked: [] as number[], got: [] as number[], forward: 0, turn: 0, side: 0 });
  const trace = useRef({ asked: [] as number[], got: [] as number[], smooth: [0, 0, 0], since: 0 });
  const held = useRef(new Set<string>());

  const command = useMemo<[number, number, number]>(() => {
    const [x, y] = stick;
    // Robot frame: +y is its left, and a positive turn is anticlockwise, so pushing the stick right is negative.
    return [y * (y > 0 ? FORWARD : BACK), strafe ? -x * SIDE : 0, strafe ? 0 : -x * TURN];
  }, [stick, strafe]);
  const knobs = useMemo<Partial<Knobs>>(() => ({ command }), [command]);

  const onFrame = useCallback((sim: Lite3Sim, dt: number) => {
    const [vx, vy] = sim.velocity, yaw = sim.yaw, tr = trace.current;
    const now = [vx * Math.cos(yaw) + vy * Math.sin(yaw), -vx * Math.sin(yaw) + vy * Math.cos(yaw), sim.yawRate];
    const k = Math.min(1, dt / 0.35); // average over about one stride; the torso surges with every step
    tr.smooth = tr.smooth.map((v, i) => v + (now[i] - v) * k);
    if ((tr.since += dt) < 1 / RATE) return;
    tr.since = 0;
    tr.asked = [...tr.asked, sim.knobs.command[0]].slice(-SLOTS);
    tr.got = [...tr.got, tr.smooth[0]].slice(-SLOTS);
    setSeen({ asked: tr.asked, got: tr.got, forward: tr.smooth[0], side: tr.smooth[1], turn: tr.smooth[2] });
  }, []);

  const drag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type !== "pointerdown" && !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    setStick([clamp(((e.clientX - box.left) / box.width) * 2 - 1), clamp(1 - ((e.clientY - box.top) / box.height) * 2)]);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!(key in KEYS)) return;
    e.preventDefault();
    if (e.type === "keydown") held.current.add(key); else held.current.delete(key);
    let x = 0, y = 0;
    held.current.forEach((k) => { x += KEYS[k][0]; y += KEYS[k][1]; });
    setStick([Math.sign(x) * 0.6, Math.sign(y) * (y > 0 ? 0.5 : 0.6)]);
  };
  const release = () => { held.current.clear(); setStick([0, 0]); };

  const live = active === ID;
  return (
    <div className="grid gap-4 text-sm">
      <Stage id={ID} knobs={knobs} onFrame={onFrame} />
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="grid justify-items-center gap-2">
          <div
            role="application"
            tabIndex={0}
            aria-label={strafe ? t.stickStrafe : t.stick}
            aria-describedby="lite3-stick-hint"
            className="relative size-36 touch-none rounded-full border border-border bg-background outline-none select-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={drag}
            onPointerMove={drag}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={keys}
            onKeyUp={keys}
            onBlur={release}
            data-testid="lite3-stick"
          >
            <span className="absolute top-1/2 right-3 left-3 h-px bg-border" aria-hidden />
            <span className="absolute top-3 bottom-3 left-1/2 w-px bg-border" aria-hidden />
            <span
              className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow"
              style={{ left: `${50 + stick[0] * 38}%`, top: `${50 - stick[1] * 38}%` }}
              aria-hidden
            />
          </div>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={strafe} onChange={(e) => setStrafe(e.target.checked)} />
            {t.strafe}
          </label>
        </div>
        <div className="grid min-w-0 gap-3">
          <p id="lite3-stick-hint" className="text-muted-foreground">{t.stickHint}</p>
          <div className="grid grid-cols-3 gap-3" data-testid="lite3-forward">
            <Readout label={t.forward} value={`${fmt(command[0])} → ${live ? fmt(seen.forward) : "–"}`} unit={t.mps} />
            <Readout label={t.turn} value={`${fmt(command[2])} → ${live ? fmt(seen.turn) : "–"}`} unit={t.rps} tone="plain" />
            <Readout label={t.sideways} value={`${fmt(command[1])} → ${live ? fmt(seen.side) : "–"}`} unit={t.mps} tone="plain" />
          </div>
          <div>
            <Traces label={t.speedTrace} slots={SLOTS} range={[-1.2, 2.4]} series={[{ values: seen.asked, color: "var(--signal-2)", dashed: true }, { values: seen.got, color: "var(--signal)" }]} />
            <p className="label flex gap-4">
              <span><span className="text-signal-2">┄</span> {t.asked}</span>
              <span><span className="text-signal">─</span> {t.got}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
