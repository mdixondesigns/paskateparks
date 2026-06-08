import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    // Phase 7 plan-eng-review CMT-6 (Codex C8): CI runs against the production
    // bundle so the dynamic-import + ssr:false path on /map/ exercises the
    // chunked, minified build — not dev mode. Local stays on `pnpm dev` for
    // hot-reload iteration speed.
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    // Build + start takes ~30-40s on this project; raise the timeout in CI.
    timeout: process.env.CI ? 240_000 : 120_000,
  },
  projects: [
    // P0 use case (parent on Android in parking lot): test mobile first.
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
