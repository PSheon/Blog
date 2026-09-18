import type { IndexRow } from "@/components/site/post-index";
import { type Locale, formatDate, getDictionary } from "@/lib/i18n";
import type { PostMeta } from "./posts";

/** Flatten posts into serialisable rows for the client-side index. */
export function toRows(posts: PostMeta[], locale: Locale): IndexRow[] {
  const t = getDictionary(locale);
  return posts.map((p) => ({
    slug: p.slug,
    no: p.no,
    title: p.title,
    description: p.description,
    date: p.date,
    dateLabel: formatDate(p.date, locale),
    minutesLabel: t.post.minutes(p.readingMinutes),
    tags: p.tags,
    interactive: p.interactive,
    langNote: p.isFallback ? "中文" : undefined,
  }));
}
