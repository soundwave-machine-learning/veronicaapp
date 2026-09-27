/** Layout checks at the required screen sizes, and phone-specific behavior. */
import { devices, expect, test } from '@playwright/test';
import { addCleaning } from './helpers';

const WIDTHS = [1440, 1024, 768, 390, 320];
const PAGES = ['/', '/calendar', '/calendar?view=week', '/clients', '/settings'];

test('seed a client for layout checks', async ({ page }) => {
  await page.goto('/');
  await addCleaning(page, {
    client: 'Alexandra Montgomery-Whitfield',
    time: '15:00',
    more: async (p) => {
      await p.getByRole('button', { name: /More options/ }).click();
      await p.getByLabel('Address').fill('4821 Long Winding Meadowbrook Boulevard, Apartment 12B, Springfield');
      await p.getByLabel('Phone').fill('5550100150');
    },
  });
  await expect(page.getByRole('status')).toContainText('Cleaning added');
});

for (const width of WIDTHS) {
  test(`no sideways scrolling at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    // Phones get the bottom bar, bigger screens the top bar.
    const bottom = page.locator('.bottomnav');
    const top = page.locator('.topnav');
    if (width < 760) {
      await expect(bottom).toBeVisible();
      await expect(top).toBeHidden();
    } else {
      await expect(bottom).toBeHidden();
      await expect(top).toBeVisible();
    }
    await context.close();
  });
}

test('phone: key actions are large and texts use the iPhone format', async ({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  await page.goto('/');
  const card = page.getByRole('article', { name: 'Next cleaning: Alexandra Montgomery-Whitfield' });
  await expect(card.getByRole('link', { name: 'On My Way' })).toBeVisible();
  const buttons = card.locator('.btn');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const onMyWay = await card.getByRole('link', { name: 'On My Way' }).getAttribute('href');
  expect(onMyWay).toMatch(/^sms:\+15550100150&body=/);
  await expect(card.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', /^https:\/\/maps\.apple\.com\/\?daddr=/);

  // Bottom navigation works by touch.
  await page.locator('.bottomnav').getByRole('link', { name: 'Clients' }).tap();
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  await context.close();
});

test('the app can be installed (manifest and service worker)', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Veronica');
  expect(manifest.display).toBe('standalone');
  expect((await request.get('/icons/icon-512.png')).ok()).toBe(true);
  expect((await request.get('/sw.js')).ok()).toBe(true);
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
});
