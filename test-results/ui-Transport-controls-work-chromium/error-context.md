# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.spec.ts >> Transport controls work
- Location: tests/ui.spec.ts:24:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('UI mode switching works', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await page.waitForLoadState('networkidle');
  6  | 
  7  |   const tabs = [
  8  |     { id: '#tab-sampler', name: 'sampler' },
  9  |     { id: '#tab-pads_seq', name: 'pads_seq' },
  10 |     { id: '#tab-synth', name: 'synth' },
  11 |     { id: '#tab-dx7', name: 'dx7' },
  12 |     { id: '#tab-progression', name: 'progression' },
  13 |     { id: '#tab-808', name: '808' },
  14 |     { id: '#tab-mixer', name: 'mixer' },
  15 |   ];
  16 | 
  17 |   for (const tab of tabs) {
  18 |     const button = page.locator(tab.id);
  19 |     await button.click({ force: true });
  20 |     await expect(button).toHaveClass(/shadow-\[/);
  21 |   }
  22 | });
  23 | 
  24 | test('Transport controls work', async ({ page }) => {
> 25 |   await page.goto('/');
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  26 |   await page.waitForLoadState('networkidle');
  27 | 
  28 |   const recordBtn = page.locator('#btn-record');
  29 |   const stopBtn = page.locator('#btn-stop');
  30 |   const playBtn = page.locator('#btn-play');
  31 | 
  32 |   await recordBtn.waitFor({ state: 'visible' });
  33 |   await recordBtn.click({ force: true });
  34 |   await expect(recordBtn).toHaveClass(/bg-red-900\/50/);
  35 | 
  36 |   await playBtn.waitFor({ state: 'visible' });
  37 |   await playBtn.click({ force: true });
  38 |   await expect(playBtn).toHaveClass(/bg-cyan-600/);
  39 | 
  40 |   await stopBtn.waitFor({ state: 'visible' });
  41 |   await stopBtn.click({ force: true });
  42 |   await expect(playBtn).not.toHaveClass(/bg-cyan-600/);
  43 | });
  44 | 
```