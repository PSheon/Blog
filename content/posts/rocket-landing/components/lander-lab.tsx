"use client";

import { Brain, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { runWhenSeen } from "@/components/lab/run-when-seen";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { cn } from "@/lib/utils";
import { useLabels } from "./labels";
import { type Gains, type Progress, asArray, control, learn, measure } from "./pilot";
import { act as netAct, type NetProgress, type Weights } from "./net";
import { createNetWorker } from "./net-worker-factory";
import type { TeachReply, TeachRequest } from "./net.worker";
import { type Stage, makeStage, parseShip } from "./ship3d";
import { type Action, PAD, THROTTLE_FLOOR, type Outcome, type State, outcome, start, step } from "./sim";

type Pilot = "you" | "autopilot" | "learned" | "net";
/** What `params.ts` converged on offline, and what the page flies until the reader trains their own. */
/*
 * What the trainer converged on when the engine count was its to choose (docs/research/rocket/RESULTS.md): 294 of
 * 300 unseen descents at 1.17 m/s, and a flight that goes 0 engines → ONE at 53 % for the flip → two at 50 % to kill
 * 41 m/s at 105 m → back to one at 90 % for the last 40 metres. Nobody wrote that sequence; it falls out of asking
 * for a thrust and lighting the fewest engines that can deliver it.
 */
const AUTOPILOT: Gains = { ignite: 772, swing: 3.99, margin: 0.36, flare: 1, hold: 1.67, lean: 0.43, push: 0.53, flipEngines: 1.1, brakeEngines: 1.72, chase: 3.15 };
const DT = 0.1;

interface Keys { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }

/** The stage, its flame and the deck, drawn in metres and scaled to fit whatever is above the pad. */
function draw(c: CanvasRenderingContext2D, w: number, h: number, s: State, throttle: number, lit: number, ink: { body: string; flame: string; pad: string; grid: string; sky: string }) {
  c.clearRect(0, 0, w, h);
  // Both pictures follow the ship, not the pad: the 3D camera above keeps it in the middle of frame, so this one
  // does too and the deck slides in from the side exactly as it does up there. Anything else has the two views
  // disagreeing about where the ship is relative to the pad at the same instant.
  const top = Math.max(200, s.y * 1.35), scale = (h - 40) / top;
  const groundY = h - 24;
  const px = (x: number) => w / 2 + (x - s.x) * scale, py = (y: number) => groundY - y * scale;

  c.strokeStyle = ink.grid;
  c.lineWidth = 1;
  for (let y = 0; y <= top; y += top > 1200 ? 500 : 100) {
    c.globalAlpha = 0.5;
    c.beginPath(); c.moveTo(0, py(y)); c.lineTo(w, py(y)); c.stroke();
    c.globalAlpha = 1;
  }
  // The deck, 52 m across.
  c.fillStyle = ink.pad;
  c.fillRect(px(-PAD), groundY, PAD * 2 * scale, 6);
  c.fillStyle = ink.grid;
  c.fillRect(0, groundY + 6, w, h - groundY);

  const bodyH = 50.3 * scale, bodyW = Math.max(3, 9 * scale);
  c.save();
  c.translate(px(s.x), py(s.y));
  c.rotate(s.a);
  const burning = throttle > 0 ? Math.max(0, Math.min(3, Math.round(lit))) : 0;
  if (burning > 0) {
    // One flame per engine, at the bells they actually come out of, and the same length rule as the 3D view above:
    // the two pictures have to agree with each other and with the readout that says "2 × 50 %".
    const hard = (throttle - 0.4) / 0.6;
    const len = bodyH * (0.55 + hard * 1.15) * 0.9;
    const at = burning === 1 ? [0] : burning === 2 ? [-0.26, 0.26] : [-0.32, 0, 0.32];
    const g = c.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, ink.flame);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    for (const offset of at) {
      const x = offset * bodyW * 2;
      c.beginPath();
      c.moveTo(x - bodyW * 0.22, 0);
      c.lineTo(x + bodyW * 0.22, 0);
      c.lineTo(x, len);
      c.closePath();
      c.fill();
    }
  }
  c.fillStyle = ink.body;
  c.fillRect(-bodyW / 2, -bodyH, bodyW, bodyH);
  // A nose and four flaps, so the cutaway reads as a ship rather than a pencil.
  c.beginPath();
  c.moveTo(-bodyW / 2, -bodyH);
  c.quadraticCurveTo(0, -bodyH * 1.18, bodyW / 2, -bodyH);
  c.closePath();
  c.fill();
  c.strokeStyle = ink.body;
  c.lineWidth = Math.max(1, bodyW * 0.16);
  c.beginPath();
  c.moveTo(-bodyW / 2, -bodyH * 0.12); c.lineTo(-bodyW * 1.5, -bodyH * 0.02);
  c.moveTo(bodyW / 2, -bodyH * 0.12); c.lineTo(bodyW * 1.5, -bodyH * 0.02);
  c.moveTo(-bodyW / 2, -bodyH * 0.86); c.lineTo(-bodyW * 1.25, -bodyH * 0.94);
  c.moveTo(bodyW / 2, -bodyH * 0.86); c.lineTo(bodyW * 1.25, -bodyH * 0.94);
  c.stroke();
  c.restore();
}

export function LanderLab() {
  const t = useLabels();
  const still = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const view3d = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const [three, setThree] = useState<"loading" | "ready" | "failed">("loading");
  const keys = useRef<Keys>({ fire: false, left: false, right: false, up: false, down: false });
  const state = useRef<State>(start(Math.random));
  const throttleRef = useRef(0);
  /** how many engines are burning right now, whoever decided it */
  const litRef = useRef(0);
  const [pilot, setPilot] = useState<Pilot>("you");
  const [engines, setEngines] = useState(2);
  const enginesRef = useRef(engines);
  const pilotRef = useRef(pilot);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [end, setEnd] = useState<Outcome>("flying");
  // Why it crashed, decided where the episode ends: the render must not read the live state ref.
  const [why, setWhy] = useState<"tooFast" | "offPad" | "tilted">("tooFast");
  const [hud, setHud] = useState({ y: 0, v: 0, fuel: 0, throttle: 0, tilt: 0, lit: 0 });
  const [score, setScore] = useState({ landed: 0, tries: 0 });
  const [gains, setGains] = useState<Gains | null>(null);
  const gainsRef = useRef<Gains | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [training, setTraining] = useState(false);
  // The network: its weights, how its lesson is going, and the worker doing the teaching.
  const netWorker = useRef<Worker | null>(null);
  const [net, setNet] = useState<Weights | null>(null);
  const netRef = useRef<Weights | null>(null);
  const [netProgress, setNetProgress] = useState<NetProgress | null>(null);
  const [teaching, setTeaching] = useState(false);

  useEffect(() => { pilotRef.current = pilot; }, [pilot]);
  useEffect(() => { enginesRef.current = engines; }, [engines]);
  useEffect(() => { gainsRef.current = gains; }, [gains]);
  useEffect(() => { netRef.current = net; }, [net]);
  useEffect(() => () => netWorker.current?.terminate(), []);
  useEffect(() => { runningRef.current = running; }, [running]);

  const reset = useCallback(() => {
    state.current = start(Math.random);
    throttleRef.current = 0;
    setEnd("flying");
    setRunning(true);
  }, []);

  // The ship's geometry: 370 KB, fetched once, then painted in the site's colours.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const packed = parseShip(await (await fetch("/posts/rocket-landing/starship.bin")).arrayBuffer());
        const element = view3d.current;
        if (!alive || !element) return;
        stage.current = await makeStage(element, packed, true, still);
        setThree("ready");
      } catch (error) {
        console.error("[rocket] 3D view failed", error);
        if (alive) setThree("failed");
      }
    })();
    return () => { alive = false; stage.current?.dispose(); stage.current = null; };
  }, [still]);

  // One loop for the whole figure: physics at a fixed 0.1 s, drawn every frame, paused when off screen.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let frame = 0, last = performance.now(), carry = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const c = element.getContext("2d");
      if (!c) return;
      const style = getComputedStyle(element);
      const ink = {
        body: style.getPropertyValue("--foreground") || "#fff",
        flame: style.getPropertyValue("--signal-2") || "#f6a",
        pad: style.getPropertyValue("--signal") || "#7df",
        grid: style.getPropertyValue("--grid") || "#3336",
        sky: style.getPropertyValue("--background") || "#000",
      };
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (runningRef.current && outcome(state.current) === "flying") {
        carry += still ? DT : dt;
        while (carry >= DT) {
          carry -= DT;
          const s = state.current;
          const who = pilotRef.current;
          let action: Action = { throttle: 0, gimbal: 0, flaps: 0 };
          if (who === "you") {
            const gimbal = (keys.current.left ? -1 : 0) + (keys.current.right ? 1 : 0);
            const flaps = (keys.current.down ? -1 : 0) + (keys.current.up ? 1 : 0);
            action = { engines: enginesRef.current, throttle: keys.current.fire ? 1 : 0, gimbal, flaps };
          } else if (who === "net" && netRef.current) {
            action = netAct(netRef.current, s);
          } else {
            action = control(s, who === "learned" && gainsRef.current ? gainsRef.current : AUTOPILOT);
          }
          throttleRef.current = action.throttle > 0 ? Math.max(THROTTLE_FLOOR, Math.min(1, action.throttle)) : 0;
          litRef.current = action.throttle > 0 ? Math.max(0, Math.min(3, Math.round(action.engines ?? enginesRef.current))) : 0;
          state.current = step(s, action, DT, enginesRef.current);
          const over = outcome(state.current);
          if (over !== "flying") {
            const f = state.current;
            setWhy(Math.hypot(f.vx, f.vy) >= 6 ? "tooFast" : Math.abs(f.x) >= PAD ? "offPad" : "tilted");
            setEnd(over);
            setRunning(false);
            setScore((x) => ({ landed: x.landed + (over === "landed" ? 1 : 0), tries: x.tries + 1 }));
            break;
          }
        }
      }
      const s = state.current;
      draw(c, element.width, element.height, s, throttleRef.current, litRef.current, ink);
      const box = view3d.current?.getBoundingClientRect();
      if (stage.current && box && box.width > 0) {
        stage.current.resize(Math.round(box.width), Math.round(box.height));
        stage.current.render(s, throttleRef.current, litRef.current);
      }
      setHud({ y: Math.max(0, s.y), v: Math.hypot(s.vx, s.vy), fuel: s.fuel, throttle: throttleRef.current, tilt: (s.a * 180) / Math.PI, lit: litRef.current });
    };
    const stop = runWhenSeen(element, () => { last = performance.now(); frame = requestAnimationFrame(tick); }, () => cancelAnimationFrame(frame));
    return () => { stop(); cancelAnimationFrame(frame); };
  }, [still]);

  // Keys: `event.code`, because a Chinese input method turns the letters into something else.
  useEffect(() => {
    const set = (code: string, down: boolean) => {
      if (code === "Space" || code === "KeyW") keys.current.fire = down;
      if (code === "ArrowLeft" || code === "KeyA") keys.current.left = down;
      if (code === "ArrowRight" || code === "KeyD") keys.current.right = down;
      if (code === "ArrowUp") keys.current.up = down;
      if (code === "ArrowDown") keys.current.down = down;
    };
    const wanted = (code: string) => ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyD"].includes(code);
    const down = (e: KeyboardEvent) => { if (!wanted(e.code) || pilotRef.current !== "you") return; if (document.activeElement === canvas.current) e.preventDefault(); set(e.code, true); };
    const up = (e: KeyboardEvent) => { if (wanted(e.code)) set(e.code, false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const teachNet = () => {
    netWorker.current?.terminate();
    const w = createNetWorker();
    netWorker.current = w;
    setTeaching(true);
    setNetProgress(null);
    w.onmessage = ({ data }: MessageEvent<TeachReply>) => {
      if (data.type === "progress") {
        setNetProgress(data.progress);
        setNet(data.progress.weights);
        setPilot("net");
      } else {
        setTeaching(false);
        w.terminate();
        netWorker.current = null;
      }
    };
    w.postMessage({ type: "teach", teacher: gainsRef.current ?? AUTOPILOT, seed: Math.floor(Math.random() * 2 ** 31) } satisfies TeachRequest);
  };

  const trainIt = () => {
    setTraining(true);
    setProgress(null);
    const rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
    // 35 rounds of 10 descents: measured over ten seeds, 20 rounds left a third of readers with a pilot that flips
    // on two engines and lands 2 % of the time. This is still about a second. (docs/research/rocket/RESULTS.md)
    const rounds = learn(35, rng, 10);
    // One round per frame: the reader watches the five numbers settle instead of waiting for a spinner.
    const next = () => {
      const { value, done } = rounds.next();
      if (done || !value) {
        setTraining(false);
        return;
      }
      setProgress(value);
      setGains(value.gains);
      setPilot("learned");
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  };

  const status = end === "flying" ? (running ? t.flying : t.ready) : end === "landed" ? t.landed : end === "crashed" ? `${t.crashed}（${t[why]}）` : end === "dry" ? t.dry : t.lost;

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">{t.who}</span>
        {(["you", "autopilot", "learned", "net"] as Pilot[]).map((p) => (
          <button key={p} type="button" aria-pressed={pilot === p} disabled={(p === "learned" && !gains) || (p === "net" && !net)}
            onClick={() => { setPilot(p); reset(); }}
            className={cn("tap rounded-sm border px-2 py-1 text-xs transition-colors disabled:opacity-40",
              pilot === p ? "border-signal bg-signal/10 text-signal" : "border-input text-muted-foreground hover:text-foreground")}>
            {p === "you" ? t.you : p === "autopilot" ? t.autopilot : p === "learned" ? t.learned : t.network}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-border" aria-hidden />
        <span className="label">{t.manualEngines}</span>
        {[2, 3].map((n) => (
          <button key={n} type="button" aria-pressed={engines === n} onClick={() => { setEngines(n); setGains(null); setProgress(null); reset(); }}
            className={cn("tap rounded-sm border px-2 py-1 font-mono text-xs transition-colors",
              engines === n ? "border-signal bg-signal/10 text-signal" : "border-input text-muted-foreground hover:text-foreground")}>
            {n}
          </button>
        ))}
        <span className="ml-auto font-mono text-xs tabular text-muted-foreground" data-testid="lander-score">{t.scoreboard(score.landed, score.tries)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid gap-2">
          <div className="relative overflow-hidden rounded-sm border border-border bg-[#070918]">
            <canvas ref={view3d} className="block aspect-[4/3] w-full" role="img" aria-label={t.view3d} data-testid="lander-3d" />
            {three !== "ready" && <p className="absolute inset-0 grid place-items-center text-center text-xs text-muted-foreground">{three === "failed" ? t.no3d : t.loading3d}</p>}
          </div>
          <canvas ref={canvas} width={520} height={200} tabIndex={0}
            className="dot-grid w-full rounded-sm border border-border bg-background focus-visible:outline-2 focus-visible:outline-ring"
            role="img" aria-label={t.keys} data-testid="lander-canvas" />
          <p className="label">{pilot === "you" ? t.keys : t.hoverNote}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => (running ? setRunning(false) : end === "flying" ? setRunning(true) : reset())} data-testid="lander-go">
              {running ? <Pause aria-hidden /> : <Play aria-hidden />}{running ? t.pause : end === "flying" ? t.launch : t.again}
            </Button>
            <Button size="sm" variant="outline" onClick={reset}><RotateCcw aria-hidden />{t.again}</Button>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Readout label={t.altitude} value={hud.y.toFixed(0)} unit={t.metres} tone="muted" />
            <Readout label={t.speed} value={hud.v.toFixed(0)} unit={t.mps} tone={hud.v > 6 ? "alt" : "signal"} />
            <Readout label={t.fuel} value={(hud.fuel / 1000).toFixed(1)} unit="t" tone="muted" />
            <Readout label={t.throttle} value={`${hud.lit} × ${(hud.throttle * 100).toFixed(0)}`} unit={t.percent} tone="muted" testId="lander-thrust" />
            <Readout label={t.tilt} value={hud.tilt.toFixed(0)} unit="°" tone="muted" />
            <Readout label={t.status} value={<span className="text-base">{status}</span>} tone={end === "landed" ? "signal" : end === "flying" ? "muted" : "alt"} testId="lander-status" />
          </div>

          <div className="grid gap-2 border-t border-rule pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={trainIt} disabled={training} data-testid="lander-train">
                <Sparkles aria-hidden />{training ? t.training : gains ? t.trainAgain : t.train}
              </Button>
              <span className="text-xs text-muted-foreground">{t.trainNote}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={teachNet} disabled={teaching} data-testid="lander-teach">
                <Brain aria-hidden />{teaching ? t.teaching : net ? t.teachAgain : t.teach}
              </Button>
              <span className="text-xs text-muted-foreground">{t.teachNote}</span>
            </div>
            {netProgress && (
              <div className="grid gap-1" data-testid="lander-net">
                <div className="grid grid-cols-3 gap-3">
                  <Readout label={t.phase} value={<span className="text-base">{netProgress.phase === "cloning" ? t.cloning : t.daggerRound(netProgress.round)}</span>} tone="muted" />
                  <Readout label={t.landRate} value={(netProgress.rate * 100).toFixed(0)} unit={t.percent} tone={netProgress.rate > 0 ? "signal" : "alt"} />
                  <Readout label={t.samples} value={(netProgress.samples / 1000).toFixed(0)} unit="k" tone="muted" />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{netProgress.phase === "cloning" ? t.cloningNote : t.daggerNote}</p>
              </div>
            )}
            {progress && (
              <div className="grid gap-2" data-testid="lander-progress">
                <div className="grid grid-cols-3 gap-3">
                  <Readout label={t.iteration} value={progress.iteration} tone="muted" />
                  <Readout label={t.landRate} value={(progress.rate * 100).toFixed(0)} unit={t.percent} />
                  <Readout label={t.touchdown} value={progress.touchdown.toFixed(1)} unit={t.mps} tone="muted" />
                </div>
                <p className="label">{t.gains}</p>
                <ul className="grid gap-1 font-mono text-xs tabular text-muted-foreground">
                  {asArray(progress.gains).map((v, i) => (
                    <li key={t.gainNames[i]} className="flex justify-between gap-3">
                      <span>{t.gainNames[i]}</span>
                      <span className="text-foreground">{v.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kept for the article's prose: what the built-in autopilot scores over 200 descents, per engine count. */
export const AUTOPILOT_SCORE = () => measure(AUTOPILOT, 200);
