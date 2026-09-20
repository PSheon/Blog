"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

/**
 * The routed content, animated only when the route changes. The boundary is keyed by the pathname, so a navigation
 * is one page exiting and another entering. It must not listen for `update`: anything inside that finishes loading
 * late (a `next/dynamic` demo swapping in for its placeholder) is an update too, and would replay the page
 * transition on top of a page that is already there.
 */
export function PageSwap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page-swap" exit="page-swap" update="none" default="none">
      {children}
    </ViewTransition>
  );
}
