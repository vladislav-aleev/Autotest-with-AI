import { expect, test } from '@playwright/test';

test('Pixel 7: search for a public video and start playback', async ({ page }) => {
  await test.step('Search from the mobile homepage', async () => {
    await page.goto('https://deovr.com/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'VR Videos' })).toBeVisible();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const searchInput = page.getByPlaceholder("I'm looking for...");
    await searchInput.fill('Hanoi Train Street');
    await searchInput.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();

    const freeResult = page.locator('main article').filter({
      hasNot: page.locator('a[href*="/videos/premium"]'),
    }).first();
    await expect(freeResult).toBeVisible();
    await expect(freeResult.locator('a[href*="/videos/premium"]')).toHaveCount(0);
    const videoLink = freeResult.locator('h3 a');
    const videoHref = await videoLink.getAttribute('href');
    const videoTitle = (await videoLink.innerText()).trim();
    expect(videoHref).toBeTruthy();
    await videoLink.click();
    await expect(page).toHaveURL(new URL(videoHref, 'https://deovr.com/').href);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(videoTitle);
  });

  await test.step('Start the video and verify playback time changes', async () => {
    await page.locator('main button:has(svg[name="play"])').first().click();
    const timeParts = page.getByTestId('bottom-controls').locator('p span');
    await expect(timeParts).toHaveCount(2);

    const readCurrentTime = async () => {
      const value = (await timeParts.nth(0).innerText()).trim();
      const parts = value.split(':').map(Number);
      expect(parts.length).toBeGreaterThanOrEqual(2);
      return parts.reduce((total, part) => total * 60 + part, 0);
    };

    const initialTime = await readCurrentTime();
    await expect.poll(readCurrentTime, { timeout: 20_000 }).toBeGreaterThan(initialTime);
  });
});
