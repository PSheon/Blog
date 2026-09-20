"use client";

import { useEffect, useState } from "react";
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

function TocList({ items, active, onNavigate }: { items: TocItem[]; active: string | null; onNavigate?(): void }) {
  return (
    <ol className="border-l border-rule text-sm">
      {items.map((item) => (
        <li key={item.id}>
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
 * being read. Opening it shows the whole list; choosing a section closes it again.
 */
export function TocDisclosure({ items, label }: { items: TocItem[]; label: string }) {
  const active = useActiveHeading(items.map((i) => i.id));
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const current = items.find((i) => i.id === active);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-md border border-border bg-panel/85 backdrop-blur-md supports-[backdrop-filter]:bg-panel/70"
      data-testid="toc-bar"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 text-sm [&::-webkit-details-marker]:hidden">
        <span className="label shrink-0">{label}</span>
        <span className="min-w-0 flex-1 truncate font-medium" aria-live="off">{current?.text}</span>
        <span className="font-mono text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="max-h-[60dvh] overflow-y-auto overscroll-contain px-4 pb-4">
        <TocList items={items} active={active} onNavigate={() => setOpen(false)} />
      </div>
    </details>
  );
}
