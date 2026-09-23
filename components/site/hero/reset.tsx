"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One reset control, the same in every station and the same as the classifier's eraser: a ghost button with an
 * icon and a word.
 *
 * They had grown apart — an eraser with a label on the classifier, a dotted-underline link on "think" that only
 * appeared once training had finished, and no way at all to start the other two over.
 *
 * The word always shows, so the rows that hold one are allowed to wrap rather than squeeze it out.
 */
export function StationReset({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <Button size="sm" variant="ghost" aria-label={label} onClick={onClick} data-testid={testId} className="ml-auto">
      <RotateCcw />
      {label}
    </Button>
  );
}
