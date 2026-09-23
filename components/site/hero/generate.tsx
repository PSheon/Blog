"use client";

import { useState } from "react";
import DiffusionPreview from "@/components/site/diffusion-preview";
import { StationReset } from "./reset";

/** "Generate": article 007's apple, pushed through its forward process and played backwards. No model runs here. */
export default function HeroGenerate({ t }: { t: { note: string; again: string } }) {
  // Remounting the preview is the restart: it owns its own clock, and nothing else here has state.
  const [run, setRun] = useState(0);
  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3">
      {/* The picture is 8:5 and the box is whatever the classifier's panel is: as large as fits both ways, never stretched. */}
      <div className="grid min-h-0 place-items-center rounded-sm border border-border bg-background [container-type:size]">
        <DiffusionPreview key={run} className="block aspect-[8/5] w-[min(100cqw,100cqh*8/5)]" />
      </div>
      <p className="flex items-center gap-x-3 border-t border-border pt-3">
        <span className="label normal-case">{t.note}</span>
        <StationReset label={t.again} onClick={() => setRun((n) => n + 1)} testId="hero-generate-again" />
      </p>
    </div>
  );
}
