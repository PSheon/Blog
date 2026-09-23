"use client";

import { CornerDownLeft, FileText, Hash, TextSearch, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { type SearchDoc, type SearchHit, search } from "@/lib/search";
import { EntryNo } from "./post-meta";

interface Props {
  locale: Locale;
  tags: string[];
  t: Dictionary["search"];
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Render a snippet with its matched ranges wrapped in <mark>. */
function Highlighted({ hit }: { hit: SearchHit }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  hit.ranges.forEach(([from, to], i) => {
    if (from < cursor) return;
    parts.push(<Fragment key={`t${i}`}>{hit.snippet.slice(cursor, from)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className="rounded-[2px] bg-signal/20 px-0.5 text-foreground">
        {hit.snippet.slice(from, to)}
      </mark>,
    );
    cursor = to;
  });
  parts.push(<Fragment key="end">{hit.snippet.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}

/**
 * The search dialog itself. It is a separate module so that cmdk, the dialog primitives and the
 * ranking code are downloaded the first time someone opens search, not on every page view.
 */
export default function SearchPalette({ locale, tags, t, open, onOpenChange }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/${locale}/search.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: SearchDoc[]) => !cancelled && setDocs(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [locale, attempt]);

  const hits = useMemo(() => (docs ? search(docs, query) : []), [docs, query]);
  const tagHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tags.filter((tag) => tag.includes(q)).slice(0, 5) : tags;
  }, [tags, query]);
  const searching = query.trim().length > 0;

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>{t.open}</DialogTitle>
        <DialogDescription>{t.placeholder}</DialogDescription>
      </DialogHeader>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] w-[calc(100vw-1.5rem)] max-w-2xl translate-y-0 gap-0 overflow-hidden rounded-md! border-border bg-popover/95 p-0 backdrop-blur-xl sm:top-[16vh] sm:max-w-2xl"
      >
        {/* We rank results ourselves (lib/search.ts); cmdk only handles keyboard navigation. */}
        <Command shouldFilter={false} loop label={t.open} className="bg-transparent">
          {/* A phone has no Esc key, and the hints below are hidden there, so the way out has to be visible. */}
          <div className="flex items-center gap-1 pr-1.5">
            <div className="min-w-0 flex-1">
              <CommandInput value={query} onValueChange={setQuery} placeholder={t.placeholder} className="h-12 text-base" />
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t.close}
              data-testid="search-close"
              className="tap grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:pointer-fine:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <CommandList className="max-h-[min(60vh,28rem)] scroll-py-2 p-1.5">
            {searching && docs && hits.length === 0 && tagHits.length === 0 && (
              // (not cmdk's Empty: that hides itself while the list has items, and the latest articles below are items)
              <p className="px-3 pt-8 pb-4 text-center text-sm text-muted-foreground">{t.empty.replace("{q}", query.trim())}</p>
            )}
            {/* Nothing found is not a dead end: the three newest articles are one key away. */}
            {searching && docs && hits.length === 0 && tagHits.length === 0 && (
              <CommandGroup heading={t.latest}>
                {docs.slice(0, 3).map((doc) => (
                  <CommandItem key={doc.slug} value={`latest:${doc.slug}`} onSelect={() => go(`/${locale}/posts/${doc.slug}`)} className="gap-3 rounded-md px-2.5 py-2">
                    <FileText className="text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    <EntryNo no={doc.no} className="shrink-0 text-xs text-signal" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!docs && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">
                <p>{failed ? t.failed : t.loading}</p>
                {failed && <button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }} className="tap mt-3 cursor-pointer rounded-md border border-input px-3 py-1.5 text-foreground hover:bg-muted" data-testid="search-retry">{t.retry}</button>}
              </div>
            )}

            {searching && hits.length > 0 && (
              <CommandGroup heading={hits.length === 1 ? t.resultsOne : t.results.replace("{n}", String(hits.length))}>
                {hits.map((hit) => (
                  <CommandItem
                    key={`${hit.slug}#${hit.sectionId}`}
                    value={`${hit.slug}#${hit.sectionId}`}
                    onSelect={() => go(`/${locale}/posts/${hit.slug}${hit.sectionId ? `#${hit.sectionId}` : ""}`)}
                    className="items-start gap-3 rounded-md px-2.5 py-2.5"
                  >
                    {hit.sectionId ? (
                      <TextSearch className="mt-0.5 text-muted-foreground" aria-hidden />
                    ) : (
                      <FileText className="mt-0.5 text-muted-foreground" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className={hit.heading ? "max-w-[65%] shrink-0 truncate font-medium" : "truncate font-medium"}>
                          {hit.heading || hit.title}
                        </span>
                        {hit.heading && <span className="min-w-0 truncate text-xs text-muted-foreground">{hit.title}</span>}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
                        <Highlighted hit={hit} />
                      </p>
                    </div>
                    <EntryNo no={hit.no} className="mt-0.5 shrink-0 text-xs text-signal" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!searching && docs && (
              <CommandGroup heading={t.posts}>
                {docs.map((doc) => (
                  <CommandItem key={doc.slug} value={doc.slug} onSelect={() => go(`/${locale}/posts/${doc.slug}`)} className="gap-3 rounded-md px-2.5 py-2">
                    <FileText className="text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    <EntryNo no={doc.no} className="shrink-0 text-xs text-signal" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {tagHits.length > 0 && (
              <CommandGroup heading={t.tags}>
                {tagHits.map((tag) => (
                  <CommandItem key={tag} value={`tag:${tag}`} onSelect={() => go(`/${locale}/tags/${tag}`)} className="gap-3 rounded-md px-2.5 py-2">
                    <Hash className="text-muted-foreground" aria-hidden />
                    <span className="font-mono text-sm">{tag}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          {/* How many there are now, said once per change to a screen reader; the group heading shows it to the eye. */}
          <p className="sr-only" role="status" aria-live="polite">{searching && docs ? (hits.length === 1 ? t.resultsOne : t.results.replace("{n}", String(hits.length))) : ""}</p>
          {/* Keyboard hints for keyboards only: on a 390-wide phone these three cost 40 px of list, and one of them
              names a key the device does not have. */}
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3.5 py-2 font-mono text-xs text-muted-foreground sm:pointer-fine:flex">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-sm border border-border px-1">↑</kbd>
              <kbd className="rounded-sm border border-border px-1">↓</kbd>
              {t.navigate}
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="grid h-4 place-items-center rounded-sm border border-border px-1">
                <CornerDownLeft className="size-2.5" aria-hidden />
              </kbd>
              {t.select}
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-sm border border-border px-1">/</kbd>
              {t.open}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <kbd className="rounded-sm border border-border px-1">esc</kbd>
              {t.close}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
