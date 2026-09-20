import createMDX from "@next/mdx";

/*
 * Content-Security-Policy. What it can honestly promise here:
 *  - script-src needs 'unsafe-inline' (pages are prerendered, so there are no nonces: next-themes' script, JSON-LD and
 *    Next's own data pushes are inline) and 'unsafe-eval' (MuJoCo's Emscripten glue builds functions with
 *    `new Function`; per-route would not do, a client-side navigation keeps the first document's policy). So it does
 *    not stop an injected script. There is no user input on this site to inject one through.
 *  - What it does do: everything loads from this origin only, nothing can be framed elsewhere or post a form away,
 *    no plugins, no <base> hijack.
 * Production only: `next dev` needs eval and a websocket, and a Vercel preview loads its toolbar from vercel.live.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'", // KaTeX and React style props
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");
const enforceCsp = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  poweredByHeader: false,
  // app/global-not-found.tsx: the 404 for URLs that match no route. Needed because the root layout sits under [locale].
  experimental: { globalNotFound: true },
  // Where a feed reader looks first. The feeds are per language; the original one answers.
  async redirects() {
    return ["/feed.xml", "/rss.xml", "/feed", "/rss", "/atom.xml"].map((source) => ({ source, destination: "/zh/feed.xml", permanent: false }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // No window we open, and none that opens us, gets a handle on this page.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(enforceCsp ? [{ key: "Content-Security-Policy", value: CSP }] : []),
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
