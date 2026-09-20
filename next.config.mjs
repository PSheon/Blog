import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  poweredByHeader: false,
  // app/global-not-found.tsx: the 404 for URLs that match no route. Needed because the root layout sits under [locale].
  experimental: { globalNotFound: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Nothing here needs these (the camera stays available to our own pages for a future instrument); deny them to anything embedded.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
        ],
      },
      // The worker script must never be served stale: a cached sw.js is how a bad worker becomes permanent.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      // Requested as /lite3/…?v=N (ASSET_VERSION in the article's sim.ts), so a year is safe.
      { source: "/lite3/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  turbopack: {
    // @mujoco/mujoco's Emscripten loader does `await import("module")` inside its Node-only branch.
    resolveAlias: { module: { browser: "./lib/shims/empty.ts" } },
  },
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
