"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TocItem } from "@/lib/content/toc";
import { cn } from "@/lib/utils";

function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;
    // The active section is the last heading that has scrolled past the top band.
    const update = () => {
      let current: string | null = null;
      for (const h of headings) {
        // A little below where a jump lands (scroll-padding-top is 8rem = 128 px), so the target counts as current.
        if (h.getBoundingClientRect().top <= 140) current = h.id;
        else break;
      }
      setActive(current ?? headings[0].id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [ids]);

  return active;
}

function TocList({ items, active, onNavigate, stagger }: { items: TocItem[]; active: string | null; onNavigate?(): void; stagger?: boolean }) {
  return (
    <ol className="border-l border-rule text-sm">
      {items.map((item, i) => (
        <li key={item.id} className={stagger ? "toc-row" : undefined} style={stagger ? ({ "--i": Math.min(i, 12) } as React.CSSProperties) : undefined}>
          <a
            href={`#${item.id}`}
            onClick={onNavigate}
            aria-current={active === item.id ? "location" : undefined}
            className={cn(
              "-ml-px block border-l py-1.5 leading-snug transition-colors",
              item.depth === 3 ? "pl-7" : "pl-4",
              active === item.id
                ? "border-signal text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function Toc({ items, label }: { items: TocItem[]; label: string }) {
  const active = useActiveHeading(items.map((i) => i.id));
  if (items.length === 0) return null;
  return (
    <nav aria-label={label}>
      <p className="label mb-3">{label}</p>
      <TocList items={items} active={active} />
    </nav>
  );
}

/**
 * The outline for screens without room for a side column: a bar that sticks under the header and names the section
 * being read. Opening it unfolds the whole list; choosing a section, pressing Escape or tapping elsewhere folds it.
 * (Not a <details>: its content cannot be transitioned, and this one should visibly open and close.)
 */
export function TocDisclosure({ items, label }: { items: TocItem[]; label: string }) {
  const active = useActiveHeading(items.map((i) => i.id));
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (items.length === 0) return null;
  const current = items.find((i) => i.id === active);
  return (
    // The bar holds a fixed slot in the page and the box grows over the text below it. If the list took room in the
    // flow, folding it after a jump would slide the page and leave the chosen heading under the bar.
    <div ref={root} className="relative h-[2.875rem]">
      <div
        data-open={open}
        className={cn(
          "group absolute inset-x-0 top-0 rounded-md border border-border bg-panel/85 backdrop-blur-md transition-[background-color,box-shadow] duration-300 supports-[backdrop-filter]:bg-panel/70",
          open && "bg-panel/95 shadow-lg shadow-black/20 supports-[backdrop-filter]:bg-panel/90",
        )}
        data-testid="toc-bar"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 text-left text-sm"
        >
          <span className="label shrink-0">{label}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{current?.text}</span>
          <span className="font-mono text-muted-foreground transition-transform duration-300 ease-out group-data-[open=true]:rotate-45" aria-hidden>
            +
          </span>
        </button>
        {/* Height runs 0fr → 1fr so the panel unfolds to whatever the list needs; closed, it is inert and out of the tab order. */}
        <div id={panelId} inert={!open} className="toc-panel grid">
          <div className="min-h-0 overflow-hidden">
            <nav aria-label={label} className="max-h-[60dvh] overflow-y-auto overscroll-contain px-4 pb-4">
              <TocList items={items} active={active} onNavigate={() => setOpen(false)} stagger />
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
