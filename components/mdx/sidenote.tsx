"use client";

import { type ReactNode, useId, useState } from "react";
import { useLocaleLabels } from "@/components/lab/use-locale-labels";
import { cn } from "@/lib/utils";

/**
 * A numbered note. On wide screens it sits in the right margin beside the line that
 * cites it; on narrow screens the number becomes a toggle and the note opens inline.
 */
export function Sidenote({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const noteWord = useLocaleLabels("註", "note");
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        // The number itself is about 7×12 px. The invisible ::before (::after is the number, see globals.css) gives a finger 25×26 px without moving a glyph.
        className="sidenote-ref relative mx-0.5 rounded-sm align-super font-mono text-[0.65em] leading-none text-signal before:absolute before:-inset-x-[9px] before:-inset-y-[7px] before:content-[''] xl:pointer-events-none"
      >
        <span className="sr-only">{noteWord} </span>
      </button>
      <span
        id={id}
        role="note"
        className={cn(
          "sidenote relative font-sans text-sm leading-relaxed text-muted-foreground",
          "my-3 border-l-2 border-signal/50 pl-3",
          open ? "block" : "hidden",
          "xl:float-right xl:clear-right xl:my-0 xl:mb-4 xl:block xl:border-l-0 xl:pl-0",
          "xl:mr-[calc(-1*(var(--margin-w)+var(--margin-gap)))] xl:w-(--margin-w)",
        )}
      >
        {children}
      </span>
    </>
  );
}
