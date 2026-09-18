import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import "../globals.css";
import { fontVariables } from "../fonts";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { ThemeProvider } from "@/components/theme-provider";
import { getAllTags } from "@/lib/content/posts";
import { getDictionary, htmlLang, isLocale, locales } from "@/lib/i18n";
import { sharedMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070918" },
    { media: "(prefers-color-scheme: light)", color: "#fbfbfe" },
  ],
};

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
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);

  return (
    <html lang={htmlLang[locale]} data-scroll-behavior="smooth" className={`${fontVariables} antialiased`} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
            >
              {locale === "zh" ? "跳到主要內容" : "Skip to content"}
            </a>
            <SiteHeader
              locale={locale}
              t={{ nav: t.nav, search: t.search, locale: t.locale, theme: t.theme, footer: t.footer }}
              tags={getAllTags(locale).map((x) => x.tag)}
            />
            {/* Decorative glows may be wider than the viewport. Clip them at the full-width level, never at the
                content container (that cuts them off mid-fade). `clip`, unlike `hidden`, keeps sticky children working. */}
            <main id="content" className="flex-1 overflow-x-clip">
              {/*
                This boundary lives in the layout and never remounts, so a navigation is an *update* of its
                content (enter/exit would only fire if the boundary itself appeared or disappeared).
              */}
              <ViewTransition update="page-swap" default="none">
                {children}
              </ViewTransition>
            </main>
            <SiteFooter locale={locale} t={t} />
        </ThemeProvider>
      </body>
    </html>
  );
}
