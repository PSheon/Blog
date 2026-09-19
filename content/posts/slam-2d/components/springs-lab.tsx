"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, autopilot } from "./car";
import { type Edge, diagonal, graphError, optimise } from "./graph";
import { useLabels } from "./labels";
import { CYAN, VIOLET, X, Y, prepare, ringView, walls } from "./paint";
import { type Pose, between, compose } from "./se2";
import { useVisible } from "./use-visible";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 }, ROUTE: [number, number][] = [[18, 2], [18, 12], [2, 12], [2, 2]];

/** One lap, remembered as a chain: a pose every ~1.5 m, and between neighbours what the wheels said the motion was. */
function oneLap() {
  const c = new Car(RING, START, mulberry32(7), 0.008), truth: Pose[] = [START], believed: Pose[] = [{ x: 0, y: 0, theta: 0 }], edges: Edge[] = [];
  let last = c.deadReckoning, travelled = 0;
  for (let target = 0, reached = 0, guard = 0; reached < 4 && guard < 20000; guard++) {
    const a = autopilot(c.truth, ROUTE, target);
    if (a.target !== target) reached++;
    target = a.target;
    travelled += Math.abs(c.step(a.controls, 1 / 30).x);
    if (travelled < 1.5 && reached < 4) continue;
    travelled = 0;
    const z = between(last, c.deadReckoning);
    edges.push({ from: believed.length - 1, to: believed.length, z, information: diagonal(100, 100, 400), kind: "odometry" });
    believed.push(compose(believed[believed.length - 1], z)); truth.push(c.truth); last = c.deadReckoning;
  }
  // What recognising the start would tell the car: where the last pose really is, seen from the first.
  const loop: Edge = { from: 0, to: believed.length - 1, z: between(truth[0], truth[truth.length - 1]), information: diagonal(2500, 2500, 10000), kind: "loop" };
  return { truth, believed, edges, loop };
}

/** Fig. 04: the pose graph as springs. Add the one spring that says "I am back", and let the chain relax pass by pass. */
export function SpringsLab() {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
  const lap = useMemo(() => oneLap(), []);
  const [poses, setPoses] = useState<Pose[]>(() => lap.believed.map((p) => ({ ...p })));
  const [closed, setClosed] = useState(false);
  const [pass, setPass] = useState(0);
  const timer = useRef<number | null>(null);

  const stop = () => { if (timer.current !== null) { clearInterval(timer.current); timer.current = null; } };
  const reset = () => { stop(); setPoses(lap.believed.map((p) => ({ ...p }))); setClosed(false); setPass(0); };
  const close = () => {
    stop(); setClosed(true);
    const edges = [...lap.edges, lap.loop];
    let k = 0;
    timer.current = window.setInterval(() => {
      // One Gauss–Newton pass per tick, on a copy, so that every intermediate shape of the chain gets drawn.
      setPoses((prev) => { const next = prev.map((p) => ({ ...p })); optimise(next, edges, 1); return next; });
      setPass(++k);
      if (k >= 8) stop();
    }, 450);
  };
  useEffect(() => stop, []);

  const edges = closed ? [...lap.edges, lap.loop] : lap.edges;
  const tension = graphError(poses, edges);
  const worst = Math.max(...poses.map((p, i) => { const q = compose(START, p); return Math.hypot(q.x - lap.truth[i].x, q.y - lap.truth[i].y); }));

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!visible.current) return;
      const p = prepare(view.current);
      if (!p) return;
      const { ctx, ink } = p, v = ringView(p.w, p.h), at = poses.map((q) => compose(START, q));
      walls(ctx, v, RING, ink, 0.18);
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.beginPath();
      at.forEach((q, i) => (i ? ctx.lineTo(X(v, q.x), Y(v, q.y)) : ctx.moveTo(X(v, q.x), Y(v, q.y))));
      ctx.stroke(); ctx.globalAlpha = 1;
      if (closed) { const a = at[0], b = at[at.length - 1]; ctx.strokeStyle = VIOLET; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(v, a.x), Y(v, a.y)); ctx.lineTo(X(v, b.x), Y(v, b.y)); ctx.stroke(); }
      at.forEach((q, i) => { ctx.fillStyle = i === 0 || i === at.length - 1 ? VIOLET : CYAN; ctx.beginPath(); ctx.arc(X(v, q.x), Y(v, q.y), i === 0 || i === at.length - 1 ? 5 : 3.5, 0, 7); ctx.fill(); });
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [closed, poses, visible]);

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <canvas ref={view} className="aspect-[3/2] w-full rounded-md border border-border text-foreground" />
      <p className="text-muted-foreground">{t.springsHint}</p>
      <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <div className="flex gap-2">
          <Button size="sm" disabled={closed} onClick={close}>{t.addLoop}</Button>
          <Button size="sm" variant="ghost" onClick={reset}>{t.reset}</Button>
        </div>
        <Readout label={t.pass} value={pass} tone="plain" />
        <Readout label={t.tension} value={tension < 10 ? tension.toFixed(2) : tension.toFixed(0)} tone="alt" />
        <Readout label={t.worst} value={worst.toFixed(2)} unit={t.metres} large />
      </div>
    </div>
  );
}
