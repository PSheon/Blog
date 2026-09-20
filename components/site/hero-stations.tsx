"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useId } from "react";
import { CornerMarks } from "@/components/lab/corner-marks";
import { ErrorBoundary } from "@/components/lab/error-boundary";
import { cn } from "@/lib/utils";
import { type StationKey, setStation, useStation } from "./hero/station-store";
import { HeroInstrumentLazy } from "./hero-instrument-lazy";

const Think = dynamic(() => import("./hero/think"), { ssr: false });
const Generate = dynamic(() => import("./hero/generate"), { ssr: false });
const Act = dynamic(() => import("./hero/act"), { ssr: false });

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
 * their tab is first chosen. Its panel stays mounted (invisible) underneath the others, so the box keeps one height
 * whatever is showing and nothing on the page moves.
 */
export function HeroStations({ stations, label, hint, t }: Props) {
  const active = useStation(), setActive = setStation;
  const id = useId(), current = stations.find((s) => s.key === active) ?? stations[0];
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
                    "flex min-h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-0.5 font-heading text-[clamp(0.6875rem,3.5cqw,0.875rem)] font-semibold whitespace-nowrap transition-colors @[30rem]:px-2 @[30rem]:text-sm",
                    s.key === active ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="hidden size-1.5 shrink-0 rounded-full @[24rem]:block" style={{ background: s.color, boxShadow: s.key === active ? `0 0 10px ${s.color}` : undefined }} aria-hidden />
                  {s.word}
                </button>
              ))}
            </div>
          </div>
          </div>
          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${active}`} className="dot-grid relative p-4 font-sans sm:p-5">
            <ErrorBoundary fallback={<p className="py-10 text-center text-sm text-muted-foreground">This instrument hit an error. The rest of the page is unaffected.</p>}>
              <div className={cn(active !== "see" && "invisible")} inert={active !== "see"} data-lab>
                <HeroInstrumentLazy hint={hint} />
              </div>
              {active !== "see" && (
                <div className="absolute inset-4 sm:inset-5">
                  {active === "think" && <Think t={t.think} />}
                  {active === "generate" && <Generate t={t.generate} />}
                  {active === "act" && <Act t={t.act} />}
                </div>
              )}
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
