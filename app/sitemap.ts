import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { locales } from "@/lib/i18n";
import { languageAlternates } from "@/lib/seo";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const absolute = (languages: Record<string, string>) => Object.fromEntries(Object.entries(languages).map(([lang, path]) => [lang, `${site.url}${path}`]));
  const both = (path: string) => ({ languages: absolute(languageAlternates(path)) });
  return locales.flatMap((locale) => [
    ...["", "/posts", "/tags"].map((path) => ({
      url: `${site.url}/${locale}${path}`,
      alternates: both(path),
    })),
    ...getAllPosts(locale)
      .filter((p) => !p.isFallback)
      .map((p) => ({
        url: `${site.url}/${locale}/posts/${p.slug}`,
        lastModified: p.updated ?? p.date,
        alternates: { languages: absolute(languageAlternates(`/posts/${p.slug}`, p.availableLocales)) },
      })),
    ...getAllTags(locale).map(({ tag }) => ({ url: `${site.url}/${locale}/tags/${tag}` , alternates: both(`/tags/${tag}`) })),
  ]);
}
