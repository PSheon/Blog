import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The article's number, and beside it a mark if the article is a draft. Drafts are left out of production builds and
 * listed only by `next dev`, where they used to look exactly like published articles: nothing on the page said so.
 * The mark rides on the number because the number is on every surface an article appears on.
 */
export function EntryNo({ no, draft, locale, className }: { no: number; draft?: boolean; /** needed with `draft`: the mark is in the page's language */ locale?: Locale; className?: string }) {
  return (
    // Wraps as two whole pieces: in the index the number has a 4.5rem column, and the mark drops under it.
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular", className)}>
      <span className="whitespace-nowrap">№ {String(no).padStart(3, "0")}</span>
      {draft && <DraftMark locale={locale} />}
    </span>
  );
}

/** A note to the author, shown only on their own machine, in the language of the page it is on. */
export function DraftMark({ locale, className }: { locale?: Locale; className?: string }) {
  return (
    <span data-testid="draft-mark" className={cn("inline-block rounded-sm border border-signal-2 bg-signal-2/10 px-1 py-px font-mono text-[0.625rem] leading-tight font-semibold whitespace-nowrap text-signal-2", className)}>
      {locale === "en" ? "DRAFT" : "草稿"}
    </span>
  );
}

export function TagLink({ tag, locale, className }: { tag: string; locale: Locale; className?: string }) {
  return (
    <Link
      href={`/${locale}/tags/${tag}`}
      className={cn(
        "rounded-sm border border-border px-1.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-signal hover:text-signal",
        className,
      )}
    >
      {tag}
    </Link>
  );
}

export function InteractiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-signal">
      <span className="size-1.5 rounded-full bg-signal motion-safe:animate-pulse" aria-hidden />
      {label}
    </span>
  );
}
