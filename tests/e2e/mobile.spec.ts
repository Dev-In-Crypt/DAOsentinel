import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 5'] });

test('landing is responsive at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your DAOs are spending billions/i })).toBeVisible();
});
