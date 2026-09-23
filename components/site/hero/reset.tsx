"use client";

import { RotateCcw } from "lucide-react";

/**
 * One reset control, the same in every station.
 *
 * They had grown apart: the classifier had an eraser with a word beside it, "think" had a dotted-underline link
 * that only appeared once training had finished, and the other two had no way to start over at all. Same size,
 * same place — the end of each station's bottom row — and the same icon, with the label carried as the accessible
 * name so a 28 px control never has to compete for width on a phone.
 */
export function StationReset({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="tap ml-auto grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <RotateCcw className="size-3.5" aria-hidden />
    </button>
  );
}
