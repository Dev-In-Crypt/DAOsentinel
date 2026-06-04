import { test, expect } from '@playwright/test';

test('DAO explorer renders list', async ({ page }) => {
  await page.goto('/daos');
  await expect(page.getByRole('heading', { name: /DAO Governance Explorer/i })).toBeVisible();
});

test('alerts feed renders', async ({ page }) => {
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: /Alert feed/i })).toBeVisible();
});

test('proposals page renders', async ({ page }) => {
  await page.goto('/proposals');
  await expect(page.getByRole('heading', { name: /Proposals/i })).toBeVisible();
});

test('delegates page renders', async ({ page }) => {
  await page.goto('/delegates');
  await expect(page.getByRole('heading', { name: /Delegate leaderboard/i })).toBeVisible();
});

test('digest archive renders', async ({ page }) => {
  await page.goto('/digest');
  await expect(page.getByRole('heading', { name: /Weekly Digest archive/i })).toBeVisible();
});
