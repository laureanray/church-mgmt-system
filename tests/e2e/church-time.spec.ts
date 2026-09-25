import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { testEmail, TEST_PASSWORD } from '../support/auth';
import { connectTestDatabase } from '../support/database';
import { services } from '../../db/schema';

// The server runs on UTC and the browser on Manila time (playwright.config.ts),
// as in production. A service entered for 9:00 AM has to be stored as 9:00 AM
// Manila time, shown as 9:00 AM, and still be 9:00 AM after an edit that never
// touched the time — the form used to fill itself in the browser's zone and
// save in the server's, moving the service eight hours on every save.

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(testEmail('admin'));
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('a service keeps the time it was entered with, through an edit', async ({ page }) => {
  const { client, db } = connectTestDatabase();
  const name = `E2E church time ${crypto.randomUUID()}`;
  try {
    await signIn(page);
    await page.goto('/services/new');
    await page.getByRole('textbox', { name: 'Service Name' }).fill(name);
    await page.getByLabel('Date & Time').fill('2026-10-04T09:00');
    await page.getByRole('button', { name: 'Create service', exact: true }).click();
    await expect(page).toHaveURL(/\/services\/(?!new$)[^/]+$/);
    await expect(page.getByText(/Oct 4, 2026, 9:00\sAM/)).toBeVisible();

    const stored = async () =>
      (await db.select().from(services).where(eq(services.name, name)))[0]?.scheduledAt.toISOString();
    expect(await stored()).toBe('2026-10-04T01:00:00.000Z');

    // A client-side navigation, so the form renders in the browser's zone.
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Date & Time')).toHaveValue('2026-10-04T09:00');
    await page.getByRole('textbox', { name: 'Location' }).fill('Main Sanctuary');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    await expect(page.getByText('Main Sanctuary')).toBeVisible();
    await expect(page.getByText(/Oct 4, 2026, 9:00\sAM/)).toBeVisible();
    expect(await stored()).toBe('2026-10-04T01:00:00.000Z');
  } finally {
    await db.delete(services).where(eq(services.name, name));
    await client.end();
  }
});
