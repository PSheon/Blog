import Link from "next/link";
import type { Locale } from "@/lib/i18n";

interface Stop {
  word: string;
  tag: string;
  count: number;
  color: string;
}

/**
 * See → Think → Act as a signal path, after the pipeline drawn along the bottom of the profile
 * banner. Each stop is a real destination: the tag that holds that kind of article.
 */
export function TriadRail({ locale, stops, label }: { locale: Locale; stops: Stop[]; label: string }) {
  return (
    <nav aria-label={label} className="relative py-10">
      <div className="triad-gradient absolute inset-x-0 top-1/2 h-px opacity-40 [mask-image:repeating-linear-gradient(90deg,#000_0_4px,transparent_4px_10px)]" aria-hidden />
      <ol className="relative grid grid-cols-3">
        {stops.map((stop, i) => (
          <li key={stop.tag} className={i === 0 ? "justify-self-start" : i === stops.length - 1 ? "justify-self-end" : "justify-self-center"}>
            <Link
              href={`/${locale}/tags/${stop.tag}`}
              className="group flex items-center gap-2.5 rounded-full border border-border bg-background py-1.5 pr-3.5 pl-2.5 text-sm transition-colors hover:border-foreground/30"
            >
              <span className="size-2 rounded-full transition-transform group-hover:scale-125" style={{ background: stop.color, boxShadow: `0 0 12px ${stop.color}` }} aria-hidden />
              <span className="font-heading font-semibold">{stop.word}</span>
              <span className="label hidden sm:inline">#{stop.tag}</span>
              <span className="label tabular">{stop.count}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
