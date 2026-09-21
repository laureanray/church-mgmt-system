import { test, expect, type Page } from '@playwright/test';
import { inArray } from 'drizzle-orm';
import { testEmail, TEST_PASSWORD } from '../support/auth';
import { connectTestDatabase } from '../support/database';
import { services } from '../../db/schema';

async function signIn(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(testEmail(role));
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('anonymous visitors must sign in to access members', async ({ page }) => {
  await page.goto('/members');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('invalid credentials show a useful error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(testEmail('admin'));
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL(/\/login/);
});

for (const role of ['admin', 'leader']) {
  test(`${role} can create a member through the server action`, async ({ page }) => {
    await signIn(page, role);
    await page.goto('/members/new');
    const lastName = crypto.randomUUID();
    const name = `E2E ${role} ${lastName}`;
    await page.getByRole('textbox', { name: 'First Name', exact: true }).fill(`E2E ${role}`);
    await page.getByRole('textbox', { name: 'Last Name', exact: true }).fill(lastName);
    await page.getByRole('button', { name: 'Create member', exact: true }).click();
    await expect(page).toHaveURL(/\/members\/(?!new$)[^/]+$/);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.goto(`${page.url()}/edit`);
    await expect(page.getByRole('textbox', { name: 'First Name', exact: true })).toHaveValue(`E2E ${role}`);
    await expect(page.getByRole('textbox', { name: 'Last Name', exact: true })).toHaveValue(lastName);
    await page.getByLabel('Middle Name (Optional)').fill('Reyes');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: `E2E ${role} Reyes ${lastName}`, exact: true })).toBeVisible();
  });
}

for (const role of ['leader', 'usher']) {
  test(`${role} cannot open staff administration`, async ({ page }) => {
    await signIn(page, role);
    await page.goto('/users');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
}

test('usher cannot open member creation', async ({ page }) => {
  await signIn(page, 'usher');
  await page.goto('/members/new');
  await expect(page).toHaveURL(/\/dashboard$/);
});


test('mobile sidebar responds to viewport changes', async ({ page }) => {
  await signIn(page, 'admin');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  const sidebar = page.getByRole('dialog', { name: 'Sidebar', exact: true });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Cell Groups', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebar).not.toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('link', { name: 'Cell Groups', exact: true })).toBeVisible();
});

test('cell graph renders simulation nodes and supports selection and dragging', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/cell-groups');
  const node = page.locator('svg g').filter({ has: page.locator('text').filter({ hasText: /^E2E Cell Leader$/ }) }).last();
  const circle = node.locator('circle');
  await expect(circle).toBeVisible();
  await circle.click();
  await expect(page.getByRole('link', { name: 'Open member profile' })).toBeVisible();
  const bounds = await circle.boundingBox();
  if (!bounds) throw new Error('Graph node has no bounds');
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 40, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => {
    const moved = await circle.boundingBox();
    return moved ? moved.x - bounds.x : 0;
  }).toBeGreaterThan(40);
});

test('a deep link to a service outside the picker window still selects it', async ({ page }) => {
  // /scan lists a window of services either side of now, but every service
  // detail page links to /scan?service=<id> however old that service is. If the
  // link's service is missing from the list the trigger renders blank while the
  // camera silently records against it.
  const { client, db } = connectTestDatabase();
  const OLD = 'e2e-old-service';
  const recent = Array.from({ length: 30 }, (_, i) => ({
    id: `e2e-recent-${i}`,
    name: `Recent Service ${i}`,
    scheduledAt: new Date(Date.now() - (i + 1) * 86_400_000),
  }));

  try {
    await db.insert(services).values([
      ...recent,
      { id: OLD, name: 'Very Old Service', scheduledAt: new Date('2020-01-05T09:00:00Z') },
    ]);

    await signIn(page, 'admin');
    await page.goto(`/scan?service=${OLD}`);

    await expect(page.getByLabel('Recording attendance for')).toContainText('Very Old Service');
  } finally {
    await db.delete(services).where(inArray(services.id, [OLD, ...recent.map(r => r.id)]));
    await client.end();
  }
});
