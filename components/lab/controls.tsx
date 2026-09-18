"use client";

import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  playing: boolean;
  onPlay(): void;
  onPause(): void;
  onStep(): void;
  onReset(): void;
  labels?: { play: string; pause: string; step: string; reset: string };
  disabled?: boolean;
}

const en = { play: "Play", pause: "Pause", step: "Step", reset: "Reset" };

export function Controls({ playing, onPlay, onPause, onStep, onReset, labels = en, disabled }: Props) {
  return (
    <div className="flex items-center gap-1.5" role="group">
      <Button size="sm" variant="outline" onClick={playing ? onPause : onPlay} disabled={disabled}>
        {playing ? <Pause /> : <Play />}
        {playing ? labels.pause : labels.play}
      </Button>
      <Button size="sm" variant="outline" onClick={onStep} disabled={disabled || playing}>
        <StepForward />
        {labels.step}
      </Button>
      <Button size="sm" variant="ghost" onClick={onReset} disabled={disabled}>
        <RotateCcw />
        {labels.reset}
      </Button>
    </div>
  );
}
