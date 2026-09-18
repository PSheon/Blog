"use client";

import { HeatCanvas } from "@/components/lab/heat-canvas";
import { useLab } from "@/content/posts/cnn-from-scratch/components/store";

/** First-layer feature maps of whatever is on the hero canvas: draw above, watch these change. */
function CnnPreview() {
  const { activations } = useLab();
  const act = activations?.find((a) => a.name === "relu1")?.output;
  let max = 0;
  if (act) for (const v of act.data) if (v > max) max = v;
  return (
    <div className="grid grid-cols-4 gap-1" aria-hidden>
      {Array.from({ length: 8 }, (_, ch) => (
        <HeatCanvas
          key={ch}
          data={act ? act.data.subarray(ch * 784, (ch + 1) * 784) : null}
          w={act ? 28 : 1}
          h={act ? 28 : 1}
          max={max || 1}
          label=""
        />
      ))}
    </div>
  );
}

/** Live thumbnails, keyed by post slug. Keep lib/content/previews.ts in sync. */
const postPreviews: Record<string, () => React.JSX.Element> = {
  "cnn-from-scratch": CnnPreview,
};

export function PostPreview({ slug }: { slug: string }) {
  const Preview = postPreviews[slug];
  return Preview ? <Preview /> : null;
}
