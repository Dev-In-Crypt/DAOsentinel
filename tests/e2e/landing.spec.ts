import { test, expect } from '@playwright/test';

test('landing page renders hero and pricing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your DAOs are spending billions/i })).toBeVisible();
  await expect(page.getByText(/Democracy Score leaderboard/i)).toBeVisible();
  await expect(page.getByText(/Delegate Pro/i)).toBeVisible();
});

test('newsletter signup form is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /Subscribe/i }).first()).toBeVisible();
});
