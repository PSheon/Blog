"use client";

import { FileText, Hash, Search as SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SearchEntry } from "@/lib/content/posts";
import type { Dictionary, Locale } from "@/lib/i18n";

interface Props {
  locale: Locale;
  index: SearchEntry[];
  tags: string[];
  t: Dictionary["search"];
}

export function Search({ locale, index, tags, t }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-44 sm:px-2.5"
      >
        <SearchIcon className="size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">{t.open}</span>
        <kbd className="ml-auto hidden font-mono text-[11px] sm:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t.open} description={t.placeholder}>
        <Command>
        <CommandInput placeholder={t.placeholder} />
        <CommandList>
          <CommandEmpty>{t.empty}</CommandEmpty>
          <CommandGroup heading={t.posts}>
            {index.map((p) => (
              <CommandItem
                key={p.slug}
                value={p.slug}
                keywords={[p.title, p.description, ...p.tags, ...p.headings]}
                onSelect={() => go(`/${locale}/posts/${p.slug}`)}
              >
                <FileText aria-hidden />
                <div className="min-w-0">
                  <div className="truncate">{p.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading={t.tags}>
            {tags.map((tag) => (
              <CommandItem key={tag} value={`tag-${tag}`} keywords={[tag]} onSelect={() => go(`/${locale}/tags/${tag}`)}>
                <Hash aria-hidden />
                <span className="font-mono text-sm">{tag}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
