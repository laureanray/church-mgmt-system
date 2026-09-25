import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/support/database";
import {
  TEST_ANON_KEY,
  TEST_SERVICE_ROLE_KEY,
  TEST_SUPABASE_URL,
} from "./tests/support/auth";

const baseURL = 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The people using this are in Manila; the server below is not.
    timezoneId: 'Asia/Manila',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run build && bunx next start --hostname 127.0.0.1 --port 3100',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      DIRECT_URL: testDatabaseUrl(),
      NEXT_PUBLIC_SUPABASE_URL: TEST_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: TEST_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: TEST_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_APP_URL: baseURL,
      // UTC, as on Vercel. With the server and browser in the same zone, a time
      // computed in the process's zone looks right on both, which is how
      // services stored eight hours late went unnoticed.
      TZ: 'UTC',
    },
  },
});
