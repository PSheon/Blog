"use client";

import { Pause, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Readout } from "@/components/lab/readout";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { Param } from "./param";
import { BIG, type Driver, type Reply, type Request } from "./protocol";
import { PARAMS, sentence } from "./sim";

const CHECKPOINTS = ["bc-v2", "dart-v2", "dagger-v2", "dagger-cam-v2"] as const;

function paint(canvas: HTMLCanvasElement | null, bytes: Uint8Array, size: number) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const image = context.createImageData(size, size);
  for (let i = 0, o = 0; i < bytes.length; i += 3, o += 4) { image.data[o] = bytes[i]; image.data[o + 1] = bytes[i + 1]; image.data[o + 2] = bytes[i + 2]; image.data[o + 3] = 255; }
  context.putImageData(image, 0, 0);
}

/**
 * The bench, driven by the scripted expert or by a checkpoint. Everything heavy — the world, both pictures, the model's
 * forward pass — runs in a worker; this component paints the frames it is sent and passes the reader's meddling on.
 */
export function ExpertLab() {
  const t = useLabels(), reduced = useReducedMotion(), english = t.play === "Play";
  const big = useRef<HTMLCanvasElement>(null), eye = useRef<HTMLCanvasElement>(null), root = useRef<HTMLDivElement>(null), worker = useRef<Worker | null>(null);
  const [playing, setPlaying] = useState<boolean | null>(null), [slip, setSlip] = useState<number>(PARAMS.slip), [tilt, setTilt] = useState(false), [driver, setDriver] = useState<Driver>("expert"), [checkpoint, setCheckpoint] = useState<string>("");
  const [loading, setLoading] = useState(false), [frame, setFrame] = useState<Extract<Reply, { type: "frame" }> | null>(null), [visible, setVisible] = useState(true);
  const running = playing ?? !reduced, send = (request: Request) => worker.current?.postMessage(request);

  useEffect(() => {
    const w = new Worker(new URL("./bench.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<Reply>) => {
      if (data.type === "loading") setLoading(true);
      else if (data.type === "frame") { setLoading(false); paint(big.current, data.big, BIG); paint(eye.current, data.eye, PARAMS.image); setFrame(data); }
      else setLoading(false);
    };
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    if (root.current) io.observe(root.current);
    return () => { io.disconnect(); w.terminate(); worker.current = null; };
  }, []);
  // The worker only steps while the figure is on screen and the reader has not paused it.
  useEffect(() => { worker.current?.postMessage({ type: "run", on: running && visible } satisfies Request); }, [running, visible]);

  const outcome = frame?.outcome ?? "running";
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <canvas ref={big} width={BIG} height={BIG} role="img" aria-label={t.big} className="aspect-square w-full rounded-sm bg-[#181c2c]" data-testid="vla-bench" />
        <div className="grid content-start gap-2">
          <canvas ref={eye} width={PARAMS.image} height={PARAMS.image} role="img" aria-label={t.eye} className="aspect-square w-full rounded-sm bg-[#181c2c] [image-rendering:pixelated]" data-testid="vla-eye" />
          <p className="label">{t.eyeLabel}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.who}>
        <span className="label mr-1">{t.who}</span>
        <Button size="sm" variant={driver === "expert" ? "secondary" : "ghost"} aria-pressed={driver === "expert"} onClick={() => { setDriver("expert"); setCheckpoint(""); send({ type: "driver", driver: "expert", checkpoint: "" }); }} data-testid="vla-driver-expert">{t.expert}</Button>
        {CHECKPOINTS.map((name) => (
          <Button key={name} size="sm" variant={checkpoint === name ? "secondary" : "ghost"} aria-pressed={checkpoint === name} className="h-auto min-h-7 whitespace-normal py-1 text-left" onClick={() => { setDriver("model"); setCheckpoint(name); send({ type: "driver", driver: "model", checkpoint: name }); }} data-testid={`vla-driver-${name}`}>{t.models[name]}</Button>
        ))}
        {loading && <span className="label" role="status">{t.loading}</span>}
      </div>
      <p className="label">{t.modelNote}</p>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Readout label={t.instruction} value={<span className="font-sans text-base" data-testid="vla-instruction">{frame ? sentence(frame.words, english) : "…"}</span>} tone="plain" />
        <Readout label={driver === "model" ? t.wouldDo : t.state} value={<span className="font-sans text-base">{frame ? t.states[frame.expertState] : "…"}</span>} />
        <Readout label={t.step} value={`${frame?.step ?? 0} / ${PARAMS.maxSteps}`} tone="muted" />
        <Readout label={frame?.event && outcome === "running" ? t.lastEvent : t.outcome} value={<span className="font-sans text-base" role="status" data-testid="vla-outcome">{outcome !== "running" ? t[outcome] : frame?.event ? t.events[frame.event] : t.running}</span>} tone={outcome === "failed" ? "alt" : "signal"} />
        {driver === "model" && <Readout label={t.inference} value={(frame?.inferenceMs ?? 0).toFixed(0)} unit={t.ms} tone="muted" />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setPlaying(!running)} data-testid="vla-play">{running ? <Pause aria-hidden /> : <Play aria-hidden />}{running ? t.pause : t.play}</Button>
        <Button size="sm" variant="ghost" onClick={() => send({ type: "next" })}><SkipForward aria-hidden />{t.next}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.disturb}>
        <span className="label mr-1">{t.disturb}</span>
        <Button size="sm" variant="outline" onClick={() => send({ type: "disturb", what: "shove" })} data-testid="vla-shove">{t.shove}</Button>
        <Button size="sm" variant="outline" onClick={() => send({ type: "disturb", what: "nudge" })}>{t.nudge}</Button>
        <Button size="sm" variant="outline" onClick={() => send({ type: "disturb", what: "turn" })} data-testid="vla-turn">{t.turn}</Button>
        <Button size="sm" variant={tilt ? "secondary" : "outline"} aria-pressed={tilt} onClick={() => { setTilt(!tilt); send({ type: "tilt", on: !tilt }); }}>{tilt ? t.cameraBack : t.camera}</Button>
      </div>
      <Param label={t.slip} shown={`${Math.round(slip * 100)}%`} value={slip} min={0} max={0.1} step={0.01} onChange={(v) => { setSlip(v); send({ type: "slip", slip: v }); }} />
    </div>
  );
}
