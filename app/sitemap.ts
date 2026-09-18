import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags } from "@/lib/content/posts";
import { htmlLang, locales } from "@/lib/i18n";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const both = (path: string) => ({
    languages: Object.fromEntries(locales.map((l) => [htmlLang[l], `${site.url}/${l}${path}`])),
  });
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
        alternates: {
          languages: Object.fromEntries(
            p.availableLocales.map((l) => [htmlLang[l], `${site.url}/${l}/posts/${p.slug}`]),
          ),
        },
      })),
    ...getAllTags(locale).map(({ tag }) => ({ url: `${site.url}/${locale}/tags/${tag}` })),
  ]);
}
