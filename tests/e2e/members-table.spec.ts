import { test, expect, type Page } from '@playwright/test';
import { like } from 'drizzle-orm';
import { testEmail, TEST_PASSWORD } from '../support/auth';
import { connectTestDatabase } from '../support/database';
import { members } from '../../db/schema';

// The directory table keeps its whole state in the URL, and the page turns that
// state into SQL. These specs are the only place the two halves are checked
// together: the unit suite pins the URLs, the UI suite pins the markup, and
// neither would notice an ORDER BY wired to the wrong column.

const PREFIX = 'ZZ Table';
const COUNT = 25;

const SEEDED = Array.from({ length: COUNT }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: `e2e-table-${n}`,
    fullName: `${PREFIX} ${n}`,
    qrToken: `e2e-table-token-${n}`,
    // 13 male (odd), 12 female (even).
    gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female',
  };
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(testEmail('admin'));
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** The first data row's name cell — what an ordering change is visible in. */
function firstName(page: Page) {
  return page.locator('tbody tr').first().locator('td').first();
}

test.describe('members table', () => {
  test.beforeAll(async () => {
    const { client, db } = connectTestDatabase();
    try {
      await db.delete(members).where(like(members.id, 'e2e-table-%'));
      await db.insert(members).values(SEEDED);
    } finally {
      await client.end();
    }
  });

  test.afterAll(async () => {
    const { client, db } = connectTestDatabase();
    try {
      await db.delete(members).where(like(members.id, 'e2e-table-%'));
    } finally {
      await client.end();
    }
  });

  test('searches, sorts and pages entirely through the URL', async ({ page }) => {
    await signIn(page);
    await page.goto(`/members?q=${encodeURIComponent(PREFIX)}`);

    await expect(page.getByText(`Showing 1–20 of ${COUNT} rows`)).toBeVisible();
    await expect(firstName(page)).toHaveText(`${PREFIX} 01`);

    // Already ascending by name, so the header's next state is descending.
    await page.getByRole('link', { name: 'Name', exact: true }).click();
    await expect(page).toHaveURL(/sort=name&dir=desc/);
    await expect(firstName(page)).toHaveText(`${PREFIX} ${COUNT}`);
    await expect(
      page.getByRole('columnheader', { name: 'Name' }),
    ).toHaveAttribute('aria-sort', 'descending');

    // Paging keeps the search and the sort, and the last page is a short one.
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page.getByText(`Showing 21–${COUNT} of ${COUNT} rows`)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await expect(firstName(page)).toHaveText(`${PREFIX} 05`);
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();

    // A third click on the header drops back to the table's own ordering.
    await page.getByRole('link', { name: 'Name', exact: true }).click();
    await expect(page).not.toHaveURL(/sort=/);
    await expect(firstName(page)).toHaveText(`${PREFIX} 01`);
  });

  test('a search from a sorted page keeps the sort and returns to page one', async ({
    page,
  }) => {
    await signIn(page);
    // A GET form replaces the query string rather than merging into it, so the
    // sort survives only because the toolbar re-emits it as a hidden input.
    await page.goto('/members?sort=name&dir=desc&page=2');

    await page.getByLabel('Search members by name').fill(`${PREFIX} 1`);
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(page).toHaveURL(/sort=name/);
    await expect(page).toHaveURL(/dir=desc/);
    await expect(page).not.toHaveURL(/page=2/);
    // "ZZ Table 1" matches 10 through 19, newest name first.
    await expect(page.getByText('Showing 1–10 of 10 rows')).toBeVisible();
    await expect(firstName(page)).toHaveText(`${PREFIX} 19`);
  });

  test('a facet narrows the rows and the count agrees with them', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/members?q=${encodeURIComponent(PREFIX)}`);

    await page.getByRole('button', { name: 'Gender' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Male', exact: true }).click();

    await expect(page).toHaveURL(/gender=male/);
    await expect(page.getByText('Showing 1–13 of 13 rows')).toBeVisible();

    // A facet is multi-select, so the menu deliberately stays open and the
    // ticked box reflects the state the navigation just produced.
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Male', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // Reset clears the search as well as the facet.
    await page.getByRole('link', { name: 'Reset' }).click();
    await expect(page).toHaveURL(/\/members$/);
  });

  test('a page past the end redirects to the last page that has rows', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/members?q=${encodeURIComponent(PREFIX)}&page=9`);

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(`Showing 21–${COUNT} of ${COUNT} rows`)).toBeVisible();
  });

  test('a search longer than the service accepts still renders the table', async ({
    page,
  }) => {
    await signIn(page);
    // The service rejects a search over 200 characters; the page trims a
    // pasted URL to fit rather than falling through to the error boundary.
    await page.goto(`/members?q=${encodeURIComponent(PREFIX + ' ' + 'x'.repeat(250))}`);

    await expect(page.getByText('No members match your search')).toBeVisible();
  });

  test('hiding a column is recorded in the URL and survives a reload', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/members?q=${encodeURIComponent(PREFIX)}`);

    await expect(page.getByRole('columnheader', { name: 'Gender' })).toBeVisible();

    await page.getByRole('button', { name: 'Choose columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Gender' }).click();

    await expect(page).toHaveURL(/hide=gender/);
    await page.reload();
    await expect(page.getByRole('columnheader', { name: 'Gender' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  });

  // Every control except the two checkbox menus is an anchor or a GET form in
  // the server's HTML. That is the property worth pinning: the URL is the whole
  // model, so a control is linkable and prefetchable and there is no table
  // state to hydrate. It is *not* a no-JavaScript guarantee — `(app)/loading.tsx`
  // puts the group behind a streaming boundary that React reveals with an
  // inline script, so scripting-off sits on the skeleton whatever the table does.
  test('renders sorting, paging and page size as server-side links', async ({
    page,
  }) => {
    await signIn(page);

    const response = await page.request.get(
      `/members?q=${encodeURIComponent(PREFIX)}`,
    );
    const html = await response.text();
    const hrefs = [...html.matchAll(/href="([^"]*\/members\?[^"]*)"/g)].map((m) =>
      m[1].replaceAll('&amp;', '&'),
    );

    expect(hrefs).toContain('/members?q=ZZ+Table&sort=name&dir=desc');
    expect(hrefs).toContain('/members?q=ZZ+Table&page=2');
    // The control Codex flagged: a link, so it needs no popup to reach.
    expect(hrefs).toContain('/members?q=ZZ+Table&per=50');

    // The search is a GET form whose field name is the query parameter.
    expect(html).toMatch(/<form[^>]*>(?:(?!<\/form>)[\s\S])*?name="q"/);
    expect(html).not.toMatch(/<form[^>]*method="post"/i);
  });
});
