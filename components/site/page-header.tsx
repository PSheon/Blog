import type { ReactNode } from "react";

export function PageHeader({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <header className="pt-12 pb-10 lg:pt-16">
      <h1 className="font-heading text-[clamp(2.25rem,5vw,3.5rem)] leading-tight font-semibold tracking-tight">{title}</h1>
      {lead && <p className="mt-3 font-serif text-lg text-muted-foreground">{lead}</p>}
      {children}
    </header>
  );
}
