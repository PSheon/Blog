"use client";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { STATION_KEYS, setStation, useStation } from "./hero/station-store";

interface Stop {
  word: string;
  tag: string;
  count: number;
  color: string;
}

/**
 * See → Think → Generate → Act as a signal path, after the pipeline drawn along the bottom of the profile
 * banner. Each stop does two things. Its name switches the hero instrument above to that kind of model (the rail and
 * the instrument's own tabs are one control, shared through the station store). Its tag and count are a real
 * destination: the articles of that kind.
 */
export function TriadRail({ locale, stops, label, show }: { locale: Locale; stops: Stop[]; label: string; /** "Show {word} in the instrument above", with {word} to fill in. */ show: string }) {
  const active = useStation();
  const choose = (i: number) => {
    setStation(STATION_KEYS[i]);
    // On a phone the instrument is a screen above the rail: bring it back, or the tap seems to do nothing.
    const hero = document.getElementById("hero-instrument"), box = hero?.getBoundingClientRect();
    if (hero && box && (box.bottom < 80 || box.top > window.innerHeight - 80)) hero.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return (
    <nav aria-label={label} className="relative py-8 [container-type:inline-size] sm:py-10">
      {/* Wide screens: pills strung on a dashed line, with a packet travelling along it. */}
      <div className="triad-gradient absolute inset-x-0 top-1/2 hidden h-px opacity-40 [mask-image:repeating-linear-gradient(90deg,#000_0_4px,transparent_4px_10px)] sm:block" aria-hidden />
      <div className="absolute inset-x-0 top-1/2 hidden h-px overflow-hidden sm:block" aria-hidden>
        <span className="rail-pulse [--rail-w:100cqw]" />
      </div>
      {/*
        A phone has no room for four pills in a row, and wrapped two by two they stop reading as a sequence (the line
        ran through the gap between the rows). So there the rail is a line of four stations: dots on the line, names
        under them, an arrowhead between each pair, all in one row whatever the language.
      */}
      <ol className="relative grid grid-cols-4">
        <li className="pointer-events-none absolute inset-x-[12.5%] top-[5px] h-px sm:hidden" aria-hidden>
          <span className="triad-gradient absolute inset-0 opacity-50" />
          <span className="absolute inset-0 overflow-hidden"><span className="rail-pulse [--rail-w:75cqw]" /></span>
        </li>
        {stops.map((stop, i) => (
          <li key={stop.tag} className={cn("relative flex justify-center", i === 0 ? "sm:justify-start" : i === stops.length - 1 ? "sm:justify-end" : "sm:justify-center")}>
            {i > 0 && <span className="absolute top-[5px] left-0 -translate-x-1/2 -translate-y-1/2 font-mono text-xs leading-none text-muted-foreground sm:hidden" aria-hidden>›</span>}
            <div
              className={cn(
                "flex flex-col items-center text-sm transition-colors max-sm:w-full sm:flex-row sm:rounded-full sm:border sm:bg-background",
                active === STATION_KEYS[i] ? "sm:border-foreground/40" : "sm:border-border sm:hover:border-foreground/30",
              )}
            >
              <button
                type="button"
                aria-pressed={active === STATION_KEYS[i]}
                aria-label={show.replace("{word}", stop.word)}
                onClick={() => choose(i)}
                data-testid={`rail-${STATION_KEYS[i]}`}
                className="group flex cursor-pointer flex-col items-center gap-2 max-sm:w-full sm:flex-row sm:gap-2.5 sm:py-1.5 sm:pr-1 sm:pl-2.5"
              >
                <span
                  className={cn("size-2.5 rounded-full ring-4 ring-background transition-transform group-hover:scale-125 sm:size-2 sm:ring-0", active === STATION_KEYS[i] && "scale-125")}
                  style={{ background: stop.color, boxShadow: `0 0 ${active === STATION_KEYS[i] ? 18 : 12}px ${stop.color}` }}
                  aria-hidden
                />
                <span className={cn("font-heading font-semibold", active !== STATION_KEYS[i] && "text-foreground/80")}>{stop.word}</span>
              </button>
              <Link href={`/${locale}/tags/${stop.tag}`} className="label flex min-h-6 min-w-8 items-center justify-center gap-2 px-2 decoration-dotted underline-offset-4 hover:text-foreground hover:underline sm:py-1.5 sm:pr-3.5 sm:pl-1.5">
                <span className="hidden sm:inline">#{stop.tag}</span>
                <span className="tabular">{stop.count}</span>
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}
