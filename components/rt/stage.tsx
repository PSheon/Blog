"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TracerStatus } from "./use-tracer";

/** The words a stage and its transport need; every article of the series has them in its labels. */
export interface StageLabels { noWebgpu: string; noAdapter: string; failed: string; building: string; fallbackNote: string; start: string; pause: string; restart: string }

/**
 * The canvas a renderer draws on, with whatever there is to say while there is no picture. `children` lie over it.
 * With `fallback`, a reader without a GPU gets the finished picture and the reason under it, and `children` stay.
 */
export function Stage({ canvas, status, label, t, children, testid = "light-canvas", fallback, wide, fill }: { canvas: RefObject<HTMLCanvasElement | null>; status: TracerStatus; label: string; t: StageLabels; children?: ReactNode; testid?: string; fallback?: string; /** 16:9 instead of square */ wide?: boolean; /** fill the parent, cropping the picture's edges to its shape (a game that covers the window) */ fill?: boolean }) {
  const live = status === "running" || status === "paused", reason = status === "no-webgpu" ? t.noWebgpu : status === "no-adapter" ? t.noAdapter : status === "failed" ? t.failed : t.building;
  if (fallback && !live && status !== "building")
    return (
      <div>
        <div className="relative">
          <canvas ref={canvas} hidden />
          {/* eslint-disable-next-line @next/next/no-img-element -- a 512² picture shown only when the GPU cannot draw it */}
          <img src={fallback} alt={label} width={512} height={512} className={cn("block w-full rounded-md border border-border bg-black", wide ? "aspect-video" : "aspect-square")} data-testid={`${testid}-fallback`} />
          {children}
        </div>
        <p className="mt-2 text-muted-foreground" data-testid="light-status">{t.fallbackNote} {reason}</p>
      </div>
    );
  return (
    <div className={cn("relative", fill && "size-full")}>
      <canvas ref={canvas} role="img" aria-label={label} className={cn("block bg-black", fill ? "size-full object-cover" : "w-full rounded-md border border-border", !fill && (wide ? "aspect-video" : "aspect-square"))} data-testid={testid} />
      {live && children}
      {!live && (
        <p className="absolute inset-0 grid place-items-center rounded-md bg-background/80 p-6 text-center text-muted-foreground" data-testid="light-status">
          {reason}
        </p>
      )}
    </div>
  );
}

export function Transport({ status, live, onToggle, onRestart, t }: { status: TracerStatus; live: boolean; onToggle(): void; onRestart(): void; t: StageLabels }) {
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
