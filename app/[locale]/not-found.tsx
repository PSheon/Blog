import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// not-found receives no params, so it speaks both languages.
export default function NotFound() {
  return (
    <div className="mx-auto grid w-full max-w-7xl place-items-start gap-5 px-5 py-24 sm:px-8">
      <p className="font-mono text-sm text-signal">404</p>
      <h1 className="font-heading text-4xl font-semibold"><span lang="zh-Hant-TW">找不到這一頁</span> / <span lang="en">Page not found</span></h1>
      <p className="font-serif text-lg text-muted-foreground">
        <span lang="zh-Hant-TW">這一頁可能被移走了，或從來不存在。</span> <span lang="en">It may have moved, or never existed.</span>
      </p>
      <div className="flex gap-3">
        <Link href="/zh" className={buttonVariants()}>回到首頁</Link>
        <Link href="/en" lang="en" className={buttonVariants({ variant: "outline" })}>Back home</Link>
      </div>
    </div>
  );
}
