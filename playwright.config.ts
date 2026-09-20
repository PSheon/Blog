import { defineConfig, devices } from "@playwright/test";

// Several worktrees share this machine; E2E_PORT lets two suites run at once.
const PORT = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, locale: "zh-TW" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/zh`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
