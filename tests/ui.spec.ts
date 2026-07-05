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
    // Verify the button reflects an active/selected state after clicking
    await expect(button).toHaveClass(/shadow/, { timeout: 5000 });
  }
});

test('Transport controls work', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Record button
  const recordBtn = page.getByRole('button', { name: /record/i });
  await recordBtn.click();
  await expect(recordBtn).toHaveClass(/bg-red-900/, { timeout: 5000 });

  // Play button
  const playBtn = page.getByRole('button', { name: /play/i });
  await playBtn.click();
  await expect(playBtn).toHaveClass(/bg-cyan-600/, { timeout: 5000 });

  // Stop button stops playback
  const stopBtn = page.getByRole('button', { name: /stop/i });
  await stopBtn.click();
  await expect(playBtn).not.toHaveClass(/bg-cyan-600/, { timeout: 5000 });
});
