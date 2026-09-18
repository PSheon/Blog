"use client";

import { Dices } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type SceneSource, createSceneSource } from "./emoji";
import { useLabels } from "./labels";
import { SceneCanvas } from "./scene-canvas";
import type { Scene } from "./scene";

/** One generated image next to the two labels that come with it for free. */
export function LabelsFigure() {
  const t = useLabels();
  const source = useRef<SceneSource | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [kind, setKind] = useState<SceneSource["kind"]>("emoji");

  const next = () => {
    source.current ??= createSceneSource();
    setKind(source.current.kind);
    setScene(source.current.next(Math.random));
  };
  useEffect(() => {
    const id = window.setTimeout(next, 0);
    return () => window.clearTimeout(id);
  }, []);

  const maskOverlay = useMemo(() => (scene ? { values: scene.mask, threshold: 0.5 } : undefined), [scene]);
  const truth = useMemo(() => (scene ? [{ box: scene.box, color: "#ff6e96" }] : []), [scene]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        <figure>
          <SceneCanvas image={scene?.image ?? null} label={t.image} />
          <figcaption className="label mt-1.5">{t.image}</figcaption>
        </figure>
        <figure>
          <SceneCanvas image={null} mask={maskOverlay} label={t.maskLabel} />
          <figcaption className="label mt-1.5">{t.maskLabel}</figcaption>
        </figure>
        <figure>
          <SceneCanvas image={scene?.image ?? null} boxes={truth} label={t.boxLabel} />
          <figcaption className="label mt-1.5">{t.boxLabel}</figcaption>
        </figure>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={next}>
          <Dices />
          {t.reroll}
        </Button>
        {kind === "shapes" && <p className="text-xs leading-relaxed text-signal-2">{t.fallback}</p>}
      </div>
    </div>
  );
}
