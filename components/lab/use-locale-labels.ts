"use client";

import { usePathname } from "next/navigation";

/**
 * An article's own strings, in the language of the page. Instruments are client components deep inside MDX and get
 * no `locale` prop; the path is the one place that always knows. One copy, so the routing rule lives in one place.
 */
export function useLocaleLabels<T>(zh: T, en: T): T {
  return usePathname()?.startsWith("/en") ? en : zh;
}
