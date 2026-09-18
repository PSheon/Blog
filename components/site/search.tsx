"use client";

import { CornerDownLeft, FileText, Hash, Search as SearchIcon, TextSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { type SearchDoc, type SearchHit, search } from "@/lib/search";
import { EntryNo } from "./post-meta";

interface Props {
  locale: Locale;
  tags: string[];
  t: Dictionary["search"];
}

const OPEN_EVENT = "notebook:open-search";

/** Open the search palette from anywhere (the phone's drawer has its own search button). */
export function openSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
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

export function Search({ locale, tags, t }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);

  // The index is only worth downloading once someone reaches for search.
  const load = useCallback(() => {
    if (docs || loading.current) return;
    loading.current = true;
    setFailed(false);
    fetch(`/${locale}/search.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: SearchDoc[]) => setDocs(data))
      .catch(() => setFailed(true))
      .finally(() => (loading.current = false));
  }, [docs, locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, select, [contenteditable]");
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        load();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => {
      load();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [load]);

  const hits = useMemo(() => (docs ? search(docs, query) : []), [docs, query]);
  const tagHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tags.filter((tag) => tag.includes(q)).slice(0, 5) : tags;
  }, [tags, query]);
  const searching = query.trim().length > 0;

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          load();
          setOpen(true);
        }}
        onPointerEnter={load}
        onFocus={load}
        className="glass-2 hidden h-8 w-52 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground md:flex"
      >
        <SearchIcon className="size-4" aria-hidden />
        <span>{t.open}</span>
        <kbd className="ml-auto rounded-sm border border-border px-1 font-mono text-[10px] leading-4">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t.open}</DialogTitle>
          <DialogDescription>{t.placeholder}</DialogDescription>
        </DialogHeader>
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] w-[calc(100vw-1.5rem)] max-w-2xl translate-y-0 sm:max-w-2xl gap-0 overflow-hidden rounded-xl! border-border bg-popover/95 p-0 backdrop-blur-xl sm:top-[16vh]"
        >
          {/* We rank results ourselves (lib/search.ts); cmdk only handles keyboard navigation. */}
          <Command shouldFilter={false} loop className="bg-transparent">
            <CommandInput value={query} onValueChange={setQuery} placeholder={t.placeholder} className="h-12 text-base" />
            <CommandList className="max-h-[min(60vh,28rem)] scroll-py-2 p-1.5">
              {searching && docs && hits.length === 0 && tagHits.length === 0 && (
                <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
                  {t.empty.replace("{q}", query.trim())}
                </CommandEmpty>
              )}
              {!docs && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">
                  {failed ? t.failed : t.loading}
                </p>
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
                      <EntryNo no={hit.no} className="mt-0.5 shrink-0 text-[0.6875rem] text-signal" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!searching && docs && (
                <CommandGroup heading={t.posts}>
                  {docs.map((doc) => (
                    <CommandItem
                      key={doc.slug}
                      value={doc.slug}
                      onSelect={() => go(`/${locale}/posts/${doc.slug}`)}
                      className="gap-3 rounded-md px-2.5 py-2"
                    >
                      <FileText className="text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                      <EntryNo no={doc.no} className="shrink-0 text-[0.6875rem] text-signal" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {tagHits.length > 0 && (
                <CommandGroup heading={t.tags}>
                  {tagHits.map((tag) => (
                    <CommandItem
                      key={tag}
                      value={`tag:${tag}`}
                      onSelect={() => go(`/${locale}/tags/${tag}`)}
                      className="gap-3 rounded-md px-2.5 py-2"
                    >
                      <Hash className="text-muted-foreground" aria-hidden />
                      <span className="font-mono text-sm">{tag}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>

            <div className="flex items-center gap-4 border-t border-border px-3.5 py-2 font-mono text-[0.6875rem] text-muted-foreground">
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
              <span className="ml-auto flex items-center gap-1.5">
                <kbd className="rounded-sm border border-border px-1">esc</kbd>
                {t.close}
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
