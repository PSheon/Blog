"use client";

import { Search as SearchIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ChunkLoading } from "./chunk-loading";
import type { Dictionary, Locale } from "@/lib/i18n";

const OPEN_EVENT = "notebook:open-search";

// cmdk + the dialog primitives are ~60 KB gzipped: fetch them when search is first used.
const loadPalette = () => import("./search-palette");
const SearchPalette = dynamic(loadPalette, { ssr: false, loading: () => <ChunkLoading fixed /> });

/** ⌘K on Apple's keyboards, Ctrl K everywhere else. The server cannot know, so it says ⌘K and the client corrects it. */
const noop = () => () => {};
function useShortcutLabel(): string {
  return useSyncExternalStore(noop, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"), () => "⌘K");
}

/** Open the search palette from anywhere (the phone header has its own search button). */
export function openSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** The phone header's search button. The palette itself is mounted once, in the desktop navbar. */
export function SearchIconButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={openSearch}
      onPointerEnter={() => void loadPalette()}
      aria-label={label}
      className="tap grid size-8 cursor-pointer place-items-center justify-self-end rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <SearchIcon className="size-[1.125rem]" aria-hidden />
    </button>
  );
}

interface Props {
  locale: Locale;
  tags: string[];
  t: Dictionary["search"];
}

export function Search({ locale, tags, t }: Props) {
  const [open, setOpen] = useState(false), shortcut = useShortcutLabel();
  // Once true the palette stays mounted, so closing and reopening keeps its loaded index.
  const [wanted, setWanted] = useState(false);

  const show = useCallback(() => {
    setWanted(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Keyboard users never hover the button: start fetching as soon as ⌘/Ctrl goes down, before the K.
      if (e.key === "Meta" || e.key === "Control") void loadPalette();
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, select, [contenteditable]");
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setWanted(true);
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [show]);

  return (
    <>
      <button
        type="button"
        onClick={show}
        // Warm the chunk as soon as the reader reaches for search, so the click feels instant.
        onPointerEnter={() => void loadPalette()}
        onFocus={() => void loadPalette()}
        aria-keyshortcuts="Meta+K Control+K /"
        className="glass-2 hidden h-8 w-52 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground md:flex"
      >
        <SearchIcon className="size-4" aria-hidden />
        <span>{t.open}</span>
        <kbd suppressHydrationWarning className="ml-auto rounded-sm border border-border px-1 font-mono text-xs leading-4">{shortcut}</kbd>
      </button>
      {wanted && <SearchPalette locale={locale} tags={tags} t={t} open={open} onOpenChange={setOpen} />}
    </>
  );
}
