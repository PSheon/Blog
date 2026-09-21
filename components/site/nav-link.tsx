"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "tap rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active ? "text-foreground underline decoration-signal decoration-2 underline-offset-8" : "text-muted-foreground hover:text-foreground", // the underline: the two greys alone are 1.9:1 apart
      )}
    >
      {children}
    </Link>
  );
}
