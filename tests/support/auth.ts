import { createClient } from "@supabase/supabase-js";

/**
 * Auth settings for the E2E stack in compose.test.yml.
 *
 * These are the Supabase CLI's well-known local demo keys, signed with the
 * throwaway secret GoTrue is given there. They are identical on every machine
 * and grant nothing outside that container, so they are not credentials.
 */
export const TEST_SUPABASE_URL =
  process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54433";

export const TEST_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const TEST_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const TEST_PASSWORD = "test-password-123";

export function testAdminClient() {
  return createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The sign-in address for a seeded role, e.g. "e2e-admin@example.test". */
export function testEmail(role: string) {
  return `e2e-${role}@example.test`;
}
