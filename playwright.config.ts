import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a production build (`next start`) using the
 * local Supabase stack and the local filesystem storage adapter, so no cloud
 * credentials are needed. Prerequisites: `npm run db:start`, `npm run env:local`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
    locale: "pt-PT",
    permissions: ["microphone"],
    launchOptions: {
      // Synthetic microphone so the MediaRecorder flow can be exercised.
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: ".data/e2e-storage",
      RATE_LIMIT_ENABLED: "false",
    },
  },
});
