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
  reporter: "html",
  use: {
    baseURL: "http://localhost:4222",
    serviceWorkers: "block",
    viewport: null,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    channel: process.env.CI ? "chrome" : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: {
        channel: process.env.CI ? "chrome" : undefined,
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
