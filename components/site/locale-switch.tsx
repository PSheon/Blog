"use client";

import { usePathname } from "next/navigation";
import { type Locale, localeLabel, locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Swaps the locale segment and keeps the rest of the path, so you stay on the same article.
 * Plain anchors on purpose: a language change replaces <html lang> and the whole root layout,
 * so it is a real page load. A client-side transition would remount the theme script.
 */
export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <nav aria-label={label} className="flex items-center rounded-md border border-border p-0.5">
      {locales.map((l) => (
        <a
          key={l}
          href={`/${l}${rest ? `/${rest}` : ""}`}
          hrefLang={l === "zh" ? "zh-Hant-TW" : "en"}
          lang={l === "zh" ? "zh-Hant-TW" : "en"}
          aria-current={l === locale ? "true" : undefined}
          className={cn(
            // 24 px tall: the two links sit side by side, so neither may be smaller than a fingertip (WCAG 2.5.8).
            "tap rounded-[5px] px-2 py-1.5 font-mono text-xs leading-none transition-colors",
            l === locale
              ? "bg-accent text-foreground ring-1 ring-foreground/45 ring-inset"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l === "zh" ? "中" : "EN"}
          <span className="sr-only"> {localeLabel[l]}</span>
        </a>
      ))}
    </nav>
  );
}
