"use client";

import { TagFilter } from "./tag-filter";
import { useTagFilter } from "./use-tag-filter";
import { htmlLang } from "@/lib/i18n/config";
import Link from "next/link";
import { ViewTransition } from "react";
import { CornerMarks } from "@/components/lab/corner-marks";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PostCover } from "./post-cover";
import type { IndexRow } from "./post-index";
import { EntryNo, InteractiveBadge } from "./post-meta";

interface Props {
  locale: Locale;
  rows: IndexRow[];
  tags: string[];
  labels: { all: string; empty: string; interactive: string; filter: string; more: string; fewer: string };
  /** How many tiles at most. Six fills the desktop grid exactly (4+2 / 2 / 2·2·2); the full list lives on /posts. */
  limit?: number;
}

/**
 * Tile sizes on the six-column desktop grid, by position: the newest article gets the big tile, then three small
 * ones beside and under it, then the pattern 2·2·2 / 3·3 repeats so every row is full whatever the count.
 */
function span(i: number, count: number): string {
  if (i === 0) return "md:col-span-2 lg:col-span-4 lg:row-span-2";
  if (i <= 2) return (i === count - 1 && count % 2 === 0 ? "md:max-lg:col-span-2 " : "") + "lg:col-span-2";
  const k = (i - 3) % 5;
  // A lone last tile would leave a hole: let it run the full width.
  if (i === count - 1 && (k === 0 || k === 3)) return "md:col-span-2 lg:col-span-6";
  // On the two-column tablet grid the big tile takes a whole row, so an even count leaves the last tile alone.
  const tablet = i === count - 1 && count % 2 === 0 ? "md:max-lg:col-span-2 " : "";
  return tablet + (k < 3 ? "lg:col-span-2" : "lg:col-span-3");
}

/** The home page's index as a bento grid: the most recent articles as tiles with their drawings, the newest one the largest. */
export function PostBento({ locale, rows, tags, labels, limit = 6 }: Props) {
  const [tag, setTag] = useTagFilter();
  const counts: Record<string, number> = {}; for (const r of rows) for (const name of r.tags) counts[name] = (counts[name] ?? 0) + 1;
  const visible = (tag ? rows.filter((r) => r.tags.includes(tag)) : rows).slice(0, limit);

  return (
    <div>
      {tags.length > 0 && <TagFilter tags={tags} counts={counts} value={tag} onChange={setTag} labels={labels} />}

      {visible.length === 0 ? (
        <p className="border-t border-rule py-10 text-muted-foreground">{labels.empty}</p>
      ) : (
        <ol className="grid gap-3 md:grid-cols-2 lg:auto-rows-fr lg:grid-cols-6" data-testid="post-bento">
          {visible.map((row, i) => {
            const big = i === 0, wide = !big && span(i, visible.length).includes("col-span-3");
            return (
              <li key={row.slug} className={cn("relative min-w-0", span(i, visible.length))}>
                {big && <CornerMarks />}
                <Link
                  href={`/${locale}/posts/${row.slug}`}
                  className={cn(
                    "spotlight group flex h-full flex-col overflow-hidden rounded-md border border-border bg-panel transition-colors hover:border-foreground/30",
                    wide && "sm:flex-row",
                  )}
                >
                  <div className={cn("bento-cover dot-grid relative grid place-items-center overflow-hidden border-border p-4", wide ? "border-b sm:w-2/5 sm:border-r sm:border-b-0" : "border-b", big && "lg:flex-1 lg:p-8")}>
                    <PostCover slug={row.slug} no={row.no} className={cn("bento-art opacity-85", big ? "max-w-md" : "max-w-[15rem]")} />
                  </div>
                  <div className={cn("flex flex-1 flex-col gap-2 p-4", big && "lg:flex-none lg:p-6")}>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <EntryNo no={row.no} draft={row.draft} locale={locale} className="text-signal" />
                      <time dateTime={row.date} className="label">{row.dateLabel}</time>
                      <span className="label">{row.minutesLabel}</span>
                    </p>
                    <ViewTransition name={`post-title-${row.slug}`} share="title-morph" default="none">
                      <h3 lang={row.langNote ? htmlLang.zh : undefined} className={cn("font-heading leading-snug font-semibold text-balance decoration-signal decoration-1 underline-offset-4 group-hover:underline", big ? "text-2xl lg:text-3xl" : "text-lg")}>
                        {row.title}
                      </h3>
                    </ViewTransition>
                    {/* Every tile says what the article is about while tiles are stacked; on the desktop grid only the roomy ones do. */}
                    <p lang={row.langNote ? htmlLang.zh : undefined} className={cn("max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground", !big && "line-clamp-2", !(big || wide) && "lg:hidden")}>{row.description}</p>
                    <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-xs text-muted-foreground">
                      {row.interactive && <InteractiveBadge label={labels.interactive} />}
                      {row.tags.map((name) => <span key={name}>#{name}</span>)}
                      {row.langNote && <span className="text-signal-2">{row.langNote}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
