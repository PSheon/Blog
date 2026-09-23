"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { mulberry32 } from "@/lib/ml";
import { Car, driveLapsSliced } from "./car";
import { type Edge, diagonal, graphError, optimise } from "./graph";
import { useLabels } from "./labels";

import { type Pose, between, compose } from "./se2";
import { CYAN_HEX, VIOLET_HEX, setPoints, useStage3D, tone } from "./stage3d";
import { useReplay } from "./use-replay";
import { useVisible } from "./use-visible";
import { RING } from "./world";

const START: Pose = { x: 2, y: 2, theta: 0 };

/** One lap, remembered as a chain: a pose every ~1.5 m, and between neighbours what the wheels said the motion was. */
interface Lap { truth: Pose[]; believed: Pose[]; edges: Edge[]; loop: Edge }
async function oneLap(cancelled: () => boolean): Promise<Lap | null> {
  const c = new Car(RING, START, mulberry32(7), 0.008), truth: Pose[] = [START], believed: Pose[] = [{ x: 0, y: 0, theta: 0 }], edges: Edge[] = [];
  let last = c.deadReckoning, travelled = 0;
  const remember = () => {
    const z = between(last, c.deadReckoning);
    edges.push({ from: believed.length - 1, to: believed.length, z, information: diagonal(100, 100, 400), kind: "odometry" });
    believed.push(compose(believed[believed.length - 1], z)); truth.push(c.truth); last = c.deadReckoning; travelled = 0;
  };
  const done = await driveLapsSliced(c, 1, (odometry) => { travelled += Math.abs(odometry.x); if (travelled >= 1.5) remember(); }, cancelled);
  if (!done) return null;
  remember(); // the pose where the lap ends, back at the start line
  // What recognising the start would tell the car: where the last pose really is, seen from the first.
  const loop: Edge = { from: 0, to: believed.length - 1, z: between(truth[0], truth[truth.length - 1]), information: diagonal(2500, 2500, 10000), kind: "loop" };
  return { truth, believed, edges, loop };
}

/** Fig. 04: the pose graph as springs. Add the one spring that says "I am back", and let the chain relax pass by pass. */
export function SpringsLab() {
  const shell = useRef<HTMLDivElement>(null);
  const lap = useReplay(shell, 0, oneLap);
  return (
    <div ref={shell}>
      {lap ? <Springs lap={lap} /> : <div className="aspect-[16/10] w-full animate-pulse rounded-md border border-border bg-muted/40" aria-busy />}
    </div>
  );
}

function Springs({ lap }: { lap: Lap }) {
  const t = useLabels();
  const root = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), visible = useVisible(root);
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

  useStage3D(
    view, visible,
    (stage) => {
      const T = stage.T;
      stage.walls(RING, 0.8, 0.14);
      stage.aim(10, 6.4, 15, 19);
      const node = new T.SphereGeometry(0.16, 14, 10), plain = new T.MeshStandardMaterial({ color: tone(CYAN_HEX) }), ends = new T.MeshStandardMaterial({ color: tone(VIOLET_HEX) });
      const nodes = lap.believed.map((_, i) => { const m = new T.Mesh(node, i === 0 || i === lap.believed.length - 1 ? ends : plain); stage.scene.add(m); return m; });
      return { nodes, chain: stage.line(stage.ink, 0.6), loop: stage.line(tone(VIOLET_HEX)) };
    },
    (stage, o) => {
      const at = poses.map((q) => compose(START, q));
      at.forEach((q, i) => { o.nodes[i].position.set(q.x, q.y, 0.25); o.nodes[i].scale.setScalar(i === 0 || i === at.length - 1 ? 1.5 : 1); });
      setPoints(stage.T, o.chain, at.flatMap((q) => [q.x, q.y, 0.25]));
      const a = at[0], b = at[at.length - 1];
      // The closing spring, drawn as an arch so it stays visible once it has pulled the two ends together.
      setPoints(stage.T, o.loop, closed ? Array.from({ length: 13 }, (_, k) => { const u = k / 12; return [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 0.25 + Math.sin(u * Math.PI) * 1.2]; }).flat() : []);
    },
  );

  return (
    <div ref={root} className="grid gap-4 text-sm">
      <canvas role="img" aria-label={t.picSprings} ref={view} className="aspect-[16/10] w-full rounded-md border border-border text-foreground" />
      <p className="text-muted-foreground">{t.springsHint}</p>
      <div className="grid items-end gap-4 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <div className="flex gap-2">
          <Button size="sm" disabled={closed} onClick={close}>{t.addLoop}</Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw />{t.reset}</Button>
        </div>
        <Readout label={t.pass} value={pass} tone="plain" />
        <Readout label={t.tension} value={tension < 10 ? tension.toFixed(2) : tension.toFixed(0)} tone="alt" />
        <Readout label={t.worst} value={worst.toFixed(2)} unit={t.metres} large />
      </div>
    </div>
  );
}
