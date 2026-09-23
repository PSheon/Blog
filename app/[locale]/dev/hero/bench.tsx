"use client";

import { useEffect, useRef, useState } from "react";
import { HeroInstrument } from "@/components/site/hero-instrument";
import Act from "@/components/site/hero/act";
import Generate from "@/components/site/hero/generate";
import Think, { type ThinkLayout } from "@/components/site/hero/think";
import { cn } from "@/lib/utils";

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440];
const LAYOUTS: { key: ThinkLayout; label: string }[] = [
  { key: "half", label: "A/B 並排 1:1" },
  { key: "sixFour", label: "D 並排 6:4" },
  { key: "stacked", label: "C 直立堆疊" },
];

type Station = "see" | "think" | "generate" | "act";
const NAMES: Record<Station, string> = { see: "看見", think: "思考", generate: "生成", act: "行動" };

interface Labels {
  think: { steps: string; input: string; output: string; attention: string; again: string };
  generate: { note: string; again: string };
  act: { generation: string; alive: string; best: string; again: string };
  hint: string;
}

/** What the instrument is on the home page: the panel is the column width, less its own padding. */
const panelWidth = (width: number) => (width >= 1024 ? 482 : Math.min(width, 768) - (width >= 640 ? 64 : 40));

function Measured({ station, width, shared, layout, t }: { station: Station; width: number; shared: number | null; layout: ThinkLayout; t: Labels }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ box: 0, ink: 0, canvas: 0, cell: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      let top = Infinity, bottom = -Infinity;
      for (const el of element.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const paints = el.tagName === "CANVAS" || el.tagName === "SVG"
          || [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())
          || style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.borderTopWidth !== "0px";
        if (!paints) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) continue;
        top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
      }
      const canvas = element.querySelector("canvas");
      const canvasBox = canvas?.getBoundingClientRect();
      let cell = canvas?.parentElement ?? null;
      while (cell && cell !== element && cell.getBoundingClientRect().height <= (canvasBox?.height ?? 0) + 1) cell = cell.parentElement;
      setSize({
        box: Math.round(element.offsetHeight),
        ink: Number.isFinite(top) ? Math.round(bottom - top) : 0,
        canvas: Math.round(canvasBox?.height ?? 0),
        cell: Math.round(cell?.getBoundingClientRect().height ?? 0),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const timer = setInterval(measure, 600);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [width, shared, layout]);

  const slack = size.box - size.ink;
  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <p className="font-heading text-base font-semibold">{NAMES[station]}</p>
        <p className="mt-0.5 font-mono text-xs">
          <span className="text-signal">盒子 {size.box}</span>
          <span className="text-muted-foreground"> · 內容 {size.ink} · </span>
          <span className={slack > 24 ? "text-signal-2" : "text-muted-foreground"}>空白 {slack}</span>
          {size.canvas > 0 && (
            <span className={size.cell - size.canvas > 24 ? "text-signal-2" : "text-muted-foreground"}> · 圖 {size.canvas}/{size.cell}</span>
          )}
        </p>
      </figcaption>
      <div className="overflow-hidden rounded-md border border-border bg-panel" style={{ width: panelWidth(width) }}>
        <div className="flex items-center gap-3 border-b border-border px-1.5 py-1">
          <span className="ml-2 size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
          <span className="label min-w-0 flex-1 truncate py-1.5 text-foreground">live · {station}</span>
        </div>
        <div className="dot-grid p-4">
          <div ref={ref} style={shared ? { height: shared } : undefined}>
            {station === "see" && <HeroInstrument hint={t.hint} />}
            {station === "think" && <Think t={t.think} layout={layout} />}
            {station === "generate" && <Generate t={t.generate} />}
            {station === "act" && <Act t={t.act} />}
          </div>
        </div>
      </div>
    </figure>
  );
}

export function HeroBench({ t }: { t: Labels }) {
  const [width, setWidth] = useState(390);
  const [mode, setMode] = useState<"classifier" | "fixed" | "own">("classifier");
  const [layout, setLayout] = useState<ThinkLayout>("half");
  const seeRef = useRef<HTMLDivElement>(null);
  const [seeHeight, setSeeHeight] = useState<number>();

  // The classifier decides the shared height, exactly as it does in the hero.
  useEffect(() => {
    const element = seeRef.current?.querySelector<HTMLElement>("[data-measure=see]");
    if (!element) return;
    const measure = () => setSeeHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  const button = (on: boolean) =>
    cn("tap cursor-pointer rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors",
      on ? "border-signal bg-signal/10 text-signal" : "border-input text-muted-foreground hover:text-foreground");

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <h1 className="font-heading text-3xl font-semibold">hero / 四個站</h1>
      <p className="mt-2 max-w-[65ch] font-serif text-lg text-muted-foreground">
        每個站都在選定的寬度下實際渲染，數字是即時量的。「空白」是盒子高度減掉真正有畫東西的高度；「圖 a/b」是畫布高度
        跟它被分到的格子高度。橘色代表差超過 24 px。
      </p>

      <p className="mt-3 max-w-[65ch] text-sm text-muted-foreground">
        按「各自的高度」會看到「生成」塌成 55 px、「行動」塌成 69 px：這兩站用 <code className="font-mono text-xs">container-type: size</code>{" "}
        把畫布撐到格子的高度，沒有給定高度時那個高度是 0。所以四站等高不是美感選擇，是這兩站的硬需求——能改的只有「思考」。
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-rule py-3">
        <span className="label mr-1">寬度</span>
        {WIDTHS.map((w) => (
          <button key={w} type="button" className={button(w === width)} onClick={() => setWidth(w)}>{w}</button>
        ))}
        <span className="mx-2 h-4 w-px bg-border" aria-hidden />
        <span className="label mr-1">高度</span>
        <button type="button" className={button(mode === "classifier")} onClick={() => setMode("classifier")}>等高（看見決定）</button>
        <button type="button" className={button(mode === "fixed")} onClick={() => setMode("fixed")}>等高 430</button>
        <button type="button" className={button(mode === "own")} onClick={() => setMode("own")}>各自的高度</button>
        <span className="mx-2 h-4 w-px bg-border" aria-hidden />
        <span className="label mr-1">思考排版</span>
        {LAYOUTS.map((l) => (
          <button key={l.key} type="button" className={button(l.key === layout)} onClick={() => setLayout(l.key)}>{l.label}</button>
        ))}
      </div>

      {/* An off-screen classifier at this width, purely to read the height the other three would be given. */}
      <div ref={seeRef} className="pointer-events-none absolute -left-[9999px] top-0" aria-hidden>
        <div style={{ width: panelWidth(width) }}>
          <div className="p-4">
            <div data-measure="see"><HeroInstrument hint={t.hint} /></div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-start gap-10">
        {(["see", "think", "generate", "act"] as Station[]).map((station) => (
          <Measured
            key={`${station}-${width}-${mode}-${layout}`}
            station={station}
            width={width}
            shared={mode === "fixed" ? 430 : mode === "classifier" ? (seeHeight ?? null) : null}
            layout={layout}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
