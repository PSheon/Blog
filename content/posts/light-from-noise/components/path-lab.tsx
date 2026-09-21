"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { Button } from "@/components/ui/button";
import { Tracer, buildBvh, cornell, cross, streamFor, sub, unit, type PathVertex, type Vec3 } from "@/lib/rt";
import { useLabels } from "./labels";
import { FALLBACK, Stage } from "./stage";
import { useTracer } from "./use-tracer";

const SIZE = 512, KEEP = 24, START = { x: 196, y: 430 }; // the floor, left of centre: red from the wall reaches it

interface Shot { points: [number, number][]; colours: string[]; vertices: PathVertex[]; rgb: Vec3; lit: boolean; escaped: boolean }

/** The picture's own tone curve (the present shader's), so a swatch beside the canvas is the colour the canvas would show. */
const tone = (c: Vec3) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, Math.max(0, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14))) ** (1 / 2.2))).join(" ")})`;
const plain = (c: Vec3) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, v) ** (1 / 2.2))).join(" ")})`;

function Swatch({ colour, label }: { colour: string; label?: string }) {
  return <span role="img" aria-label={label ?? colour} className="inline-block size-4 shrink-0 rounded-sm border border-border align-middle" style={{ background: colour }} />;
}

/**
 * Figure 2: one pixel, one path at a time. The picture is the GPU's; the paths drawn over it are traced here, on the
 * CPU, by the same algorithm (lib/rt/cpu.ts), because a GPU cannot show a reader one ray. Each path ends as one colour,
 * usually black; their running average is set beside what the GPU has for the same pixel.
 */
export function PathLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [pixel, setPixel] = useState(START), [shots, setShots] = useState<Shot[]>([]), [total, setTotal] = useState({ n: 0, lit: 0, sum: [0, 0, 0] as Vec3 }), [gpu, setGpu] = useState<Vec3 | null>(null);
  const cpu = useRef<{ tracer: Tracer; project(p: Vec3): [number, number, number] } | null>(null), asked = useRef(pixel);
  const tracer = useTracer(root, canvas, {
    triangles: 1_000, size: SIZE, maxSamples: 1024, autostart: true, configure: (r) => { r.bounces = 16; },
    afterFrame: async (r) => { if (r.samples === 1024 || r.samples % 32 === 0) setGpu(await r.readPixel(asked.current.x, asked.current.y)); },
  });

  /** The CPU's copy of the scene: 876 triangles, a few milliseconds, built the first time a path is asked for. */
  const engine = useCallback(() => {
    if (cpu.current) return cpu.current;
    const scene = cornell(1_000), { eye, target, fov } = scene.camera, f = unit(sub(target, eye)), right = unit(cross(f, [0, 1, 0])), up = cross(right, f), half = Math.tan((fov * Math.PI) / 360);
    const project = (p: Vec3): [number, number, number] => { const v = sub(p, eye), z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; return [(((v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / z / half + 1) / 2) * SIZE, ((1 - (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / z / half) / 2) * SIZE, z]; };
    return (cpu.current = { tracer: new Tracer(scene, buildBvh(scene)), project });
  }, []);

  const shoot = useCallback((count: number, at = asked.current, from = total) => {
    const { tracer: tr, project } = engine(), made: Shot[] = [], sum: Vec3 = [...from.sum];
    let lit = from.lit;
    for (let k = 0; k < count; k++) {
      const rng = streamFor(at.y * SIZE + at.x, from.n + k), ray = tr.cameraRay(at.x, at.y, SIZE, SIZE, rng(), rng()), out = tr.radiance(ray.o, ray.d, rng, 16);
      for (let c = 0; c < 3; c++) sum[c] += out.rgb[c];
      const hitLight = out.rgb.some((v) => v > 0);
      if (hitLight) lit++;
      if (k < count - KEEP) continue; // only the last few are drawn
      const points = out.path.map((v) => project(v.at)).map(([x, y]) => [x, y] as [number, number]);
      // The box is open towards the camera: a ray that leaves is drawn a short way, as far as it stays in front of the eye.
      if (out.escaped) { const e = out.escaped, end = project([e.from[0] + e.direction[0] * 0.7, e.from[1] + e.direction[1] * 0.7, e.from[2] + e.direction[2] * 0.7]); if (end[2] > 0.2) points.push([end[0], end[1]]); }
      made.push({ points, colours: out.path.map((v) => plain(v.throughput)), vertices: out.path, rgb: out.rgb, lit: hitLight, escaped: !!out.escaped });
    }
    setShots((old) => [...old, ...made].slice(-KEEP));
    setTotal({ n: from.n + count, lit, sum });
  }, [engine, total]);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect(), at = { x: Math.min(SIZE - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * SIZE))), y: Math.min(SIZE - 1, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * SIZE))) };
    asked.current = at; setPixel(at); setShots([]); setGpu(null);
    shoot(1, at, { n: 0, lit: 0, sum: [0, 0, 0] });
    void tracer.renderer.current?.readPixel(at.x, at.y).then((c) => { if (asked.current === at) setGpu(c); });
  };

  // The paths are the CPU's: they work over the fallback picture too.
  const ready = tracer.live || tracer.unavailable;
  // The first path, so the figure never opens empty.
  const opened = useRef(false);
  useEffect(() => { if (ready && !opened.current) { opened.current = true; shoot(1); } }, [ready, shoot]);

  const last = shots.at(-1), mean: Vec3 | null = total.n ? [total.sum[0] / total.n, total.sum[1] / total.n, total.sum[2] / total.n] : null;
  return (
    <div ref={root} className="grid gap-5 text-sm">
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <Stage canvas={canvas} status={tracer.status} label={t.pathPicture} t={t} testid="light-path-canvas" fallback={FALLBACK}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full cursor-crosshair touch-manipulation" onPointerDown={pick} data-testid="light-path-overlay" aria-hidden>
            {shots.slice(0, -1).map((s, i) => <polyline key={i} points={s.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="white" strokeOpacity={0.3} strokeWidth={1.2} />)}
            {last && last.points.slice(1).map((p, i) => (
              <g key={i}>
                <line x1={last.points[i][0]} y1={last.points[i][1]} x2={p[0]} y2={p[1]} stroke="black" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" />
                <line x1={last.points[i][0]} y1={last.points[i][1]} x2={p[0]} y2={p[1]} stroke={last.colours[Math.min(i + 1, last.colours.length - 1)]} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={last.escaped && i === last.points.length - 2 ? "2 7" : undefined} />
              </g>
            ))}
            {last?.vertices.map((v, i) => <circle key={i} cx={last.points[i][0]} cy={last.points[i][1]} r={v.emitted ? 9 : 5} fill={v.emitted ? "#fff6c8" : plain(v.albedo)} stroke="white" strokeWidth={1.5} />)}
            <circle cx={pixel.x + 0.5} cy={pixel.y + 0.5} r={16} fill="none" stroke="white" strokeWidth={2} strokeDasharray="4 4" />
          </svg>
        </Stage>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Readout label={t.pathsShot} value={<span data-testid="light-paths">{total.n.toLocaleString()}</span>} large />
            <Readout label={t.pathsLit} value={total.n ? ((total.lit / total.n) * 100).toFixed(0) : "–"} unit="%" tone="alt" large />
          </div>
          <div className="grid gap-2">
            <div className="label">{t.thisPath}</div>
            <ol className="grid gap-1 font-mono text-xs" data-testid="light-path-steps">
              {last?.vertices.map((v, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-4 text-muted-foreground">{i + 1}</span>
                  <Swatch colour={v.emitted ? "#fff6c8" : plain(v.albedo)} label={t.surface} />
                  <span className="min-w-0 flex-1">{v.emitted ? t.hitLight : t.hitSurface}</span>
                  <span className="text-muted-foreground">{t.worth}</span>
                  <Swatch colour={plain(v.throughput)} />
                </li>
              ))}
              {last && !last.lit && <li className="text-muted-foreground">{last.escaped ? t.endedOutside : t.endedTired}</li>}
            </ol>
          </div>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t border-border pt-3">
            <dt><Swatch colour={last ? tone(last.rgb) : "transparent"} /></dt><dd>{t.colourOne}</dd>
            <dt><Swatch colour={mean ? tone(mean) : "transparent"} /></dt><dd>{t.colourMean.replace("{n}", total.n.toLocaleString())}</dd>
            <dt><Swatch colour={gpu ? tone(gpu) : "transparent"} /></dt><dd>{tracer.unavailable ? t.gpuMissing : t.colourGpu}</dd>
          </dl>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button size="sm" disabled={!ready} onClick={() => shoot(1)} data-testid="light-shoot">{t.shootOne}</Button>
        <Button size="sm" variant="outline" disabled={!ready} onClick={() => shoot(100)} data-testid="light-shoot-100">{t.shootMany}</Button>
        <Button size="sm" variant="ghost" disabled={!ready} onClick={() => { setShots([]); setTotal({ n: 0, lit: 0, sum: [0, 0, 0] }); }}>{t.restart}</Button>
        <p className="basis-full text-muted-foreground">{t.pathHint}</p>
      </div>
    </div>
  );
}
