import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";
import { EntryNo, TagLink } from "@/components/site/post-meta";
import type { PostMeta } from "@/lib/content/posts";
import type { Dictionary, Locale } from "@/lib/i18n";
import { editUrl } from "@/lib/site";

interface Props {
  locale: Locale;
  post: PostMeta;
  newer: PostMeta | null;
  older: PostMeta | null;
  related: PostMeta[];
  t: Dictionary["post"];
}

function Neighbour({ post, locale, label, align }: { post: PostMeta; locale: Locale; label: string; align: "left" | "right" }) {
  const Arrow = align === "left" ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={`/${locale}/posts/${post.slug}`}
      // No prefetch down here: each article's payload is 20 KB and up, and six links fetched six of them per page view.
      prefetch={false}
      className={`group block border-t border-rule pt-4 ${align === "right" ? "sm:text-right" : ""}`}
    >
      <span className={`label flex items-center gap-1.5 ${align === "right" ? "sm:justify-end" : ""}`}>
        {align === "left" && <Arrow className="size-3" aria-hidden />}
        {label}
        {align === "right" && <Arrow className="size-3" aria-hidden />}
      </span>
      <span className="mt-1.5 block font-heading text-lg leading-snug font-semibold decoration-signal decoration-1 underline-offset-4 group-hover:underline">
        {post.title}
      </span>
    </Link>
  );
}

export function PostFooter({ locale, post, newer, older, related, t }: Props) {
  return (
    <footer className="mt-20 space-y-12 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
        <div className="flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <TagLink key={tag} tag={tag} locale={locale} />
          ))}
        </div>
        <a
          href={editUrl(post.slug, post.locale)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-6 items-center gap-1.5 text-sm text-muted-foreground hover:text-signal"
        >
          <Pencil className="size-3.5" aria-hidden />
          {t.edit}
        </a>
      </div>

      {(newer || older) && (
        <nav className="grid gap-6 sm:grid-cols-2" aria-label={`${t.older} / ${t.newer}`}>
          {older ? <Neighbour post={older} locale={locale} label={t.older} align="left" /> : <span />}
          {newer && <Neighbour post={newer} locale={locale} label={t.newer} align="right" />}
        </nav>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related">
          <h2 id="related" className="label mb-1">
            {t.related}
          </h2>
          <ul>
            {related.map((p) => (
              <li key={p.slug} className="border-b border-rule">
                <Link href={`/${locale}/posts/${p.slug}`} prefetch={false} className="group flex items-baseline gap-4 py-3">
                  <EntryNo no={p.no} draft={p.draft} locale={locale} className="shrink-0 text-xs text-signal" />
                  <span className="font-heading text-base font-medium decoration-signal decoration-1 underline-offset-4 group-hover:underline">
                    {p.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </footer>
  );
}
