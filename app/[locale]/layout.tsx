import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "katex/dist/katex.min.css";
import "../globals.css";
import { fontVariables } from "../fonts";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAllTags } from "@/lib/content/posts";
import { getDictionary, htmlLang, isLocale, locales } from "@/lib/i18n";
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
    alternates: {
      canonical: `/${locale}`,
      languages: { "zh-Hant-TW": "/zh", en: "/en" },
      types: { "application/rss+xml": `/${locale}/feed.xml` },
    },
    openGraph: { siteName: site.name, locale: locale === "zh" ? "zh_TW" : "en_US", type: "website" },
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
          <TooltipProvider>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
            >
              {locale === "zh" ? "跳到主要內容" : "Skip to content"}
            </a>
            <SiteHeader
              locale={locale}
              nav={t.nav}
              search={t.search}
              tags={getAllTags(locale).map((x) => x.tag)}
            />
            {/* Decorative glows may be wider than the viewport. Clip them at the full-width level, never at the
                content container (that cuts them off mid-fade). `clip`, unlike `hidden`, keeps sticky children working. */}
            <main id="content" className="flex-1 overflow-x-clip">
              {children}
            </main>
            <SiteFooter locale={locale} t={t} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
