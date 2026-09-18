import Link from "next/link";
import { Navbar, NavbarLeft, NavbarRight } from "@/components/ui/navbar";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { KernelMark } from "./kernel-mark";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { Search, SearchIconButton } from "./search";

interface Props {
  locale: Locale;
  t: Pick<Dictionary, "nav" | "search" | "locale" | "theme" | "footer">;
  tags: string[];
}

export function SiteHeader({ locale, t, tags }: Props) {
  const links = [
    { href: `/${locale}/posts`, label: t.nav.posts },
    { href: `/${locale}/tags`, label: t.nav.tags },
  ];
  const logo = (
    <Link href={`/${locale}`} className="flex items-center gap-2.5" aria-label={`${site.name} — ${t.nav.home}`}>
      <KernelMark className="size-4" />
      <span className="font-mono text-sm font-medium tracking-tight">{site.name}</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 -mb-4 pb-4">
      <div className="fade-bottom absolute inset-0 -z-10 bg-background/70 backdrop-blur-lg" aria-hidden />

      {/* Phone: menu on the left, the mark centred, search on the right. Equal side columns keep the mark centred. */}
      <div className="grid h-14 grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 md:hidden">
        <MobileNav locale={locale} links={links} t={t} />
        <div className="justify-self-center">{logo}</div>
        <SearchIconButton label={t.search.open} />
      </div>

      <Navbar aria-label={t.nav.menu} className="mx-auto hidden h-14 w-full max-w-7xl gap-3 px-5 py-0 sm:px-8 md:flex">
        <NavbarLeft className="gap-3">
          <span className="mr-2">{logo}</span>
          {/* Navbar is already the <nav> landmark. */}
          <div className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </div>
        </NavbarLeft>
        <NavbarRight className="gap-2">
          {/*
            Mounted once for both layouts. On a phone this navbar is display:none, but the palette's
            dialog is portalled to <body>, so the phone header's search button can still open it.
          */}
          <Search locale={locale} tags={tags} t={t.search} />
        </NavbarRight>
      </Navbar>
    </header>
  );
}
