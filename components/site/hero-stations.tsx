"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useId, useState } from "react";
import { CornerMarks } from "@/components/lab/corner-marks";
import { ErrorBoundary } from "@/components/lab/error-boundary";
import { cn } from "@/lib/utils";
import { HeroInstrumentLazy } from "./hero-instrument-lazy";

const Think = dynamic(() => import("./hero/think"), { ssr: false });
const Generate = dynamic(() => import("./hero/generate"), { ssr: false });
const Act = dynamic(() => import("./hero/act"), { ssr: false });

export interface Station {
  key: "see" | "think" | "generate" | "act";
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
  const [active, setActive] = useState<Station["key"]>("see");
  const id = useId(), current = stations.find((s) => s.key === active) ?? stations[0];
  const move = (from: number, by: number) => {
    const next = stations[(from + by + stations.length) % stations.length];
    setActive(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  };

  return (
    <figure className="not-prose my-0" data-instrument={current.title}>
      <div className="relative">
        <CornerMarks />
        <div className="relative overflow-hidden rounded-md border border-border bg-panel">
          <span className="border-beam" aria-hidden />
          <div className="flex items-center gap-3 border-b border-border py-1 pr-1.5 pl-3.5">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: current.color }} aria-hidden />
            <span className="label min-w-0 flex-1 truncate text-foreground">{current.title}</span>
            <div role="tablist" aria-label={label} className="flex shrink-0 items-center gap-0.5">
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
                    "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-sm px-2 font-heading text-sm font-semibold transition-colors",
                    s.key === active ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="size-1.5 rounded-full" style={{ background: s.color, boxShadow: s.key === active ? `0 0 10px ${s.color}` : undefined }} aria-hidden />
                  {s.word}
                </button>
              ))}
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
