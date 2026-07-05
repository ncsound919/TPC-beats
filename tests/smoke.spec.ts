import { test, expect } from '@playwright/test';

test('app loads and has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Deterministic MPC Sampler/);
});
