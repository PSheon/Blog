"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/lab/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The way back up a long article: a round button in the bottom right corner. It appears when the reader, a screen or
 * more down, scrolls back up (that is when a way to the top is wanted), and gets out of the way while they read down,
 * where on a phone it sat over the last line of text. It only fades; a button that slid while the page scrolled read
 * as drifting. It floats over the page, so it is one of the few things that cast a shadow (DESIGN §Visual). Dialogs
 * and the expanded playground are z-50 and cover it; the install hint on a phone pushes it up (globals.css). After the
 * jump, focus goes to the title, so the keyboard carries on from the top.
 */
export function BackToTop({ label }: { label: string }) {
  const [shown, setShown] = useState(false), calm = useReducedMotion(), jumping = useRef(false); // on its way up: stay hidden until the top
  useEffect(() => {
    let queued = 0;
    let lastY = window.scrollY;
    const update = () => {
      queued = 0;
      const y = window.scrollY;
      // the glide up ends at the top, or the moment the reader scrolls down again through it
      if (jumping.current && y > 0 && y <= lastY) { lastY = y; return; }
      jumping.current = false;
      // Reading down, it would sit over the last line of text on a phone: it shows only while the reader scrolls back up
      // (a few pixels of hysteresis, so a finger's jitter does not flicker it), and never near the top.
      const up = y < lastY - 4, down = y > lastY + 4;
      if (up || down) lastY = y;
      if (y <= window.innerHeight) setShown(false); else if (up) setShown(true); else if (down) setShown(false);
    };
    const onScroll = () => { if (!queued) queued = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(queued); };
  }, []);
  const up = () => {
    jumping.current = true; setShown(false); // gone at once, and it stays gone until the page is at the top
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
        "back-to-top fixed right-4 bottom-4 z-30 grid size-11 cursor-pointer place-items-center rounded-full border border-input bg-panel/90 text-muted-foreground shadow-lg shadow-black/15 backdrop-blur-md transition-[opacity,color] duration-200 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:right-6 md:bottom-6",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
        calm && "transition-none",
      )}
    >
      <ArrowUp className="size-5" aria-hidden />
    </button>
  );
}
