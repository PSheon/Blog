import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { locales } from "@/lib/i18n";
import { languageAlternates } from "@/lib/seo";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const absolute = (languages: Record<string, string>) => Object.fromEntries(Object.entries(languages).map(([lang, path]) => [lang, `${site.url}${path}`]));
  const both = (path: string) => ({ languages: absolute(languageAlternates(path)) });
  return locales.flatMap((locale) => [
    // The index pages change when an article is published or revised: they are as fresh as the freshest article.
    ...["", "/posts", "/tags"].map((path) => ({
      url: `${site.url}/${locale}${path}`,
      lastModified: getAllPosts(locale).map((p) => p.updated ?? p.date).sort().at(-1),
      alternates: both(path),
    })),
    ...getAllPosts(locale)
      .filter((p) => !p.isFallback)
      .map((p) => ({
        url: `${site.url}/${locale}/posts/${p.slug}`,
        lastModified: p.updated ?? p.date,
        alternates: { languages: absolute(languageAlternates(`/posts/${p.slug}`, p.availableLocales)) },
      })),
    // A tag with a single article is that article's index entry over again: not worth a search result of its own.
    ...getAllTags(locale).filter(({ count }) => count > 1).map(({ tag }) => ({ url: `${site.url}/${locale}/tags/${tag}` , alternates: both(`/tags/${tag}`) })),
  ]);
}
