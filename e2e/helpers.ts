import { expect, type Page } from '@playwright/test';
import { addDays, toISODate } from '../shared/dates';

export const today = () => toISODate(new Date());
export const day = (offset: number) => addDays(today(), offset);

/** Open Add Cleaning, fill the three required fields and save. */
export async function addCleaning(
  page: Page,
  options: { client: string; date?: string; time: string; pick?: boolean; more?: (page: Page) => Promise<void> },
) {
  await page.getByRole('button', { name: 'Add Cleaning', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Cleaning' });
  await expect(dialog).toBeVisible();
  const name = dialog.getByRole('combobox', { name: 'Client' });
  if (options.pick) {
    await name.fill(options.client.slice(0, 3));
    await dialog.getByRole('option', { name: new RegExp(options.client) }).click();
  } else {
    await name.fill(options.client);
  }
  if (options.date) await dialog.getByLabel('Date').fill(options.date);
  await dialog.getByLabel('Time').selectOption(options.time);
  if (options.more) await options.more(page);
  await dialog.getByRole('button', { name: 'Add to Schedule' }).click();
  return dialog;
}
