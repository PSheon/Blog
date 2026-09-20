import { describe, expect, it } from "vitest";
import { getAllPosts, getPostMeta } from "@/lib/content/posts";

/** The real articles, drafts included: the two language versions of one article must not drift apart. */
const zh = getAllPosts("zh", { includeDrafts: true });

describe("published content", () => {
  it("numbers every article once", () => {
    const numbers = zh.map((p) => p.no);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it.each(zh.filter((p) => p.availableLocales.includes("en")).map((p) => [p.slug, p] as const))(
    "%s: the English version agrees with the Chinese one on number, date, tags and flags",
    (slug, post) => {
      const en = getPostMeta(slug, "en", { includeDrafts: true })!;
      expect(en.isFallback).toBe(false);
      expect({ no: en.no, date: en.date, updated: en.updated, tags: en.tags, draft: en.draft, interactive: en.interactive, featured: en.featured }).toEqual({
        no: post.no, date: post.date, updated: post.updated, tags: post.tags, draft: post.draft, interactive: post.interactive, featured: post.featured,
      });
    },
  );

  it("has an English version of everything that is published", () => {
    // Translation debt stays visible: a published article without en.mdx has to be listed here on purpose.
    const missing = zh.filter((p) => !p.draft && !p.availableLocales.includes("en")).map((p) => p.slug);
    expect(missing).toEqual([]);
  });

  it("keeps search titles and descriptions inside what a results page shows", () => {
    for (const locale of ["zh", "en"] as const) {
      for (const p of getAllPosts(locale)) {
        const [title, description] = locale === "en" ? [46, 160] : [24, 80];
        expect((p.seoTitle ?? p.title).length, `${p.slug} ${locale} title`).toBeLessThanOrEqual(title);
        expect((p.seoDescription ?? p.description).length, `${p.slug} ${locale} description`).toBeLessThanOrEqual(description);
      }
    }
  });
});
