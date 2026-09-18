import { Menu } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Navbar, NavbarLeft, NavbarRight } from "@/components/ui/navbar";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SearchEntry } from "@/lib/content/posts";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { KernelMark } from "./kernel-mark";
import { NavLink } from "./nav-link";
import { Search } from "./search";

interface Props {
  locale: Locale;
  nav: Dictionary["nav"];
  search: Dictionary["search"];
  searchIndex: SearchEntry[];
  tags: string[];
}

export function SiteHeader({ locale, nav, search, searchIndex, tags }: Props) {
  const links = [
    { href: `/${locale}/posts`, label: nav.posts },
    { href: `/${locale}/tags`, label: nav.tags },
  ];

  return (
    <header className="sticky top-0 z-40 -mb-4 pb-4">
      <div className="fade-bottom absolute inset-0 -z-10 bg-background/70 backdrop-blur-lg" aria-hidden />
      <Navbar className="mx-auto h-14 w-full max-w-7xl gap-3 px-5 py-0 sm:px-8">
        <NavbarLeft className="gap-3">
        <Link href={`/${locale}`} className="mr-2 flex items-center gap-2.5" aria-label={`${site.name} — ${nav.home}`}>
          <KernelMark className="size-4" />
          <span className="font-mono text-sm font-medium tracking-tight">{site.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label={nav.menu}>
          {links.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        </NavbarLeft>
        <NavbarRight className="gap-2">
          <Search locale={locale} index={searchIndex} tags={tags} t={search} />
          <Sheet>
            <SheetTrigger
              className={buttonVariants({ variant: "ghost", size: "icon", className: "md:hidden" })}
              aria-label={nav.menu}
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{site.name}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col px-4" aria-label={nav.menu}>
                {links.map((l) => (
                  <SheetClose
                    key={l.href}
                    render={<Link href={l.href} />}
                    className="border-b border-rule py-3 text-left text-base"
                  >
                    {l.label}
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </NavbarRight>
      </Navbar>
    </header>
  );
}
