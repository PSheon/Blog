import type { Metadata, Viewport } from "next";
import "../globals.css";
import { fontVariables } from "../fonts";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { InstallHint } from "@/components/site/install";
import { NavProgress } from "@/components/site/nav-progress";
import { PageSwap } from "@/components/site/page-swap";
import { ServiceWorker } from "@/components/site/service-worker";
import { Spotlight } from "@/components/site/spotlight";
import { ThemeProvider } from "@/components/theme-provider";
import { getAllTags } from "@/lib/content/posts";
import { defaultLocale, getDictionary, htmlLang, isLocale, locales } from "@/lib/i18n";
import { sharedMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Not `dynamicParams = false`. It cascades to every route below, and Next then answers an unknown URL itself by
// throwing "Internal: NoFallbackError": a full-screen runtime error in `next dev`, a log line in production, and
// never our own 404. Unknown values are rendered on demand instead and end in notFound() in the page: for a
// locale, a slug or a tag alike. Known pages are still prerendered (generateStaticParams).

// One colour, not a prefers-color-scheme pair: the theme is a class next-themes puts on <html> and the default is
// dark whatever the OS says, so this is the right answer for the first paint. ThemeColor in components/theme-provider
// keeps it on whatever the reader actually chose after that.
export const viewport: Viewport = {
  themeColor: "#070918",
};

/**
 * The service worker runs on production only: a Vercel preview is a throwaway origin, and `next dev` must never be
 * cached. NEXT_PUBLIC_SERVICE_WORKER=off is the kill switch: pages then unregister it and empty its caches.
 */
const SERVICE_WORKER =
  process.env.NEXT_PUBLIC_SERVICE_WORKER !== "off" &&
  process.env.NODE_ENV === "production" &&
  (!process.env.VERCEL || process.env.VERCEL_ENV === "production");

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    metadataBase: new URL(site.url),
    title: { default: t.meta.title, template: `%s — ${site.name}` },
    description: t.meta.description,
    authors: [{ name: site.author, url: site.github }],
    // Search Console / Bing ownership tokens; unset locally and until Paul registers the site.
    verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION, other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined },
    ...sharedMetadata(locale, ""),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: asked } = await params;
  // A first segment that is not a language ("/nope") still lands here. The layout must not throw for it: nothing
  // sits above the root layout to catch that, and the reader got the framework's bare 404. It dresses the page in the
  // default language instead, and the page below answers 404 itself (every page checks the locale).
  const locale = isLocale(asked) ? asked : defaultLocale;
  const t = getDictionary(locale);

  return (
    <html lang={htmlLang[locale]} data-scroll-behavior="smooth" className={`${fontVariables} antialiased`} suppressHydrationWarning>
      <body id="top" className="flex min-h-dvh flex-col">
        {/* No disableTransitionOnChange: the colours are meant to fade, and components/theme-provider scopes that to the moment of the change. */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
            >
              {t.nav.skip}
            </a>
            <SiteHeader
              locale={locale}
              t={{ nav: t.nav, search: t.search, locale: t.locale, theme: t.theme, footer: t.footer, install: t.install }}
              tags={getAllTags(locale).map((x) => x.tag)}
            />
            {/* Decorative glows may be wider than the viewport. Clip them at the full-width level, never at the
                content container (that cuts them off mid-fade). `clip`, unlike `hidden`, keeps sticky children working. */}
            <main id="content" className="flex-1 overflow-x-clip">
              <PageSwap>{children}</PageSwap>
            </main>
            <SiteFooter locale={locale} t={t} />
        </ThemeProvider>
        {/* Real-visitor numbers: page views without cookies, and Core Web Vitals from actual devices. Their scripts
            are served by Vercel itself (/_vercel/…), so anywhere else they would only 404 into the console. Both
            also have to be switched on once in the project's dashboard. */}
        <NavProgress label={t.nav.loading} />
        <ServiceWorker enabled={SERVICE_WORKER} />
        <Spotlight />
        <InstallHint text={t.install.hint} action={t.install.action} dismiss={t.install.dismiss} />
        {process.env.VERCEL && <Analytics />}
        {process.env.VERCEL && <SpeedInsights />}
      </body>
    </html>
  );
}
