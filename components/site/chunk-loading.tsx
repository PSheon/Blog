"use client";

import { LoaderCircle } from "lucide-react";
import { Localised } from "@/components/lab/localised";

/**
 * Shown while a part of the page that is fetched on first use (the search palette, the phone's drawer, a hero
 * station) is still on its way: on a slow phone the first tap otherwise did nothing visible for a second.
 * `fixed`: a small status at the top of the screen, for things that open over the page. Otherwise it fills its box.
 */
export function ChunkLoading({ fixed }: { fixed?: boolean }) {
  return (
    <p role="status" className={fixed ? "fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-panel/95 px-3 py-2 font-sans text-sm text-muted-foreground backdrop-blur-md" : "grid h-full min-h-24 place-items-center font-sans text-sm text-muted-foreground"}>
      <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /><Localised zh="載入中…" en="Loading…" /></span>
    </p>
  );
}
