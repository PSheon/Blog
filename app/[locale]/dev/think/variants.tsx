"use client";

import { useEffect, useRef, useState } from "react";
import Think, { type ThinkLayout } from "@/components/site/hero/think";

/** The classifier's height on a 390 phone, which is what the other three stations use. */
const SHARED = 304;

interface Variant {
  key: string;
  title: string;
  note: string;
  layout: ThinkLayout;
  /** null = as tall as its own content; a number = the box the classifier sets. */
  box: number | null;
}

const VARIANTS: Variant[] = [
  { key: "A", title: "A — 並排，和其他站等高", note: "今天之前的樣子。圖 140 px，底下留白。", layout: "half", box: SHARED },
  { key: "B", title: "B — 並排，自己的高度", note: "現在 tree 裡的。沒有留白，但比其他三站矮一截。", layout: "half", box: null },
  { key: "C", title: "C — 堆疊，自己的高度", note: "圖最大，但站比其他三站高。", layout: "stacked", box: null },
  { key: "D", title: "D — 並排 6:4，和其他站等高", note: "圖加寬，高度仍和其他站一樣。", layout: "sixFour", box: SHARED },
];

const T = { steps: "訓練步數", input: "題目", output: "模型寫的", attention: "每個答案在看哪個數字", again: "再學一次" };

/** One phone-width panel, drawn with the hero's own chrome so the comparison is honest. */
function Panel({ variant }: { variant: Variant }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ box: 0, map: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const map = element.querySelector("canvas");
      setSize({ box: Math.round(element.offsetHeight), map: Math.round(map?.getBoundingClientRect().width ?? 0) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const timer = setInterval(measure, 500);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, []);

  return (
    <figure className="m-0 w-[390px] shrink-0">
      <figcaption className="mb-2">
        <p className="font-heading text-base font-semibold">{variant.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{variant.note}</p>
        <p className="mt-1 font-mono text-xs text-signal">盒子 {size.box} px · 注意力圖 {size.map} px</p>
      </figcaption>
      {/* 390 px of phone, minus the page's own 2×20 px gutter: the instrument is 350 wide, 316 inside its padding. */}
      <div className="w-[350px] overflow-hidden rounded-md border border-border bg-panel">
        <div className="flex items-center gap-3 border-b border-border px-1.5 py-1">
          <span className="ml-2 size-1.5 shrink-0 rounded-full bg-signal-3" aria-hidden />
          <span className="label min-w-0 flex-1 truncate py-1.5 text-foreground">live · transformer</span>
        </div>
        <div className="dot-grid p-4">
          <div ref={ref} style={variant.box ? { height: variant.box } : undefined}>
            <Think t={T} layout={variant.layout} />
          </div>
        </div>
      </div>
    </figure>
  );
}

export function ThinkVariants() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <h1 className="font-heading text-3xl font-semibold">hero / think：四個候選</h1>
      <p className="mt-2 max-w-[60ch] font-serif text-lg text-muted-foreground">
        都是 390 px 手機寬度下的實際渲染，數字是即時量的。其他三站（看見、生成、行動）在這個寬度是 {SHARED} px 高。
      </p>
      <div className="mt-8 flex flex-wrap gap-10">
        {VARIANTS.map((variant) => (
          <Panel key={variant.key} variant={variant} />
        ))}
      </div>
    </div>
  );
}
