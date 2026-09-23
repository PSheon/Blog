"use client";

import { Check, Copy } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";
import { useLocaleLabels } from "@/components/lab/use-locale-labels";

export function CodeBlock(props: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const t = useLocaleLabels(
    { copy: "複製程式碼", copied: "已複製", failed: "複製失敗，請自己選取" },
    { copy: "Copy code", copied: "Copied", failed: "Could not copy — select it yourself" },
  );

  /*
   * The clipboard can refuse: an insecure origin has no `navigator.clipboard` at all, and a browser may deny the
   * permission. Unhandled, that was an uncaught rejection and a reader left pressing a button that did nothing.
   * Either way the outcome is spoken as well as drawn — the icon alone says nothing to a screen reader.
   */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? "");
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2400);
  };

  const label = state === "copied" ? t.copied : state === "failed" ? t.failed : t.copy;

  return (
    <div className="group/code relative">
      <pre ref={ref} {...props} />
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md border border-border bg-background/80 text-muted-foreground transition-opacity before:absolute before:-inset-[9px] hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/code:opacity-100"
      >
        {state === "copied" ? <Check className="size-3.5 text-signal" /> : <Copy className={state === "failed" ? "size-3.5 text-signal-2" : "size-3.5"} />}
      </button>
      <p className="sr-only" role="status" aria-live="polite">{state === "idle" ? "" : label}</p>
    </div>
  );
}
