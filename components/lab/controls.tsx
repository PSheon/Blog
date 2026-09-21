"use client";

import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleLabels } from "./use-locale-labels";

interface Props {
  playing: boolean;
  onPlay(): void;
  onPause(): void;
  onStep(): void;
  onReset(): void;
  labels?: { play: string; pause: string; step: string; reset: string };
  disabled?: boolean;
}

const en = { play: "Play", pause: "Pause", step: "Step", reset: "Reset" }, zh = { play: "播放", pause: "暫停", step: "單步", reset: "重設" };

export function Controls({ playing, onPlay, onPause, onStep, onReset, labels: given, disabled }: Props) {
  const own = useLocaleLabels(zh, en), labels = given ?? own; // an article may word them itself; otherwise the page's language
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
