import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite reads the `@/` alias from tsconfig itself; the vite-tsconfig-paths plugin is no longer needed.
  // "server-only" throws when it is imported outside a React server build, which is what a test is. The guard is for
  // the bundler; the tests want the functions.
  resolve: { tsconfigPaths: true, alias: { "server-only": new URL("./lib/shims/empty.ts", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
