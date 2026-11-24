import { expect, test } from '@playwright/test';

test('loads the product shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The curriculum is the opponent.' })).toBeVisible();
});
