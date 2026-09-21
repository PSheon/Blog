"use client";

import type { ReactNode } from "react";
import { useLocaleLabels } from "./use-locale-labels";

/**
 * One of two pieces of text, by the language of the page. For server components deep inside MDX (the instrument frame),
 * which get no `locale` prop; it renders on the server too, so it works inside <noscript>.
 */
export function Localised({ zh, en }: { zh: ReactNode; en: ReactNode }) {
  return <>{useLocaleLabels(zh, en)}</>;
}
