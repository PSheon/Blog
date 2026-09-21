"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon },
  { value: "system", Icon: Monitor },
] as const;

const noop = () => () => {};

/** Light / dark / follow-the-system, as one segmented control. */
export function ThemeToggle({ t }: { t: Dictionary["theme"] }) {
  const { theme, setTheme } = useTheme();
  // The stored choice is only known in the browser; render nothing as "pressed" until then.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div role="group" aria-label={t.toggle} className="flex items-center rounded-md border border-border p-0.5">
      {options.map(({ value, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={t[value]}
            title={t[value]}
            onClick={() => setTheme(value)}
            className={cn(
              "tap grid h-6 w-7 place-items-center rounded-[5px] transition-colors",
              active ? "bg-accent text-foreground ring-1 ring-foreground/45 ring-inset" : "text-muted-foreground hover:text-foreground", // the ring: the fill alone is 1.1:1 against its neighbours
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
