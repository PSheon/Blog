import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Stop {
  word: string;
  tag: string;
  count: number;
  color: string;
}

/**
 * See → Think → Generate → Act as a signal path, after the pipeline drawn along the bottom of the profile
 * banner. Each stop is a real destination: the tag that holds that kind of article.
 */
export function TriadRail({ locale, stops, label }: { locale: Locale; stops: Stop[]; label: string }) {
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
            <Link
              href={`/${locale}/tags/${stop.tag}`}
              className="group flex flex-col items-center gap-2 pb-1 text-sm transition-colors max-sm:w-full sm:flex-row sm:gap-2.5 sm:rounded-full sm:border sm:border-border sm:bg-background sm:py-1.5 sm:pr-3.5 sm:pl-2.5 sm:hover:border-foreground/30"
            >
              <span className="size-2.5 rounded-full ring-4 ring-background transition-transform group-hover:scale-125 sm:size-2 sm:ring-0" style={{ background: stop.color, boxShadow: `0 0 12px ${stop.color}` }} aria-hidden />
              <span className="font-heading font-semibold">{stop.word}</span>
              <span className="label hidden sm:inline">#{stop.tag}</span>
              <span className="label tabular max-sm:-mt-1.5">{stop.count}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
