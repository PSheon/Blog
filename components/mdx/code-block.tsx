"use client";

import { Check, Copy } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";
import { useLocaleLabels } from "@/components/lab/use-locale-labels";

export function CodeBlock(props: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const t = useLocaleLabels({ copy: "複製程式碼", copied: "已複製" }, { copy: "Copy code", copied: "Copied" });

  const copy = async () => {
    await navigator.clipboard.writeText(ref.current?.textContent ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="group/code relative">
      <pre ref={ref} {...props} />
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t.copied : t.copy}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md border border-border bg-background/80 text-muted-foreground transition-opacity before:absolute before:-inset-2 hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/code:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-signal" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
