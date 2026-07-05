import { test, expect } from '@playwright/test';

test('UI mode switching works', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const tabs = [
    { text: /MPC Sampler/i },
    { text: /MPC Pads/i },
    { text: /Juno Synth/i },
    { text: /DX7/i },
    { text: /Chord Generator/i },
    { text: /808 Rompler/i },
    { text: /Mixer/i },
  ];

  for (const tab of tabs) {
    const button = page.getByRole('button', { name: tab.text });
    await expect(button).toBeVisible();
    await button.click({ force: true });
    await expect(button).toHaveClass(/shadow/, { timeout: 5000 });
  }
});

test('Transport controls work', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Record button — uses id="btn-record" and title attribute
  const recordBtn = page.locator('#btn-record');
  await expect(recordBtn).toBeVisible();
  await recordBtn.click();
  await expect(recordBtn).toHaveClass(/bg-red-900/, { timeout: 5000 });

  // Play button — uses id="btn-play"
  const playBtn = page.locator('#btn-play');
  await expect(playBtn).toBeVisible();
  await playBtn.click();
  await expect(playBtn).toHaveClass(/bg-cyan-600/, { timeout: 5000 });

  // Stop button — uses id="btn-stop"
  const stopBtn = page.locator('#btn-stop');
  await expect(stopBtn).toBeVisible();
  await stopBtn.click();
  await expect(playBtn).not.toHaveClass(/bg-cyan-600/, { timeout: 5000 });
});
