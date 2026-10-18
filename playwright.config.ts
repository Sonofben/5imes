import { defineConfig } from "@playwright/test";

/**
 * End-to-end smoke tests.
 *
 * - e2e/public.spec.ts runs against a local production build (CI starts it) and needs no accounts.
 * - e2e/flows.spec.ts signs in as real test users and runs only when E2E_BASE_URL and the
 *   E2E_* account variables are set — point it at staging, never at customers' data.
 */
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3311";

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "node .next/standalone/server.js",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: "3311", HOSTNAME: "127.0.0.1" },
  },
});
