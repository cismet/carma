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
    baseURL: "http://localhost:4111",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 15_000, // Reduce navigation timeout
    actionTimeout: 10_000, // Add action timeout
  },
  projects: [
    {
      name: "chrome",
      use: {
        // Use PW_CHANNEL to select system Chrome; otherwise bundled Chromium
        channel: process.env.PW_CHANNEL || undefined,
      },
    },
  ],
  webServer: {
    command: "npx nx serve e-auto-ladestation --port=4111",
    url: "http://localhost:4111",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
