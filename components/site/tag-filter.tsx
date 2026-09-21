"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The row of tag chips over a list of articles. Most tags have one article, and a chip for each ran to two rows of
 * noise over the list: only tags with two or more articles get a chip, the rest wait behind "more". A tag that is
 * selected is always shown, whatever its count.
 */
export function TagFilter({ tags, counts, value, onChange, labels }: { tags: string[]; /** articles per tag, among the rows listed */ counts: Record<string, number>; value: string | null; onChange(tag: string | null): void; labels: { all: string; filter: string; more: string; fewer: string } }) {
  const [open, setOpen] = useState(false);
  const common = tags.filter((t) => (counts[t] ?? 0) >= 2), rare = tags.filter((t) => (counts[t] ?? 0) < 2);
  const shown = open || common.length === 0 ? tags : value && rare.includes(value) ? [...common, value] : common;
  const chip = "tap cursor-pointer rounded-sm border px-2 py-1 font-mono text-xs transition-colors";
  return (
    <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label={labels.filter}>
      {[null, ...shown].map((name) => (
        <button key={name ?? "__all"} type="button" aria-pressed={value === name} onClick={() => onChange(name)} className={cn(chip, value === name ? "border-signal bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground")}>
          {name ?? labels.all}
        </button>
      ))}
      {common.length > 0 && rare.length > 0 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(chip, "border-dashed border-input text-muted-foreground hover:text-foreground")} data-testid="tags-more">
          {open ? labels.fewer : `${labels.more} +${rare.length}`}
        </button>
      )}
    </div>
  );
}
