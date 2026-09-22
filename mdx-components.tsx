import { ArrowUpRight } from "lucide-react";
import { Localised } from "@/components/lab/localised";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";
import { Instrument } from "@/components/lab/instrument";
import { Callout } from "@/components/mdx/callout";
import { CodeBlock } from "@/components/mdx/code-block";
import { Figure } from "@/components/mdx/figure";
import { Sidenote } from "@/components/mdx/sidenote";

function heading(Tag: "h2" | "h3" | "h4") {
  return function Heading({ id, children, ...rest }: ComponentProps<"h2">) {
    return (
      <Tag id={id} {...rest}>
        {id ? (
          <a href={`#${id}`} className="heading-anchor tap">
            {children}
          </a>
        ) : (
          children
        )}
      </Tag>
    );
  };
}

function Anchor({ href = "", ...rest }: ComponentProps<"a">) {
  if (href.startsWith("/")) return <Link href={href} {...rest} />;
  if (href.startsWith("#")) return <a href={href} {...rest} />;
  // Leaves the site in a new tab: say so, to the eye (the arrow) and to a screen reader.
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>
      {rest.children}
      <ArrowUpRight aria-hidden className="ml-px inline size-[0.8em] align-baseline opacity-70" />
      <span className="sr-only"><Localised zh="（開新分頁）" en=" (opens in a new tab)" /></span>
    </a>
  );
}

const components: MDXComponents = {
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  a: Anchor,
  pre: CodeBlock,
  table: (props) => (
    <div className="table-scroll">
      <table {...props} />
    </div>
  ),
  // Available in every article without an import.
  Figure,
  Instrument,
  Sidenote,
  Callout,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
