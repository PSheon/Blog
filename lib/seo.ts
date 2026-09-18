import type { Metadata } from "next";
import { type Locale, defaultLocale, htmlLang, locales } from "@/lib/i18n";
import { site } from "@/lib/site";

/** Next replaces `alternates` and `openGraph` wholesale when a page sets them, so every page builds the full set here. */
type Shared = Pick<Metadata, "alternates" | "openGraph">;

/** hreflang map for a path that exists in `available` locales; x-default points at the original-language version. */
export function languageAlternates(path: string, available: readonly Locale[] = locales): Record<string, string> {
  const fallback = available.includes(defaultLocale) ? defaultLocale : available[0];
  return {
    ...Object.fromEntries(available.map((l) => [htmlLang[l], `/${l}${path}`])),
    "x-default": `/${fallback}${path}`,
  };
}

/**
 * Canonical, hreflang, the RSS link and the Open Graph basics for the page at `/${locale}${path}`.
 * `canonicalLocale` differs from `locale` only for a fallback page (a zh article served under /en).
 */
export function sharedMetadata(locale: Locale, path: string, opts: { available?: readonly Locale[]; canonicalLocale?: Locale } = {}): Shared {
  const canonical = `/${opts.canonicalLocale ?? locale}${path}`;
  return {
    alternates: {
      canonical,
      languages: languageAlternates(path, opts.available),
      types: { "application/rss+xml": `/${locale}/feed.xml` },
    },
    openGraph: {
      siteName: site.name,
      locale: locale === "zh" ? "zh_TW" : "en_US",
      alternateLocale: (opts.available ?? locales).filter((l) => l !== locale).map((l) => (l === "zh" ? "zh_TW" : "en_US")),
      url: canonical,
      type: "website",
    },
  };
}
