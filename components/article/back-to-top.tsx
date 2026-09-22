"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The way back up a long article: a round button in the bottom right corner that appears once the reader has
 * scrolled a screen down, and goes again near the top. It floats over the page, so it is one of the few things that
 * cast a shadow (DESIGN §Visual). Dialogs and the expanded playground are z-50 and cover it; the install hint on a
 * phone pushes it up (globals.css). After the jump, focus goes to the title, so the keyboard carries on from the top.
 */
export function BackToTop({ label }: { label: string }) {
  const [shown, setShown] = useState(false), calm = useReducedMotion();
  useEffect(() => {
    let queued = 0;
    const update = () => { queued = 0; setShown(window.scrollY > window.innerHeight); };
    const onScroll = () => { if (!queued) queued = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(queued); };
  }, []);
  const up = () => {
    window.scrollTo({ top: 0, behavior: calm ? "instant" : "smooth" });
    const title = document.querySelector<HTMLElement>("main h1");
    if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
  };
  return (
    <button
      type="button"
      onClick={up}
      aria-label={label}
      title={label}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      data-testid="back-to-top"
      className={cn(
        "back-to-top fixed right-4 bottom-4 z-30 grid size-11 cursor-pointer place-items-center rounded-full border border-input bg-panel/90 text-muted-foreground shadow-lg shadow-black/15 backdrop-blur-md transition-[opacity,transform,color] duration-300 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:right-6 md:bottom-6",
        shown ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3",
        calm && "transition-none",
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  );
}
