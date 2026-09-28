/**
 * A brand-new, empty production server: signing in, the password screen,
 * and the owner's very first setup, all without any developer help.
 */
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config';
import { addDays, formatDateFriendly, toISODate } from '../shared/dates';

test.describe.configure({ mode: 'serial' });

test('customer data cannot be reached without the password', async ({ request }) => {
  for (const path of ['/api/clients', '/api/settings', '/api/appointments?from=2026-01-01&to=2030-01-01', '/api/backup']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
  }
  // The public health check reveals nothing.
  expect(await (await request.get('/api/health')).json()).toEqual({ ok: true });
});

test('sign-in screen: wrong password, right password, refresh, direct links, sign out', async ({ page }) => {
  // A direct link to a deep page asks for the password first.
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Business name')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open Veronica' }).click();
  await expect(page.getByText('Please enter your password.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Password' }).fill('not the password');
  await page.getByRole('button', { name: 'Open Veronica' }).click();
  await expect(page.getByText('That password is not right. Please try again.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Password' }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Open Veronica' }).click();
  // Lands on the page that was asked for.
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  const [cookie] = (await page.context().cookies()).filter((c) => c.name === 'veronica_session');
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe('Lax');
  expect(cookie.expires * 1000).toBeGreaterThan(Date.now() + 300 * 24 * 3600 * 1000);

  // Stays signed in after refreshing and when opening other pages directly.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goto('/calendar?view=week');
  await expect(page.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');

  // Sign out.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('first-time setup on an empty database', async ({ page }) => {
  const today = toISODate(new Date());
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Password' }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Open Veronica' }).click();

  // 1-2. Open Veronica: an empty, friendly home screen with a setup hint.
  await expect(page.getByText('No cleanings today', { exact: true })).toBeVisible();
  await expect(page.getByText('Welcome to Veronica!')).toBeVisible();

  // 3-9. Settings.
  await page.getByRole('link', { name: 'Open Settings' }).click();
  await page.getByLabel('Business name').fill('Sunny Day Cleaning');
  await page.getByLabel('Owner name').fill('Pat Example');
  await page.getByLabel('Business phone').fill('555-010-0100');
  await page.getByLabel('How long a cleaning usually takes').selectOption('150');
  await expect(page.getByText(/Example: Hi Alex, this is a reminder that your cleaning with Sunny Day Cleaning/)).toBeVisible();
  await expect(page.getByText("Example: Hi Alex, I'm on my way for your cleaning. See you soon!")).toBeVisible();
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved.');
  await page.reload();
  await expect(page.getByLabel('Business name')).toHaveValue('Sunny Day Cleaning');
  await expect(page.getByLabel('How long a cleaning usually takes')).toHaveValue('150');

  // 10. First client.
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Clients' }).click();
  await expect(page.getByText('No clients yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add Your First Client' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Client' });
  await dialog.getByLabel('Name').fill('Maria Johnson');
  await dialog.getByLabel('Phone').fill('555-010-0101');
  await dialog.getByLabel('Address').fill('123 Main Street, Springfield');
  await dialog.getByRole('button', { name: 'Add Client' }).click();
  await expect(page.getByRole('heading', { name: 'Maria Johnson' })).toBeVisible();

  // 11. First cleaning, straight from her profile.
  await page.getByRole('button', { name: 'Add Cleaning' }).last().click();
  const add = page.getByRole('dialog', { name: 'Add Cleaning' });
  await expect(add.getByRole('combobox', { name: 'Client' })).toHaveValue('Maria Johnson');
  await add.getByRole('button', { name: 'Tomorrow' }).click();
  await add.getByLabel('Time').selectOption('09:00');
  await add.getByRole('button', { name: 'Add to Schedule' }).click();
  await expect(page.getByRole('status')).toContainText(`Cleaning added for Maria Johnson on ${formatDateFriendly(addDays(today, 1))} at 9:00 AM`);
  await expect(page.getByRole('region', { name: 'Upcoming Cleanings' })).toContainText('9:00 AM – 11:30 AM');

  // The setup hint is gone and the text message uses the new business name.
  await page.goto('/');
  await expect(page.getByText('Welcome to Veronica!')).toHaveCount(0);
  await page.getByRole('link', { name: /Maria Johnson · / }).click();
  const text = decodeURIComponent((await page.getByRole('link', { name: 'Text Customer' }).getAttribute('href'))!);
  expect(text).toContain('your cleaning with Sunny Day Cleaning');
});
