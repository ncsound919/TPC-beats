import { test, expect } from '@playwright/test';

test('UI mode switching works', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const tabs = [
    { id: '#tab-sampler', name: 'sampler' },
    { id: '#tab-pads_seq', name: 'pads_seq' },
    { id: '#tab-synth', name: 'synth' },
    { id: '#tab-dx7', name: 'dx7' },
    { id: '#tab-progression', name: 'progression' },
    { id: '#tab-808', name: '808' },
    { id: '#tab-mixer', name: 'mixer' },
  ];

  for (const tab of tabs) {
    const button = page.locator(tab.id);
    await button.click({ force: true });
    await expect(button).toHaveClass(/shadow-\[/);
  }
});

test('Transport controls work', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const recordBtn = page.locator('#btn-record');
  const stopBtn = page.locator('#btn-stop');
  const playBtn = page.locator('#btn-play');

  await recordBtn.waitFor({ state: 'visible' });
  await recordBtn.click({ force: true });
  await expect(recordBtn).toHaveClass(/bg-red-900\/50/);

  await playBtn.waitFor({ state: 'visible' });
  await playBtn.click({ force: true });
  await expect(playBtn).toHaveClass(/bg-cyan-600/);

  await stopBtn.waitFor({ state: 'visible' });
  await stopBtn.click({ force: true });
  await expect(playBtn).not.toHaveClass(/bg-cyan-600/);
});
