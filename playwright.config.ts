import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/support/database";

const baseURL = 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 3100',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      DIRECT_URL: testDatabaseUrl(),
      AUTH_SECRET: 'local-test-only-secret-do-not-use-in-production',
      AUTH_TRUST_HOST: 'true',
      AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      TZ: 'Asia/Manila',
    },
  },
});
