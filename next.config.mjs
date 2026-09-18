import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

// Turbopack runs MDX in Rust-land: plugins are named by string and options must be JSON.
const withMDX = createMDX({
  options: {
    remarkPlugins: [
      "remark-frontmatter",
      ["remark-mdx-frontmatter", { name: "frontmatter" }],
      "remark-gfm",
      "remark-math",
    ],
    rehypePlugins: [
      "rehype-slug",
      "rehype-katex",
      [
        "rehype-pretty-code",
        {
          // Chosen for contrast on our panel colours: the dimmed/default GitHub themes fail WCAG AA for comments and keywords.
          theme: { dark: "github-dark", light: "github-light-high-contrast" },
          keepBackground: false,
          defaultLang: "plaintext",
        },
      ],
    ],
  },
});

export default withMDX(nextConfig);
