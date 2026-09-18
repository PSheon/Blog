"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Sense } from "./policy";
import { Lite3Sim } from "./sim";

const W = 640, H = 300, SCALE = 320; // px per metre
const LEGS = [2, 6, 10, 14]; // first body of each leg; a leg is hip → thigh → shank → foot
const BLIND: (Sense | null)[] = [null, "gyro", "gravity", "jointPos", "jointVel", "lastAction"];

/** Throwaway first version: does the simulator load, walk and keep up in a real browser? */
export function SpikeLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Lite3Sim | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [stats, setStats] = useState({ simMs: 0, fps: 0, x: 0, speed: 0, fallen: false, load: "" });
  const [speed, setSpeed] = useState(0.5);
  const [blind, setBlind] = useState<Sense | null>(null);

  const load = async () => {
    setStatus("loading");
    try {
      sim.current = await Lite3Sim.load();
      const t = sim.current.timings;
      const bytes = performance.getEntriesByType("resource").filter((r) => /lite3|mujoco/.test(r.name)).reduce((n, r) => n + (r as PerformanceResourceTiming).transferSize, 0);
      setStats((s) => ({ ...s, load: `wasm ${t.wasmMs.toFixed(0)} ms · assets ${t.assetsMs.toFixed(0)} ms · compile ${t.compileMs.toFixed(0)} ms · ${(bytes / 1e6).toFixed(2)} MB transferred` }));
      setStatus("ready");
    } catch (error) {
      console.error("[lite3] failed to load", error);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (status !== "ready" || !sim.current) return;
    const s = sim.current;
    let frame = 0, prev = performance.now(), simMs = 0, frames = 0, since = prev, lastX = 0, lastT = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const steps = Math.min(50, Math.round(now - prev)); // real time, but never spiral after a stall
      prev = now;
      const t0 = performance.now();
      s.advance(steps);
      simMs += performance.now() - t0;
      frames++;
      draw(canvas.current, s);
      if (now - since > 500) {
        const b = s.bodies;
        // Read everything now: the updater below runs later, after the counters have been reset.
        const next = { simMs: simMs / frames, fps: (frames * 1000) / (now - since), x: b[3], speed: (b[3] - lastX) / Math.max(1e-6, s.time - lastT), fallen: s.fallen };
        setStats((old) => ({ ...old, ...next }));
        simMs = 0; frames = 0; since = now; lastX = b[3]; lastT = s.time;
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  useEffect(() => () => sim.current?.dispose(), []);
  useEffect(() => {
    if (sim.current) sim.current.knobs.command = [speed, 0, 0];
  }, [speed]);
  useEffect(() => {
    if (sim.current) sim.current.knobs.blind = blind;
  }, [blind]);

  if (status !== "ready") {
    return (
      <div className="grid place-items-center gap-3 py-10 text-sm text-muted-foreground">
        <Button onClick={() => void load()} disabled={status === "loading"}>
          {status === "loading" ? "Loading…" : "Load the simulator (about 3.5 MB)"}
        </Button>
        {status === "error" && <p role="alert">Failed to load; see the console.</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-3 text-sm">
      <canvas ref={canvas} width={W} height={H} className="w-full rounded-md border border-border" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          speed {speed.toFixed(1)} m/s
          <input type="range" min={-0.5} max={2} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
        <Button size="sm" variant="outline" onClick={() => sim.current?.push(150)}>push 150 N</Button>
        <Button size="sm" variant="outline" onClick={() => sim.current?.push(250)}>push 250 N</Button>
        <Button size="sm" variant="outline" onClick={() => sim.current?.reset()}>reset</Button>
        <label className="flex items-center gap-2">
          blind
          <select className="rounded border border-border bg-background px-1 py-0.5" value={blind ?? ""} onChange={(e) => setBlind((e.target.value || null) as Sense | null)}>
            {BLIND.map((b) => <option key={b ?? "none"} value={b ?? ""}>{b ?? "nothing"}</option>)}
          </select>
        </label>
      </div>
      <p className="tabular text-muted-foreground" data-testid="lite3-stats">
        sim {stats.simMs.toFixed(2)} ms/frame · {stats.fps.toFixed(0)} fps · x {stats.x.toFixed(2)} m · {stats.speed.toFixed(2)} m/s{stats.fallen ? " · fallen" : ""}
      </p>
      <p className="text-muted-foreground" data-testid="lite3-load">{stats.load}</p>
    </div>
  );
}

/** Side view that follows the torso: ground line, distance ticks, torso bar and four legs. */
function draw(canvas: HTMLCanvasElement | null, s: Lite3Sim) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  const b = s.bodies, css = getComputedStyle(document.documentElement);
  const fg = css.getPropertyValue("--foreground") || "#888", muted = css.getPropertyValue("--muted-foreground") || "#888";
  const px = (x: number) => W / 2 + (x - b[3]) * SCALE, py = (z: number) => H - 40 - z * SCALE;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = muted; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.font = "11px ui-monospace, monospace";
  ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(W, py(0)); ctx.stroke();
  for (let m = Math.floor(b[3] - 1); m <= b[3] + 1; m += 0.5) {
    ctx.beginPath(); ctx.moveTo(px(m), py(0)); ctx.lineTo(px(m), py(0) + 6); ctx.stroke();
    ctx.fillText(`${m.toFixed(1)} m`, px(m) + 3, py(0) + 16);
  }
  LEGS.forEach((first, leg) => {
    const near = leg % 2 === 1; // right legs face the camera
    ctx.strokeStyle = near ? "#79dafa" : "#b9a5ff"; ctx.lineWidth = near ? 4 : 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const i = (first + k) * 3;
      if (k === 0) ctx.moveTo(px(b[i]), py(b[i + 2])); else ctx.lineTo(px(b[i]), py(b[i + 2]));
    }
    ctx.stroke();
  });
  ctx.strokeStyle = fg; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(px(b[2 * 3]), py(b[2 * 3 + 2])); ctx.lineTo(px(b[10 * 3]), py(b[10 * 3 + 2])); ctx.stroke();
}
