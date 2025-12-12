import { defineConfig } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./src/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:4222",
    serviceWorkers: "block",
    viewport: null,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // navigationTimeout: 15_000,
    // actionTimeout: 10_000,
    testIdAttribute: "data-test-id",
  },
  projects: [
    {
      name: "chrome",
      use: {
        // navigationTimeout: 15_000,
        // actionTimeout: 10_000,
        // Use PW_CHANNEL to select system Chrome; otherwise bundled Chromium
        channel: process.env.PW_CHANNEL || undefined,
      },
    },
  ],
  webServer: {
    command: "npx nx serve potenzialflaechen-online --port=4222",
    url: "http://localhost:4222",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
