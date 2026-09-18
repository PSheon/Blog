import { Lightbulb, StickyNote, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const kinds = {
  note: { Icon: StickyNote, tone: "border-rule", icon: "text-muted-foreground" },
  insight: { Icon: Lightbulb, tone: "border-signal/50", icon: "text-signal" },
  warn: { Icon: TriangleAlert, tone: "border-signal-2/60", icon: "text-signal-2" },
} as const;

interface Props {
  type?: keyof typeof kinds;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = "note", title, children }: Props) {
  const { Icon, tone, icon } = kinds[type];
  return (
    <aside className={cn("my-8 flex gap-3.5 rounded-md border bg-panel p-4 font-sans text-[0.9688rem] leading-relaxed", tone)}>
      <Icon className={cn("mt-1 size-4 shrink-0", icon)} aria-hidden />
      <div className="min-w-0 space-y-2 [&_p]:m-0">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </aside>
  );
}
