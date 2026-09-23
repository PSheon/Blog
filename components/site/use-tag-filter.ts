"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The tag filter, kept in the URL.
 *
 * It used to be component state, so a filtered list could not be linked or bookmarked, Back did not undo the last
 * chip pressed, and a reload dropped it. `?tag=` fixes all three.
 *
 * Not `useSearchParams`: these pages are prerendered, and reading the query during static rendering forces the
 * whole route to opt out of it for a filter that only matters once the page is interactive. Reading
 * `window.location` after mount costs one render and nothing else. `history.pushState` (rather than the router)
 * keeps this on the same page — no server round trip, no lost scroll position — and `popstate` is what makes the
 * back button walk the filters the reader pressed.
 */
export function useTagFilter(): [string | null, (tag: string | null) => void] {
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setTag(new URLSearchParams(window.location.search).get("tag"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const choose = useCallback((next: string | null) => {
    const query = new URLSearchParams(window.location.search);
    if (next) query.set("tag", next);
    else query.delete("tag");
    const search = query.toString();
    window.history.pushState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
    setTag(next);
  }, []);

  return [tag, choose];
}
