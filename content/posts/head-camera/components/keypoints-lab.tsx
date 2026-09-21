"use client";

import { Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNear } from "@/components/lab/use-near";
import { Button } from "@/components/ui/button";
import { useLabels } from "./labels";
import { K, NO_SHIFT, Policy, SIZE, type XY, picture, somewhere, view } from "./model";
import { Param } from "./param";

const DOTS = ["#ffff00", "#00ff00", "#ff00ff", "#ffffff", "#000000", "#ff8000", "#00a0ff", "#a0ffa0"];
const deg = Math.PI / 180;

function Eye({ bytes, keys, label, caption }: { bytes: Uint8Array | null; keys: XY[]; label: string; caption: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !bytes) return;
    const image = context.createImageData(SIZE, SIZE);
    for (let i = 0, o = 0; i < bytes.length; i += 3, o += 4) { image.data[o] = bytes[i]; image.data[o + 1] = bytes[i + 1]; image.data[o + 2] = bytes[i + 2]; image.data[o + 3] = 255; }
    context.putImageData(image, 0, 0);
  }, [bytes]);
  return (
    <figure className="grid gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#181c2c]">
        <canvas ref={canvas} width={SIZE} height={SIZE} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" role="img" aria-label={label} />
        <svg viewBox="-1 -1 2 2" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {keys.slice(0, K).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.05} fill={DOTS[i]} stroke="#000" strokeWidth={0.014} />)}
        </svg>
      </div>
      <figcaption className="label">{caption}</figcaption>
    </figure>
  );
}

/** Fig. 04: one picture, two networks. Where each puts its eight keypoints, as the scene and the camera change. */
export function KeypointsLab() {
  const t = useLabels(), root = useRef<HTMLDivElement>(null), near = useNear(root);
  const [models, setModels] = useState<{ fixed: Policy; shaken: Policy } | null>(null), [failed, setFailed] = useState(false);
  const [scene, setScene] = useState<{ tip: XY; block: XY }>({ tip: [0.34, -0.1], block: [0.44, 0.08] }), [pitch, setPitch] = useState(0);

  useEffect(() => {
    if (!near || models) return;
    Promise.all(["fixed", "closed"].map((k) => fetch(`/posts/head-camera/${k}.json`).then((r) => { if (!r.ok) throw new Error(k); return r.json(); })))
      .then(([fixed, shaken]) => setModels({ fixed: new Policy(fixed), shaken: new Policy(shaken) }))
      .catch(() => setFailed(true));
  }, [near, models]);

  const bytes = view(scene.tip, scene.block, { ...NO_SHIFT, pitch: pitch * deg }), image = picture(bytes);
  return (
    <div ref={root} className="grid gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Eye bytes={bytes} keys={models?.fixed.run(image).keypoints ?? []} label={t.eye} caption={t.kpFixed} />
        <Eye bytes={bytes} keys={models?.shaken.run(image).keypoints ?? []} label={t.eye} caption={t.kpShaken} />
      </div>
      {failed && <p role="alert" className="text-signal-2">{t.failed}</p>}
      <div className="grid items-end gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Button size="sm" variant="outline" onClick={() => setScene({ tip: somewhere(Math.random), block: somewhere(Math.random) })} data-testid="headcam-shuffle"><Shuffle aria-hidden />{t.kpShuffle}</Button>
        <Param label={t.pitch} shown={`${pitch}°`} value={pitch} min={-10} max={20} step={1} onChange={setPitch} />
      </div>
    </div>
  );
}
