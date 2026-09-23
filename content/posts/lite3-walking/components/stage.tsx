"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { loadRig, mountPanel, resetRobot, setPanelFrame, setPanelKnobs, setPaused, useRig } from "./rig";
import type { Knobs, Lite3Sim } from "./sim";

interface Props {
  /** Unique within the article. */
  id: string;
  /** This instrument's settings; everything it leaves out goes back to the default when the robot arrives. */
  knobs: Partial<Knobs>;
  /** Runs after every frame while the robot is in this instrument. */
  onFrame?(sim: Lite3Sim, dt: number): void;
  /** Shown over the bottom-left corner of the 3D view. */
  note?: ReactNode;
}

/** Where the shared robot appears inside an instrument; before loading, the button that fetches it. */
export function Stage({ id, knobs, onFrame, note }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { status, active, paused } = useRig();
  const t = useLabels();
  const here = status === "ready" && active === id;

  const initial = useRef(knobs);
  useEffect(() => mountPanel(id, host.current!, initial.current), [id]);
  useEffect(() => setPanelKnobs(id, knobs), [id, knobs]);
  useEffect(() => {
    setPanelFrame(id, onFrame);
    return () => setPanelFrame(id, undefined);
  }, [id, onFrame]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-background sm:aspect-[2/1]" data-stage={id} data-here={here}>
      {/* The shared canvas is appended here by the rig; React never renders into this node. */}
      <div ref={host} className="absolute inset-0 text-foreground" />
      {!here && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          {status === "ready" ? (
            <p className="max-w-sm">{t.elsewhere}</p>
          ) : (
            <div className="grid max-w-sm justify-items-center gap-3">
              <Button size="sm" onClick={() => void loadRig()} disabled={status === "loading"}>
                {status === "loading" ? t.loading : status === "error" ? t.retry : t.load}
              </Button>
              <p role={status === "error" ? "alert" : undefined}>{status === "error" ? t.error : t.loadNote}</p>
            </div>
          )}
        </div>
      )}
      {here && (
        <>
          {note && <div className="label absolute bottom-2 left-3">{note}</div>}
          <div className="absolute right-2 bottom-2 flex gap-1.5">
            <Button size="icon-sm" variant="outline" aria-label={paused ? t.play : t.pause} onClick={() => setPaused(!paused)}>
              {paused ? <Play /> : <Pause />}
            </Button>
            <Button size="icon-sm" variant="outline" aria-label={t.reset} onClick={resetRobot}>
              <RotateCcw />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
