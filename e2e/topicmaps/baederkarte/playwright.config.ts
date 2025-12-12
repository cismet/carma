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
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-test-id",
  },
  projects: [
    {
      name: "chrome",
      use: {
        channel: process.env.PW_CHANNEL || undefined,
      },
    },
  ],
  webServer: {
    command: "npx nx serve baederkarte --port=4222",
    url: "http://localhost:4222",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
