import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { KernelMark } from "./kernel-mark";
import { LocaleSwitch } from "./locale-switch";
import { ThemeToggle } from "./theme-toggle";

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <KernelMark className="size-4" />
            <span className="font-mono text-sm">{site.name}</span>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">{t.footer.builtWith}</p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Footer">
            <Link href={`/${locale}/posts`} className="hover:text-signal">{t.nav.posts}</Link>
            <Link href={`/${locale}/tags`} className="hover:text-signal">{t.nav.tags}</Link>
            <a href={`/${locale}/feed.xml`} className="hover:text-signal">{t.footer.rss}</a>
            <a href={site.github} rel="me noreferrer" target="_blank" className="hover:text-signal">GitHub</a>
            <a href={site.repo} rel="noreferrer" target="_blank" className="hover:text-signal">{t.footer.source}</a>
          </nav>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="label">{t.locale.label}</span>
              <LocaleSwitch locale={locale} label={t.locale.switch} />
            </div>
            <div className="flex items-center gap-1">
              <span className="label">{t.theme.label}</span>
              <ThemeToggle label={t.theme.toggle} />
            </div>
          </div>
          <p className="label">© {year} {site.author}</p>
        </div>
      </div>
    </footer>
  );
}
