import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite reads the `@/` alias from tsconfig itself; the vite-tsconfig-paths plugin is no longer needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
