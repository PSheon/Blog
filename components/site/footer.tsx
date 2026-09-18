import Link from "next/link";
import type { ReactNode } from "react";
import { Footer, FooterBottom, FooterColumn, FooterContent } from "@/components/ui/footer";
import type { Dictionary, Locale } from "@/lib/i18n";
import { site } from "@/lib/site";
import { KernelMark } from "./kernel-mark";
import { LocaleSwitch } from "./locale-switch";
import { ThemeToggle } from "./theme-toggle";

const linkClass = "text-sm text-muted-foreground transition-colors hover:text-foreground";

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FooterColumn className="gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </FooterColumn>
  );
}

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 border-t border-rule">
      <Footer className="mx-auto w-full max-w-7xl bg-transparent px-5 pt-12 pb-6 sm:px-8">
        <FooterContent className="sm:grid-cols-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <FooterColumn className="col-span-2 gap-3 sm:col-span-3 md:col-span-1">
            <Link href={`/${locale}`} className="flex items-center gap-2.5">
              <KernelMark className="size-4" />
              <span className="font-mono text-sm">{site.name}</span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t.footer.about}</p>
          </FooterColumn>

          <Column title={t.footer.browse}>
            <Link href={`/${locale}/posts`} className={linkClass}>{t.nav.posts}</Link>
            <Link href={`/${locale}/tags`} className={linkClass}>{t.nav.tags}</Link>
            <a href={`/${locale}/feed.xml`} className={linkClass}>{t.footer.rss}</a>
          </Column>

          <Column title={t.footer.elsewhere}>
            <a href={site.github} rel="me noreferrer" target="_blank" className={linkClass}>GitHub</a>
            <a href={site.repo} rel="noreferrer" target="_blank" className={linkClass}>{t.footer.source}</a>
          </Column>

          <Column title={t.footer.preferences}>
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <span className="w-10 text-sm text-muted-foreground">{t.locale.label}</span>
              <LocaleSwitch locale={locale} label={t.locale.switch} />
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <span className="w-10 text-sm text-muted-foreground">{t.theme.label}</span>
              <ThemeToggle t={t.theme} />
            </div>
          </Column>
        </FooterContent>

        <FooterBottom className="mt-10 items-start sm:items-center">
          <span>© {year} {site.author}</span>
          <span>{t.footer.builtWith}</span>
        </FooterBottom>
      </Footer>
    </footer>
  );
}
