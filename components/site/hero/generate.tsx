"use client";

import DiffusionPreview from "@/components/site/diffusion-preview";

/** "Generate": article 007's apple, pushed through its forward process and played backwards. No model runs here. */
export default function HeroGenerate({ t }: { t: { note: string } }) {
  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3">
      {/* The picture is 8:5 and the box is whatever the classifier's panel is: fit by height, centre, never crop. */}
      <div className="grid min-h-0 place-items-center overflow-hidden rounded-sm border border-border bg-background">
        <DiffusionPreview className="block aspect-[8/5] h-full max-h-full w-auto max-w-full" />
      </div>
      <p className="label border-t border-border pt-3 normal-case">{t.note}</p>
    </div>
  );
}
