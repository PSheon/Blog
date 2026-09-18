"use client";

import { DigitCanvas } from "./digit-canvas";
import { HeatCanvas } from "@/components/lab/heat-canvas";
import { useLabels } from "./labels";
import { ModelGate } from "./model-gate";
import { SamplePicker } from "./sample-picker";
import { setStrokes, useLab } from "./store";

const ROWS = [
  { name: "relu1", title: "conv1 → relu", note: "8 × 28×28", cols: "grid-cols-4 sm:grid-cols-8" },
  { name: "pool1", title: "maxpool", note: "8 × 14×14", cols: "grid-cols-4 sm:grid-cols-8" },
  { name: "relu2", title: "conv2 → relu", note: "16 × 14×14", cols: "grid-cols-8" },
  { name: "pool2", title: "maxpool", note: "16 × 7×7", cols: "grid-cols-8" },
];

export function FeatureMaps() {
  const lab = useLab();
  const t = useLabels();

  return (
    <ModelGate>
      <div className="grid gap-6 md:grid-cols-[11rem_1fr]">
        <div className="grid content-start gap-3">
          <DigitCanvas strokes={lab.strokes} onChange={setStrokes} ariaLabel={t.drawAria} hint={t.draw} />
          <SamplePicker t={t} digits={[0, 3, 7, 8]} />
        </div>
        <div className="grid gap-4">
          {ROWS.map((row) => {
            const act = lab.activations?.find((a) => a.name === row.name)?.output;
            const [, c, h, w] = act?.shape ?? [1, row.name.endsWith("1") ? 8 : 16, 1, 1];
            // One scale per layer, so brightness is comparable between channels.
            let max = 0;
            if (act) for (const v of act.data) if (v > max) max = v;
            return (
              <section key={row.name}>
                <p className="label mb-1.5 flex justify-between">
                  <span className="text-foreground">{row.title}</span>
                  <span>{row.note}</span>
                </p>
                <div className={`grid gap-1 ${row.cols}`}>
                  {Array.from({ length: c }, (_, ch) => (
                    <HeatCanvas
                      key={ch}
                      data={act ? act.data.subarray(ch * h * w, (ch + 1) * h * w) : null}
                      w={act ? w : 1}
                      h={act ? h : 1}
                      max={max || 1}
                      label={`${row.name} channel ${ch}`}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </ModelGate>
  );
}
