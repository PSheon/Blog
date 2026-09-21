"use client";

import { useMemo, useState } from "react";
import { conv2d, tensor } from "@/lib/ml";
import { cn } from "@/lib/utils";
import { HeatCanvas } from "@/components/lab/heat-canvas";
import { useLabels } from "./labels";
import { useLab } from "./store";

const PRESETS = {
  sobelX: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  sobelY: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
  laplacian: [0, -1, 0, -1, 4, -1, 0, -1, 0],
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  blur: [1, 1, 1, 1, 1, 1, 1, 1, 1].map((v) => +(v / 9).toFixed(2)),
  identity: [0, 0, 0, 0, 1, 0, 0, 0, 0],
} as const;

type Preset = keyof typeof PRESETS;

export function KernelPlayground() {
  const t = useLabels();
  const { input } = useLab();
  const [kernel, setKernel] = useState<number[]>([...PRESETS.sobelX]);
  const active = (Object.keys(PRESETS) as Preset[]).find((k) => PRESETS[k].every((v, i) => v === kernel[i]));

  const output = useMemo(
    () => conv2d(tensor(input, [1, 1, 28, 28]), tensor(kernel, [1, 1, 3, 3]), null, { padding: 1 }).data,
    [input, kernel],
  );

  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div>
        <HeatCanvas data={input} w={28} h={28} max={1} label={t.input} />
        <p className="label mt-1.5">{t.input}</p>
      </div>

      <div className="mx-auto grid w-40 gap-3">
        <fieldset>
          <legend className="label mb-1.5">{t.kernel} 3×3</legend>
          <div className="grid grid-cols-3 gap-1">
            {kernel.map((v, i) => (
              <input
                key={i}
                type="number"
                step={0.5}
                value={v}
                aria-label={`${t.kernel} [${Math.floor(i / 3)},${i % 3}]`}
                onChange={(e) => setKernel(kernel.map((k, j) => (j === i ? Number(e.target.value) || 0 : k)))}
                className={cn(
                  "h-11 w-full rounded-sm border border-input bg-background text-center font-mono text-base tabular md:text-sm [appearance:textfield]", // 16 px on a phone: below that iOS zooms the page when the field is focused
                  "[&::-webkit-inner-spin-button]:appearance-none",
                  v > 0 && "text-signal",
                  v < 0 && "text-signal-2",
                )}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(PRESETS) as Preset[]).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={active === name}
              onClick={() => setKernel([...PRESETS[name]])}
              className={cn(
                "rounded-sm border px-1.5 py-1 text-xs transition-colors",
                active === name ? "border-signal text-signal" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.presetNames[name]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <HeatCanvas data={output} w={28} h={28} mode="div" label={t.output} />
        <p className="label mt-1.5 flex justify-between">
          <span>{t.output}</span>
          <span>
            <span className="text-signal-2">■</span> {t.negative} <span className="ml-1 text-signal">■</span> {t.positive}
          </span>
        </p>
      </div>
    </div>
  );
}
