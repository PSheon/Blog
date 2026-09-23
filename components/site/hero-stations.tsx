"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CornerMarks } from "@/components/lab/corner-marks";
import { ErrorBoundary } from "@/components/lab/error-boundary";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { cn } from "@/lib/utils";
import { type StationKey, setStation, useStation } from "./hero/station-store";
import { ChunkLoading } from "./chunk-loading";
import { HeroInstrumentLazy } from "./hero-instrument-lazy";

const loading = () => <ChunkLoading />;
const Think = dynamic(() => import("./hero/think"), { ssr: false, loading });
const Generate = dynamic(() => import("./hero/generate"), { ssr: false, loading });
const Act = dynamic(() => import("./hero/act"), { ssr: false, loading });

export interface Station {
  key: StationKey;
  word: string;
  color: string;
  /** Title-bar name, e.g. "live · mnist-cnn". */
  title: string;
  caption: string;
  more: string;
  href: string;
}

interface Props {
  stations: Station[];
  label: string;
  hint: string;
  t: {
    think: { steps: string; input: string; output: string; attention: string; again: string };
    generate: { note: string };
    act: { generation: string; alive: string; best: string };
  };
}

/**
 * The hero as four stations of the same rail that runs under it: see, think, generate, act, each the live model of
 * one article. The classifier is what the page opens on and the only one loaded with it; the others arrive when
 * their tab is first chosen, and it stays mounted (invisible) underneath them so its model and whatever the reader
 * drew survive a trip through the other three.
 *
 * The box used to take its height from the classifier whatever was showing. Three of the four fill that height —
 * they are built to fill the box they are given, and two of them need a definite height to size a canvas against —
 * but `think` sizes itself from its own content, and on a 390 phone that left 163 px of empty panel under a small
 * attention map. So the box follows the station that has a height of its own, and animates between the two.
 */
/** Stations whose content sets its own height. The rest are stretched to the classifier's, as before. */
const OWN_HEIGHT = new Set<StationKey>(["think"]);
export function HeroStations({ stations, label, hint, t }: Props) {
  const active = useStation(), setActive = setStation;
  const still = useReducedMotion();
  const seeRef = useRef<HTMLDivElement>(null), ownRef = useRef<HTMLDivElement>(null);
  const [seeHeight, setSeeHeight] = useState<number>();
  const [ownHeight, setOwnHeight] = useState<number>();
  const id = useId(), current = stations.find((s) => s.key === active) ?? stations[0];
  const ownsHeight = OWN_HEIGHT.has(active);

  // Both panes are measured as they are laid out and as the window changes: the classifier is always in flow (it is
  // only invisible), and a station with its own height is placed against the top rather than stretched.
  useEffect(() => {
    const watch = (element: HTMLElement | null, set: (height: number) => void) => {
      if (!element) return () => {};
      const observer = new ResizeObserver(() => set(element.offsetHeight));
      observer.observe(element);
      set(element.offsetHeight);
      return () => observer.disconnect();
    };
    const stop = [watch(seeRef.current, setSeeHeight), watch(ownRef.current, setOwnHeight)];
    return () => stop.forEach((fn) => fn());
  }, [active]);

  const height = ownsHeight ? ownHeight : seeHeight;
  const move = (from: number, by: number) => {
    const next = stations[(from + by + stations.length) % stations.length];
    setActive(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  };

  return (
    <figure id="hero-instrument" className="not-prose my-0 min-w-0 scroll-mt-24" data-instrument={current.title}>
      <div className="relative">
        <CornerMarks />
        <div className="relative overflow-hidden rounded-md border border-border bg-panel">
          <span className="border-beam" aria-hidden />
          {/*
            Sized by the instrument, not the screen (a container query): it is half the page on a laptop and the whole
            of it on a phone. With room, the name and the four tabs share a line. Without (under 30rem: every phone,
            and a 1024 px laptop in English), the tabs take a line of their own in four equal parts. They must never
            set the instrument's width: "See Think Generate Act" in one line pushed it past the edge of a phone.
          */}
          <div className="@container border-b border-border">
          <div className="flex flex-wrap items-center gap-x-3 px-1.5 py-1">
            <span className="ml-2 size-1.5 shrink-0 rounded-full" style={{ background: current.color }} aria-hidden />
            <span className="label min-w-0 flex-1 truncate py-1.5 text-foreground">{current.title}</span>
            <div role="tablist" aria-label={label} className="grid w-full grid-cols-4 gap-0.5 @[30rem]:flex @[30rem]:w-auto @[30rem]:shrink-0 @[30rem]:items-center">
              {stations.map((s, i) => (
                <button
                  key={s.key}
                  id={`${id}-${s.key}`}
                  type="button"
                  role="tab"
                  aria-selected={s.key === active}
                  aria-controls={`${id}-panel`}
                  tabIndex={s.key === active ? 0 : -1}
                  onClick={() => setActive(s.key)}
                  onKeyDown={(e) => { if (e.key === "ArrowRight") move(i, 1); else if (e.key === "ArrowLeft") move(i, -1); }}
                  data-testid={`hero-tab-${s.key}`}
                  className={cn(
                    // The text scales with the instrument on a narrow one: a quarter of a 320 px phone is 68 px, and "Generate" in a
                    // wide fallback serif (Linux, some Android) did not fit at 14 px. The dot goes first, under 24rem.
                    // The chosen station is told by its colour: text in full ink and a 2 px rule in the station's own colour under it
                    // (the tabs sit in a title bar, where a boxed pill looked like a stray button). Not colour alone: the rule is a shape too.
                    "tap relative flex min-h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-0.5 font-heading text-[clamp(0.6875rem,3.5cqw,0.875rem)] font-semibold whitespace-nowrap transition-colors @[30rem]:px-2 @[30rem]:text-sm",
                    "after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--station)] after:opacity-0 after:transition-opacity after:content-['']",
                    s.key === active ? "text-foreground after:opacity-100" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={{ "--station": s.color } as React.CSSProperties}
                >
                  <span className="hidden size-1.5 shrink-0 rounded-full @[24rem]:block" style={{ background: s.color, boxShadow: s.key === active ? `0 0 10px ${s.color}` : undefined }} aria-hidden />
                  {s.word}
                </button>
              ))}
            </div>
          </div>
          </div>
          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${active}`} className="dot-grid p-4 font-sans sm:p-5">
            <ErrorBoundary fallback={<p className="py-10 text-center text-sm text-muted-foreground">This instrument hit an error. The rest of the page is unaffected.</p>}>
              <motion.div
                className="relative overflow-hidden"
                initial={false}
                animate={{ height: height ?? "auto" }}
                transition={still ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 38, mass: 0.7 }}
              >
                <div ref={seeRef} className={cn(active !== "see" && "invisible")} inert={active !== "see"} data-lab>
                  <HeroInstrumentLazy hint={hint} />
                </div>
                {active !== "see" && (
                  // Stretched to the box, unless the station brings a height of its own — then it sits against the
                  // top and the box comes down to meet it.
                  <div ref={ownsHeight ? ownRef : undefined} className={cn("absolute inset-x-0 top-0", !ownsHeight && "bottom-0")}>
                    {active === "think" && <Think t={t.think} />}
                    {active === "generate" && <Generate t={t.generate} />}
                    {active === "act" && <Act t={t.act} />}
                  </div>
                )}
              </motion.div>
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {current.caption}{" "}
        <Link href={current.href} className="text-signal underline decoration-signal/40 underline-offset-4 hover:decoration-signal">{current.more}</Link>
      </figcaption>
    </figure>
  );
}
