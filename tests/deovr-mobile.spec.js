import { test } from '@playwright/test';
import { searchPublicVideo, getPlayerTimes, waitForClockToAdvance } from './helpers.js';

test('Pixel 7: search for a public video and start playback', async ({ page }, testInfo) => {
  await test.step('Search from the mobile homepage and open a public video', async () => {
    await searchPublicVideo(page, testInfo, true);
  });
  await test.step('Start playback and verify the clock advances', async () => {
    await page.locator('main button:has(svg[name="play"])').click();
    await waitForClockToAdvance(page, (await getPlayerTimes(page)).current);
  });
});
