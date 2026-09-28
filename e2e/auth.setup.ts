import { expect, test as setup } from '@playwright/test';
import { E2E_PASSWORD, STORAGE_STATE } from '../playwright.config';

setup('sign in once for the workflow tests', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Password' }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Open Veronica' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
