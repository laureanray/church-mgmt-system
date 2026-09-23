import { test, expect, type Page } from '@playwright/test';
import { eq, like } from 'drizzle-orm';
import { testEmail, TEST_PASSWORD } from '../support/auth';
import { connectTestDatabase } from '../support/database';
import { members, services } from '../../db/schema';

// Status decides who the directory shows by default, what the dashboard counts
// and what check-in asks. The unit and UI suites pin the URL and the markup;
// these check that the page actually turns them into the right rows.

const PREFIX = 'ZZ Status';
const SERVICE_ID = 'e2e-status-service';

const SEEDED = [
  { id: 'e2e-status-active', fullName: `${PREFIX} Active`, firstName: 'ZZ', lastName: 'Status Active', qrToken: 'e2e-status-active', status: 'active' },
  { id: 'e2e-status-visitor', fullName: `${PREFIX} Visitor`, firstName: 'ZZ', lastName: 'Status Visitor', qrToken: 'e2e-status-visitor', status: 'visitor' },
  { id: 'e2e-status-inactive', fullName: `${PREFIX} Inactive`, firstName: 'ZZ', lastName: 'Status Inactive', qrToken: 'e2e-status-inactive', status: 'inactive' },
  { id: 'e2e-status-transferred', fullName: `${PREFIX} Transferred`, firstName: 'ZZ', lastName: 'Status Transferred', qrToken: 'e2e-status-transferred', status: 'transferred' },
  { id: 'e2e-status-deceased', fullName: `${PREFIX} Deceased`, firstName: 'ZZ', lastName: 'Status Deceased', qrToken: 'e2e-status-deceased', status: 'deceased' },
] as const;

const search = `q=${encodeURIComponent(PREFIX)}`;

async function signIn(page: Page, role = 'admin') {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(testEmail(role));
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** A row of the check-in feed — toasts are list items too, so exclude them. */
function feedRow(page: Page, name: string) {
  return page.locator('li:not([data-sonner-toast])', { hasText: name });
}

function names(page: Page) {
  return page.locator('tbody tr td:first-child a');
}

async function statusOf(id: string) {
  const { client, db } = connectTestDatabase();
  try {
    const [row] = await db
      .select({ status: members.status })
      .from(members)
      .where(eq(members.id, id));
    return row?.status;
  } finally {
    await client.end();
  }
}

async function cleanUp() {
  const { client, db } = connectTestDatabase();
  try {
    await db.delete(members).where(like(members.id, 'e2e-status-%'));
    await db.delete(services).where(eq(services.id, SERVICE_ID));
  } finally {
    await client.end();
  }
}

test.describe('member status', () => {
  test.beforeEach(async () => {
    await cleanUp();
    const { client, db } = connectTestDatabase();
    try {
      await db.insert(members).values([...SEEDED]);
      await db.insert(services).values({
        id: SERVICE_ID,
        name: 'ZZ Status Service',
        scheduledAt: new Date(),
      });
    } finally {
      await client.end();
    }
  });

  test.afterAll(cleanUp);

  test('the directory opens on active members and visitors', async ({ page }) => {
    await signIn(page);
    await page.goto(`/members?${search}`);

    await expect(names(page)).toHaveText([`${PREFIX} Active`, `${PREFIX} Visitor`]);
    await expect(page.getByText('Showing 1–2 of 2 rows')).toBeVisible();
    // Active is the norm and carries no badge; everything else does.
    const visitorRow = page.locator('tbody tr', { hasText: `${PREFIX} Visitor` });
    await expect(visitorRow.getByText('Visitor', { exact: true })).toBeVisible();
    const activeRow = page.locator('tbody tr', { hasText: `${PREFIX} Active` });
    await expect(activeRow.getByText('Active', { exact: true })).toHaveCount(0);
    // The default view is the table's own, so Reset clears only the search.
    await expect(page.getByRole('link', { name: 'Reset' })).toHaveAttribute('href', '/members');
    await page.goto('/members');
    await expect(page.getByRole('link', { name: 'Reset' })).toHaveCount(0);
  });

  test('a status in the URL shows members the default hides', async ({ page }) => {
    await signIn(page);
    await page.goto(`/members?${search}&status=inactive`);

    await expect(names(page)).toHaveText([`${PREFIX} Inactive`]);

    await page.goto(`/members?${search}&status=transferred&status=deceased`);
    await expect(names(page)).toHaveText([`${PREFIX} Deceased`, `${PREFIX} Transferred`]);
  });

  test('Show all reveals every status, and unticking it returns to the default', async ({ page }) => {
    await signIn(page);
    await page.goto(`/members?${search}`);

    await page.getByRole('button', { name: /^Status/ }).click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Active', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('menuitemcheckbox', { name: 'Show all' }).click();

    await expect(page).toHaveURL(/status=all/);
    await expect(page.getByText('Showing 1–5 of 5 rows')).toBeVisible();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Show all' }),
    ).toHaveAttribute('aria-checked', 'true');

    // Reopened rather than clicked again at once: a second push fired while the
    // first navigation is still streaming can be dropped by the router, and no
    // person clicks within the same few milliseconds.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Status/ }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Show all' }).click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.getByText('Showing 1–2 of 2 rows')).toBeVisible();
  });

  test('an unknown status keeps the default view', async ({ page }) => {
    await signIn(page);
    // What an old marital-status bookmark looks like after the key was renamed.
    await page.goto(`/members?${search}&status=married`);

    await expect(names(page)).toHaveText([`${PREFIX} Active`, `${PREFIX} Visitor`]);
  });

  test('marital status filters under its own key', async ({ page }) => {
    await signIn(page);
    await page.goto(`/members?${search}`);

    await page.getByRole('button', { name: /^Marital status/ }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Married', exact: true }).click();

    await expect(page).toHaveURL(/marital=married/);
    await expect(page).not.toHaveURL(/status=/);
  });

  test('status is edited on the member form and shown on the member page', async ({ page }) => {
    await signIn(page);
    await page.goto('/members/e2e-status-active/edit');

    await page.getByRole('combobox', { name: 'Status', exact: true }).click();
    await page.getByRole('option', { name: 'Transferred' }).click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    await expect(page).toHaveURL(/\/members\/e2e-status-active$/);
    await expect(page.getByText('Transferred', { exact: true })).toBeVisible();
    expect(await statusOf('e2e-status-active')).toBe('transferred');

    await page.goto(`/members?${search}`);
    await expect(names(page)).toHaveText([`${PREFIX} Visitor`]);
  });

  test('the dashboard counts active members only', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('Active Members', { exact: true })).toBeVisible();
  });

  test('checking in an inactive member offers to mark them active again', async ({ page }) => {
    await signIn(page);
    await page.goto(`/scan?service=${SERVICE_ID}`);

    await page.getByLabel(/Manual entry/).fill('e2e-status-inactive');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Mark as active again?' });
    await expect(dialog).toContainText(`${PREFIX} Inactive is checked in`);
    await dialog.getByRole('button', { name: 'Mark as active' }).click();

    await expect(dialog).toBeHidden();
    await expect.poll(() => statusOf('e2e-status-inactive')).toBe('active');
    // The feed row stops calling them inactive once they are not.
    const row = feedRow(page, `${PREFIX} Inactive`);
    await expect(row).toBeVisible();
    await expect(row.getByText('Inactive', { exact: true })).toHaveCount(0);
  });

  test('declining the prompt keeps the check-in and the status', async ({ page }) => {
    await signIn(page);
    await page.goto(`/scan?service=${SERVICE_ID}`);

    await page.getByLabel(/Manual entry/).fill('e2e-status-transferred');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Mark as active again?' });
    await dialog.getByRole('button', { name: 'Keep as transferred' }).click();

    await expect(dialog).toBeHidden();
    // The live feed still marks who came in.
    await expect(
      feedRow(page, `${PREFIX} Transferred`).getByText('Transferred', { exact: true }),
    ).toBeVisible();
    expect(await statusOf('e2e-status-transferred')).toBe('transferred');
  });

  test('an usher checks a lapsed member in without being asked', async ({ page }) => {
    await signIn(page, 'usher');
    await page.goto(`/scan?service=${SERVICE_ID}`);

    await page.getByLabel(/Manual entry/).fill('e2e-status-inactive');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();

    await expect(
      feedRow(page, `${PREFIX} Inactive`).getByText('Inactive', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Mark as active again?' })).toHaveCount(0);
  });
});
