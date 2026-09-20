"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { KernelMark } from "./kernel-mark";
import { InstallButton } from "./install";
import { LocaleSwitch } from "./locale-switch";
import { ThemeToggle } from "./theme-toggle";

export interface DrawerProps {
  locale: Locale;
  links: { href: string; label: string }[];
  /** Only what the drawer prints: everything here is serialised into the page for the client. */
  t: Pick<Dictionary, "nav" | "locale" | "theme" | "install"> & { footer: Pick<Dictionary["footer"], "preferences"> };
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** The drawer's contents, split from its trigger so the sheet primitives load on first use. */
export default function MobileDrawer({ locale, links, t, open, onOpenChange }: DrawerProps) {
  const pathname = usePathname();
  // The sheet always mounts closed and opens a frame later. This component is fetched on first use and used to mount
  // with `open` already true: the panel then has no "before" state to move from and just appears, so the very first
  // opening, the one everybody sees, had no motion at all.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(open));
    return () => cancelAnimationFrame(id);
  }, [open]);
  // Land focus on the title, not the first control: a focus ring on every open is noise.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const home = `/${locale}`;
  const all = [{ href: home, label: t.nav.home }, ...links];

  return (
    <Sheet open={shown} onOpenChange={onOpenChange}>
      <SheetContent side="left" initialFocus={titleRef} className="w-[19rem] max-w-[85vw] gap-0 border-rule bg-background/95 p-0 backdrop-blur-xl duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=left]:data-starting-style:-translate-x-full data-[side=left]:data-ending-style:-translate-x-full data-starting-style:opacity-100 data-ending-style:opacity-100 motion-reduce:duration-0">
        <SheetHeader className="border-b border-rule px-5 py-4">
          <SheetTitle ref={titleRef} tabIndex={-1} className="flex items-center gap-2.5 font-mono text-sm font-medium outline-none">
            <KernelMark className="size-4" />
            {site.name}
          </SheetTitle>
          <SheetDescription className="sr-only">{t.nav.menu}</SheetDescription>
        </SheetHeader>

        <nav className="flex flex-col gap-0.5 px-2 py-4" aria-label={t.nav.menu}>
          {all.map((l, i) => {
            const active = l.href === home ? pathname === home : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => onOpenChange(false)}
                aria-current={active ? "page" : undefined}
                style={{ "--i": i } as React.CSSProperties}
                className={cn(
                  "drawer-row flex items-center gap-3 rounded-md px-3 py-2.5 font-heading text-lg transition-colors",
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-[1px]", active ? "bg-signal" : "bg-transparent")} aria-hidden />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="drawer-row mt-auto grid gap-3 border-t border-rule px-5 py-5" style={{ "--i": all.length + 1 } as React.CSSProperties}>
          <p className="text-sm font-medium">{t.footer.preferences}</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.locale.label}</span>
            <LocaleSwitch locale={locale} label={t.locale.switch} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.theme.label}</span>
            <ThemeToggle t={t.theme} />
          </div>
          <InstallButton label={t.install.action} className="justify-self-start" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
