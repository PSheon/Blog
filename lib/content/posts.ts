import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";
import { type Locale, locales } from "@/lib/i18n/config";
import { readingMinutes } from "./reading-time";
import { type Frontmatter, frontmatterSchema } from "./schema";
import { type TocItem, extractToc } from "./toc";

export const POSTS_DIR = path.join(process.cwd(), "content/posts");

export interface PostMeta extends Frontmatter {
  slug: string;
  /** Locale of the file actually served; differs from the request when falling back. */
  locale: Locale;
  availableLocales: Locale[];
  isFallback: boolean;
  readingMinutes: number;
}

export interface QueryOptions {
  dir?: string;
  includeDrafts?: boolean;
}

interface Loaded {
  meta: PostMeta;
  source: string;
}

function available(dir: string, slug: string): Locale[] {
  return locales.filter((l) => fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, slug, `${l}.mdx`)));
}

/**
 * One render asks for the same posts many times over (the layout's tags, the page's list, adjacent and related
 * posts, metadata and the page both wanting the same article). React's `cache` makes each file one read and one
 * parse per render; the arguments are primitives, so every caller shares the entry. Outside a render (tests,
 * route handlers) it simply calls through.
 */
const load = cache(loadUncached);

function loadUncached(dir: string, slug: string, locale: Locale): Loaded | null {
  const availableLocales = available(dir, slug);
  // A post exists only once its zh source does.
  if (!availableLocales.includes("zh")) return null;
  const served = availableLocales.includes(locale) ? locale : "zh";
  const file = path.join(/*turbopackIgnore: true*/ dir, slug, `${served}.mdx`);
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid frontmatter in ${path.relative(process.cwd(), file)}\n${issues}`);
  }
  return {
    source: content,
    meta: {
      ...parsed.data,
      slug,
      locale: served,
      availableLocales,
      isFallback: served !== locale,
      readingMinutes: readingMinutes(content),
    },
  };
}

/** Drafts are visible while writing (`next dev`) and nowhere else unless asked for. */
function showDrafts(opts: QueryOptions): boolean {
  return opts.includeDrafts ?? process.env.NODE_ENV === "development";
}

export function getAllPosts(locale: Locale, opts: QueryOptions = {}): PostMeta[] {
  const dir = opts.dir ?? POSTS_DIR;
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  const drafts = showDrafts(opts);
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => load(dir, e.name, locale)?.meta)
    .filter((m): m is PostMeta => !!m && (drafts || !m.draft))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
}

/**
 * One article, or null. A draft is null wherever drafts are not shown, exactly as it is missing from getAllPosts():
 * the article page renders unknown slugs on demand, so without this a draft was one typed URL away in production.
 */
export function getPostMeta(slug: string, locale: Locale, opts: QueryOptions = {}): PostMeta | null {
  const meta = load(opts.dir ?? POSTS_DIR, slug, locale)?.meta ?? null;
  return meta?.draft && !showDrafts(opts) ? null : meta;
}

export function getToc(slug: string, locale: Locale, opts: QueryOptions = {}): TocItem[] {
  const loaded = load(opts.dir ?? POSTS_DIR, slug, locale);
  return loaded ? extractToc(loaded.source) : [];
}

export function getAllTags(locale: Locale, opts: QueryOptions = {}): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of getAllPosts(locale, opts)) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function getAdjacentPosts(slug: string, locale: Locale, opts: QueryOptions = {}) {
  const posts = getAllPosts(locale, opts);
  const i = posts.findIndex((p) => p.slug === slug);
  return {
    newer: i > 0 ? posts[i - 1] : null,
    older: i >= 0 && i < posts.length - 1 ? posts[i + 1] : null,
  };
}

export function getRelatedPosts(slug: string, locale: Locale, limit = 3, opts: QueryOptions = {}): PostMeta[] {
  const posts = getAllPosts(locale, opts);
  const self = posts.find((p) => p.slug === slug);
  if (!self) return [];
  return posts
    .filter((p) => p.slug !== slug)
    .map((p) => ({ p, overlap: p.tags.filter((t) => self.tags.includes(t)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.p.date.localeCompare(a.p.date))
    .slice(0, limit)
    .map((x) => x.p);
}
