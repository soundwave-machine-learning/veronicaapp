/**
 * The required business workflows, run in order against a real server and
 * a fresh database, exactly as the owner would click through them.
 */
import { expect, test } from '@playwright/test';
import { addCleaning, day, today } from './helpers';
import { formatDateFriendly } from '../shared/dates';

test.describe.configure({ mode: 'serial' });

test('Workflow 1: add a cleaning for a brand-new client', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No cleanings today. Your schedule is clear.').first()).toBeVisible();

  const dialog = await addCleaning(page, { client: 'Maria Johnson', time: '10:00' });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Cleaning added for Maria Johnson');

  // Shows up on Today immediately, without a reload.
  await expect(page.getByText('1 Cleaning Today')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Next cleaning: Maria Johnson' })).toBeVisible();

  // ...on the Calendar...
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Calendar' }).click();
  const panel = page.locator('.day-panel');
  await expect(panel).toContainText('Maria Johnson');
  await expect(panel).toContainText('10:00 AM');

  // ...and a client record exists.
  await page.goto('/clients');
  await expect(page.getByRole('link', { name: /Maria Johnson/ })).toHaveCount(1);
});

test('Quick add explains missing fields in plain English', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Cleaning', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Cleaning' });
  await dialog.getByRole('button', { name: 'Add to Schedule' }).click();
  await expect(dialog.getByText('Please enter the client name.')).toBeVisible();
  await expect(dialog.getByText('Please choose a time.')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Client' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});

test('Workflow 2: existing client is suggested and re-used', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Cleaning', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Cleaning' });
  await dialog.getByRole('combobox', { name: 'Client' }).fill('Mar');
  const option = dialog.getByRole('option', { name: /Maria Johnson/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(dialog.getByText('Existing client')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tomorrow' }).click();
  await dialog.getByLabel('Time').selectOption('10:00');
  await dialog.getByRole('button', { name: 'Add to Schedule' }).click();
  await expect(page.getByRole('status')).toContainText('Cleaning added for Maria Johnson');

  await page.goto('/clients');
  await expect(page.getByRole('link', { name: /Maria Johnson/ })).toHaveCount(1);
  await page.getByRole('link', { name: /Maria Johnson/ }).click();
  await expect(page.getByRole('region', { name: 'Upcoming Cleanings' }).getByRole('link')).toHaveCount(2);
});

test('Workflow 3: client details are saved', async ({ page }) => {
  await page.goto('/clients');
  await page.getByRole('link', { name: /Maria Johnson/ }).click();
  await page.getByRole('button', { name: 'Edit Client' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Client' });
  await dialog.getByLabel('Phone').fill('555-010-0101');
  await dialog.getByLabel('Address').fill('123 Main Street, Springfield');
  await dialog.getByLabel('Usual price').fill('120');
  await dialog.getByLabel('Notes').fill('Friendly dog. Key under the blue pot.');
  await dialog.getByRole('button', { name: 'Save Client' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  const details = page.getByRole('region', { name: 'Client details' });
  await expect(details).toContainText('(555) 010-0101');
  await expect(details).toContainText('123 Main Street, Springfield');
  await expect(details).toContainText('$120');
  await expect(details).toContainText('Friendly dog. Key under the blue pot.');

  // A bad phone number gets a friendly message.
  await page.getByRole('button', { name: 'Edit Client' }).click();
  await page.getByRole('dialog', { name: 'Edit Client' }).getByLabel('Phone').fill('12345');
  await page.getByRole('button', { name: 'Save Client' }).click();
  await expect(page.getByText('It should have 10 digits')).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
});

test('Workflow 4: repeating every 2 weeks', async ({ page }) => {
  await page.goto('/');
  await addCleaning(page, {
    client: 'Maria Johnson',
    pick: true,
    date: day(7),
    time: '14:00',
    more: async (p) => {
      await p.getByRole('button', { name: /More options/ }).click();
      await p.getByLabel('Every 2 weeks').check();
    },
  });
  await expect(page.getByRole('status')).toContainText('Repeats every 2 weeks');

  for (const offset of [7, 21, 35, 63]) {
    await page.goto(`/calendar?date=${day(offset)}`);
    const panel = page.locator('.day-panel');
    await expect(panel).toContainText('Maria Johnson');
    await expect(panel).toContainText('2:00 PM');
    await expect(panel).toContainText('Every 2 weeks');
  }
  await page.goto(`/calendar?date=${day(14)}`);
  await expect(page.locator('.day-panel')).not.toContainText('2:00 PM');
});

test('Workflow 5: overlapping cleaning shows a clear conflict warning', async ({ page }) => {
  await page.goto('/');
  const dialog = await addCleaning(page, { client: 'Jennifer Smith', time: '11:00' });
  const warning = dialog.getByRole('alert').filter({ hasText: 'You already have a cleaning scheduled around this time.' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Maria Johnson');
  await expect(warning).toContainText('10:00 AM – 12:00 PM');

  await warning.getByRole('button', { name: 'Change Time' }).click();
  await expect(dialog.getByLabel('Time')).toBeFocused();
  await dialog.getByLabel('Time').selectOption('12:30');
  await dialog.getByRole('button', { name: 'Add to Schedule' }).click();
  await expect(page.getByRole('status')).toContainText('Cleaning added for Jennifer Smith');
  await expect(page.getByText('2 Cleanings Today')).toBeVisible();
});

test('Workflow 6: reschedule a cleaning', async ({ page }) => {
  await page.goto(`/calendar?date=${day(1)}`);
  await page.locator('.day-panel').getByRole('link', { name: /Maria Johnson/ }).click();
  await page.getByRole('button', { name: 'Reschedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reschedule Cleaning' });
  await dialog.getByLabel('Date').fill(day(3));
  await dialog.getByLabel('Time').selectOption('09:00');
  await dialog.getByRole('button', { name: 'Move Cleaning' }).click();
  await expect(page.getByRole('status')).toContainText(`Moved to ${formatDateFriendly(day(3))} at 9:00 AM`);
  await expect(page.locator('.appointment-when')).toContainText('9:00 AM');

  await page.goto(`/calendar?date=${day(3)}`);
  await expect(page.locator('.day-panel')).toContainText('Maria Johnson');
  await page.goto(`/calendar?date=${day(1)}`);
  await expect(page.locator('.day-panel')).not.toContainText('Maria Johnson');
});

test('Workflow 7: complete a cleaning; it stays in history and Next advances', async ({ page }) => {
  await page.goto('/');
  const next = page.getByRole('article', { name: 'Next cleaning: Maria Johnson' });
  await next.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('status')).toContainText("Maria Johnson's cleaning is marked complete.");
  await expect(page.getByRole('article', { name: 'Next cleaning: Jennifer Smith' })).toBeVisible();

  const schedule = page.getByRole('region', { name: "Today's Schedule" });
  const mariaRow = schedule.getByRole('link', { name: /Maria Johnson/ });
  await expect(mariaRow).toContainText('Completed');
  await expect(page.getByText('2 Cleanings Today · 1 done')).toBeVisible();

  await page.goto('/clients');
  await page.getByRole('link', { name: /Maria Johnson/ }).click();
  await expect(page.getByRole('region', { name: 'Past Cleanings' })).toContainText('Completed');
});

test('Workflow 8: paid status persists after refresh', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: "Today's Schedule" }).getByRole('link', { name: /Maria Johnson/ }).click();
  await page.getByRole('button', { name: 'Mark Paid' }).click();
  await expect(page.getByRole('status')).toContainText('Marked as paid.');
  await page.reload();
  await expect(page.locator('.badge-row')).toContainText('Paid');
  await expect(page.getByRole('button', { name: 'Mark Unpaid' })).toBeVisible();
});

test('Workflows 9–12: text, on my way, call and directions links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: "Today's Schedule" }).getByRole('link', { name: /Maria Johnson/ }).click();

  const text = page.getByRole('link', { name: 'Text Customer' });
  const textHref = (await text.getAttribute('href'))!;
  expect(textHref.startsWith('sms:+15550100101?body=')).toBe(true);
  expect(decodeURIComponent(textHref.split('body=')[1])).toBe(
    `Hi Maria, this is a reminder that your cleaning with My Cleaning Business is scheduled for ${formatDateFriendly(today())} at 10:00 AM. Thank you!`,
  );

  const onMyWay = (await page.getByRole('link', { name: 'On My Way' }).getAttribute('href'))!;
  expect(onMyWay.startsWith('sms:+15550100101?body=')).toBe(true);
  expect(decodeURIComponent(onMyWay.split('body=')[1])).toBe("Hi Maria, I'm on my way for your cleaning. See you soon!");

  await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+15550100101');
  await expect(page.getByRole('link', { name: 'Directions' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/dir/?api=1&destination=123%20Main%20Street%2C%20Springfield',
  );
});

test('Missing phone or address hides those buttons instead of erroring', async ({ page }) => {
  await page.goto('/');
  const next = page.getByRole('article', { name: 'Next cleaning: Jennifer Smith' });
  await expect(next.getByText('No phone number or address saved yet.')).toBeVisible();
  await expect(next.getByRole('link', { name: 'Call' })).toHaveCount(0);
  await expect(next.getByRole('link', { name: 'Directions' })).toHaveCount(0);
  await expect(next.getByRole('button', { name: 'Complete' })).toBeVisible();
});

test('Cancel needs confirmation and keeps the record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: "Today's Schedule" }).getByRole('link', { name: /Jennifer Smith/ }).click();
  await page.getByRole('button', { name: 'Cancel Appointment' }).click();
  const confirm = page.getByRole('dialog', { name: 'Cancel this cleaning?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep Cleaning' }).click();
  await expect(page.locator('.badge-row')).toContainText('Scheduled');

  await page.getByRole('button', { name: 'Cancel Appointment' }).click();
  await page.getByRole('button', { name: 'Yes, Cancel Cleaning' }).click();
  await expect(page.locator('.badge-row')).toContainText('Canceled');
  await page.goto('/');
  await expect(page.getByRole('region', { name: "Today's Schedule" }).getByRole('link', { name: /Jennifer Smith/ })).toContainText(
    'Canceled',
  );
  await expect(page.getByText('All done for today. Nice work!')).toBeVisible();
});

test('Workflow 13: nothing disappears after reloading', async ({ page }) => {
  await page.goto('/');
  await page.reload();
  const schedule = page.getByRole('region', { name: "Today's Schedule" });
  await expect(schedule.getByRole('link', { name: /Maria Johnson/ })).toContainText('Completed');
  await expect(schedule.getByRole('link', { name: /Maria Johnson/ })).toContainText('Paid');
  await page.goto('/clients');
  await expect(page.getByRole('link', { name: /Maria Johnson/ })).toContainText('123 Main Street');
  await expect(page.getByRole('link', { name: /Jennifer Smith/ })).toBeVisible();
});

test('Workflow 14: changing the business owner keeps all data', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Business name').fill('Bright Nest Cleaning');
  await page.getByLabel('Owner name').fill('Jordan Example');
  await page.getByLabel('Business phone').fill('555-010-0199');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved.');
  await page.reload();
  await expect(page.getByLabel('Business name')).toHaveValue('Bright Nest Cleaning');
  await expect(page.getByLabel('Owner name')).toHaveValue('Jordan Example');
  await expect(page.getByLabel('Business phone')).toHaveValue('(555) 010-0199');

  await page.goto('/');
  const schedule = page.getByRole('region', { name: "Today's Schedule" });
  await expect(schedule.getByRole('link', { name: /Maria Johnson/ })).toContainText('Paid');
  await schedule.getByRole('link', { name: /Maria Johnson/ }).click();
  const href = (await page.getByRole('link', { name: 'Text Customer' }).getAttribute('href'))!;
  expect(decodeURIComponent(href)).toContain('your cleaning with Bright Nest Cleaning');
  await page.goto('/clients');
  await expect(page.getByRole('link', { name: /Maria Johnson/ })).toContainText('(555) 010-0101');
});

test('Removing a client asks first and keeps their history', async ({ page }) => {
  await page.goto('/clients');
  await page.getByRole('link', { name: /Jennifer Smith/ }).click();
  await page.getByRole('button', { name: 'Remove Client' }).click();
  await page.getByRole('button', { name: 'Yes, Remove Jennifer Smith' }).click();
  await expect(page.getByText('This client was removed.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Past Cleanings' })).toContainText('Canceled');

  await page.goto('/clients');
  await expect(page.getByRole('link', { name: /Jennifer Smith/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Show removed clients/ }).click();
  await page.getByRole('button', { name: 'Bring Back' }).click();
  await expect(page.getByRole('status')).toContainText('Jennifer Smith is back');
});

test('Week view and month navigation', async ({ page }) => {
  await page.goto('/calendar');
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByRole('region', { name: formatDateFriendly(today()) })).toContainText('Maria Johnson');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('region', { name: formatDateFriendly(today()) })).toBeVisible();
  await page.getByRole('button', { name: 'Month' }).click();
  await expect(page.locator('.month-cell.is-today')).toContainText('Today');
});
