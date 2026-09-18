import { getAllPosts } from "@/lib/content/posts";
import { getDictionary, htmlLang, isLocale, locales } from "@/lib/i18n";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(_: Request, { params }: RouteContext<"/[locale]/feed.xml">) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response("Not found", { status: 404 });
  const t = getDictionary(locale);
  // Only articles actually written in this language belong in its feed.
  const items = getAllPosts(locale)
    .filter((p) => !p.isFallback)
    .map((p) => {
      const url = `${site.url}/${locale}/posts/${p.slug}`;
      return `<item><title>${esc(p.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(
        `${p.date}T00:00:00Z`,
      ).toUTCString()}</pubDate><description>${esc(p.description)}</description>${p.tags
        .map((tag) => `<category>${esc(tag)}</category>`)
        .join("")}</item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(
    t.meta.title,
  )}</title><link>${site.url}/${locale}</link><description>${esc(t.meta.description)}</description><language>${
    htmlLang[locale]
  }</language><atom:link href="${site.url}/${locale}/feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
