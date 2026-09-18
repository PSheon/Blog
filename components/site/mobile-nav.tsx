"use client";

import { Menu, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { KernelMark } from "./kernel-mark";
import { LocaleSwitch } from "./locale-switch";
import { openSearch } from "./search";
import { ThemeToggle } from "./theme-toggle";

interface Props {
  locale: Locale;
  links: { href: string; label: string }[];
  t: Pick<Dictionary, "nav" | "search" | "locale" | "theme" | "footer">;
}

/** The phone's navigation drawer: search, the site's sections, and the reader's preferences. */
export function MobileNav({ locale, links, t }: Props) {
  const [open, setOpen] = useState(false);
  // Land focus on the title, not the first control: the focus ring on the search button on every open is noise.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pathname = usePathname();
  const home = `/${locale}`;
  const all = [{ href: home, label: t.nav.home }, ...links];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "cursor-pointer")}
        aria-label={t.nav.menu}
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" initialFocus={titleRef} className="w-[19rem] max-w-[85vw] gap-0 border-rule bg-background/95 p-0 backdrop-blur-xl">
        <SheetHeader className="border-b border-rule px-5 py-4">
          <SheetTitle ref={titleRef} tabIndex={-1} className="flex items-center gap-2.5 font-mono text-sm font-medium outline-none">
            <KernelMark className="size-4" />
            {site.name}
          </SheetTitle>
          <SheetDescription className="sr-only">{t.nav.menu}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openSearch();
            }}
            className="glass-2 flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <SearchIcon className="size-4" aria-hidden />
            {t.search.open}
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 py-4" aria-label={t.nav.menu}>
          {all.map((l) => {
            const active = l.href === home ? pathname === home : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 font-heading text-lg transition-colors",
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-[1px]", active ? "bg-signal" : "bg-transparent")} aria-hidden />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto grid gap-3 border-t border-rule px-5 py-5">
          <p className="text-sm font-medium">{t.footer.preferences}</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.locale.label}</span>
            <LocaleSwitch locale={locale} label={t.locale.switch} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.theme.label}</span>
            <ThemeToggle t={t.theme} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
