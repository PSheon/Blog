import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";
import { Callout } from "@/components/mdx/callout";
import { CodeBlock } from "@/components/mdx/code-block";
import { Figure } from "@/components/mdx/figure";
import { Sidenote } from "@/components/mdx/sidenote";

function heading(Tag: "h2" | "h3" | "h4") {
  return function Heading({ id, children, ...rest }: ComponentProps<"h2">) {
    return (
      <Tag id={id} {...rest}>
        {id ? (
          <a href={`#${id}`} className="heading-anchor">
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
  return <a href={href} target="_blank" rel="noreferrer" {...rest} />;
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
  Sidenote,
  Callout,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
