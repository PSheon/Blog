"use client";

import Link from "next/link";
import { ViewTransition, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PostCover } from "./post-cover";
import { EntryNo, InteractiveBadge } from "./post-meta";

export interface IndexRow {
  slug: string;
  no: number;
  title: string;
  description: string;
  date: string;
  dateLabel: string;
  minutesLabel: string;
  tags: string[];
  interactive: boolean;
  /** Set when the row is served in another language than the page. */
  langNote?: string;
}

interface Props {
  locale: Locale;
  rows: IndexRow[];
  tags: string[];
  labels: { all: string; empty: string; interactive: string; filter: string };
  /** Hide the filter chips, e.g. on a single-tag page. */
  filterable?: boolean;
  /** Heading level of each entry: 3 under the home page's "Notebook index" h2, 2 where the list follows the page h1. */
  level?: 2 | 3;
}

/** The notebook's table of contents: one ruled line per entry, № and date in the margin. */
export function PostIndex({ locale, rows, tags, labels, filterable = true, level = 2 }: Props) {
  const Heading = `h${level}` as const;
  const [tag, setTag] = useState<string | null>(null);
  const visible = tag ? rows.filter((r) => r.tags.includes(tag)) : rows;

  return (
    <div>
      {filterable && tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label={labels.filter}>
          {[null, ...tags].map((name) => (
            <button
              key={name ?? "__all"}
              type="button"
              aria-pressed={tag === name}
              onClick={() => setTag(name)}
              className={cn(
                "rounded-sm border px-2 py-1 font-mono text-xs transition-colors",
                tag === name
                  ? "border-signal bg-signal/10 text-signal"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {name ?? labels.all}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="border-t border-rule py-10 text-muted-foreground">{labels.empty}</p>
      ) : (
        <ol className="border-t border-rule">
          {visible.map((row) => (
            <li key={row.slug} className="border-b border-rule">
              <Link
                href={`/${locale}/posts/${row.slug}`}
                className="spotlight spotlight-row group grid gap-x-6 gap-y-1.5 py-5 md:grid-cols-[4.5rem_7.5rem_minmax(0,1fr)_auto] md:items-baseline lg:grid-cols-[4.5rem_7.5rem_minmax(0,1fr)_9rem]"
              >
                <EntryNo no={row.no} className="text-xs text-signal" />
                <time dateTime={row.date} className="label">
                  {row.dateLabel}
                </time>
                <div className="min-w-0">
                  <ViewTransition name={`post-title-${row.slug}`} share="title-morph" default="none">
                    <Heading className="font-heading text-xl leading-snug font-semibold text-balance decoration-signal decoration-1 underline-offset-4 group-hover:underline">
                      {row.title}
                    </Heading>
                  </ViewTransition>
                  <p className="mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {row.description}
                  </p>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                    {row.interactive && <InteractiveBadge label={labels.interactive} />}
                    {row.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                    {row.langNote && <span className="text-signal-2">{row.langNote}</span>}
                  </p>
                </div>
                <div className="md:text-right lg:self-start">
                  {/* Each article's drawing, on wide screens only: on a phone the list is already long. */}
                  <PostCover slug={row.slug} no={row.no} className="mb-2 hidden rounded-sm border border-border bg-panel opacity-80 transition-opacity group-hover:opacity-100 lg:block" />
                  <span className="label">{row.minutesLabel}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
