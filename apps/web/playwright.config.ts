import { defineConfig, devices } from "@playwright/test";
import { loadE2EEnv } from "./e2e/helpers/env";

// Load local .env files (apps/web/.env.local, apps/api/.env) for local runs. In CI the workflow
// injects the real env, which always wins (loadE2EEnv never overrides an already-set var).
loadE2EEnv();

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// Chromium only. Servers (api :4000 + web :3000) are booted outside Playwright (locally by hand,
// in CI by the workflow before `playwright test`). Generous timeouts tolerate a cold `next dev`
// compile on first navigation in CI.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
