import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_ANON_KEY, TEST_PASSWORD, TEST_SUPABASE_URL, testEmail } from '../support/auth';

// What a native app does: sign in with Supabase directly, then call the API
// with the access token. The integration suite stubs the signature check; this
// is the one place a real GoTrue-issued token meets the production build.

async function accessToken(role: string) {
  const supabase = createClient(TEST_SUPABASE_URL, TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail(role),
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

test('answers 401, not a login redirect, without a token', async ({ request }) => {
  const response = await request.get('/api/v1/members', { maxRedirects: 0 });
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe('unauthenticated');
});

test('serves the directory to a signed-in staff token', async ({ request }) => {
  const token = await accessToken('usher');
  const response = await request.get('/api/v1/members?search=E2E%20Cell', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.rows.map((m: { fullName: string }) => m.fullName)).toEqual([
    'E2E Cell Leader',
    'E2E Cell Member',
  ]);
});

test('applies the role’s permissions to the token', async ({ request }) => {
  const usher = await accessToken('usher');
  const denied = await request.post('/api/v1/members', {
    headers: { Authorization: `Bearer ${usher}` },
    data: { firstName: 'ZZ', lastName: 'Api Denied' },
  });
  expect(denied.status()).toBe(403);

  const admin = await accessToken('admin');
  const created = await request.post('/api/v1/members', {
    headers: { Authorization: `Bearer ${admin}` },
    data: { firstName: 'ZZ', lastName: 'Api Created' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  const deleted = await request.delete(`/api/v1/members/${id}`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(deleted.status()).toBe(204);
});
