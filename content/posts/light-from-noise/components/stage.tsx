"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import type { Labels } from "./labels";
import type { TracerStatus } from "./use-tracer";

/** The canvas a renderer draws on, with whatever there is to say while there is no picture. `children` lie over it. */
export function Stage({ canvas, status, label, t, children, testid = "light-canvas" }: { canvas: RefObject<HTMLCanvasElement | null>; status: TracerStatus; label: string; t: Labels; children?: ReactNode; testid?: string }) {
  const live = status === "running" || status === "paused";
  return (
    <div className="relative">
      <canvas ref={canvas} role="img" aria-label={label} className="block aspect-square w-full rounded-md border border-border bg-black" data-testid={testid} />
      {live && children}
      {!live && (
        <p className="absolute inset-0 grid place-items-center rounded-md bg-background/80 p-6 text-center text-muted-foreground" data-testid="light-status">
          {status === "no-webgpu" ? t.noWebgpu : status === "no-adapter" ? t.noAdapter : status === "failed" ? t.failed : t.building}
        </p>
      )}
    </div>
  );
}

export function Transport({ status, live, onToggle, onRestart, t }: { status: TracerStatus; live: boolean; onToggle(): void; onRestart(): void; t: Labels }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={!live} onClick={onToggle} data-testid="light-toggle">
        {status === "running" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        {status === "running" ? t.pause : t.start}
      </Button>
      <Button size="sm" variant="ghost" disabled={!live} onClick={onRestart}><RotateCcw className="size-4" aria-hidden />{t.restart}</Button>
    </div>
  );
}
