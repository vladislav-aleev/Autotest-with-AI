import { expect, test } from '@playwright/test';
import { searchPublicVideo, getPlayerTimes, waitForClockToAdvance, observeFullscreen } from './helpers.js';

async function verifyPlaybackContinuesAfterSeek(page) {
  const { current } = await getPlayerTimes(page);
  await revealPlayerControls(page);

  // Allow bounded buffering on every platform, without sending Play.
  await waitForClockToAdvance(page, current, 60_000);
  await revealPlayerControls(page);
  await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
}

function getPlayPauseControl(page, iconName) {
  const title = iconName === 'pause' ? 'Pause' : 'Play';
  return page.getByTestId('play-pause-btn').and(page.getByTitle(title, { exact: true }));
}

async function revealPlayerControls(page) {
  const overlay = page.getByTestId('player-overlay');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('The player overlay is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(overlay).toHaveAttribute('data-ui-hidden', 'false');
}

async function seekTo(page, fraction) {
  await revealPlayerControls(page);
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toBeVisible();
  const box = await timeline.boundingBox();
  if (!box) throw new Error('The player timeline is not visible');
  await timeline.click({ position: { x: Math.round(box.width * fraction), y: Math.round(box.height / 2) } });
}

async function openQualityMenu(page) {
  await revealPlayerControls(page);

  await page.getByTestId('quality-btn').click();
  const qualityMenu = page.getByTestId('quality-option').first().locator('xpath=ancestor::section[1]');
  await expect(qualityMenu).toBeVisible();
  return qualityMenu.getByTestId('quality-option');
}

test.describe('DeoVR public video playback', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (!['failed', 'timedOut'].includes(testInfo.status) || page.isClosed()) return;
    await testInfo.attach('player-at-failure', {
      body: JSON.stringify(await page.evaluate(() => ({
        url: location.href,
        controlTitle: document.querySelector('[data-testid="play-pause-btn"]')?.getAttribute('title'),
        clock: document.querySelector('[data-testid="bottom-controls"] p')?.textContent,
        media: [...document.querySelectorAll('video')].map(v => ({ paused: v.paused, seeking: v.seeking, currentTime: v.currentTime, readyState: v.readyState, networkState: v.networkState, error: v.error?.message })),
      })), null, 2), contentType: 'application/json',
    });
  });
  test.beforeEach(async ({ page }, testInfo) => {
    await test.step('Search for and open a non-Premium video', async () => {
      await observeFullscreen(page);
      await searchPublicVideo(page, testInfo);
    });

    await test.step('Start playback and confirm the clock advances', async () => {
      await page.getByTestId('first-play-btn').click();
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await expect(page.getByTestId('bottom-controls')).toBeVisible();
      const { current } = await getPlayerTimes(page);
      await waitForClockToAdvance(page, current);
      await revealPlayerControls(page);
    });
  });

  test('opens a public search result and starts playback', async ({ page }) => {
    await test.step('Verify the selected page is a playable video page', async () => {
      await expect(page).toHaveURL(/deovr\.com\/[^/]+$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      expect((await getPlayerTimes(page)).duration).toBeGreaterThan(0);
    });
  });

  test('pause and resume update the playback clock', async ({ page }) => {
    await test.step('Pause and verify the clock remains still', async () => {
      await revealPlayerControls(page);
      const pauseButton = getPlayPauseControl(page, 'pause');
      await expect(pauseButton).toBeVisible();
      await pauseButton.click();
      const playButton = getPlayPauseControl(page, 'play');
      await expect(playButton).toBeVisible();
      const pausedAt = (await getPlayerTimes(page)).current;

      // The UI clock has one-second precision; wait through one tick to prove it stays paused.
      await page.waitForTimeout(1_200);
      expect((await getPlayerTimes(page)).current).toBeLessThanOrEqual(pausedAt + 1);
      await revealPlayerControls(page);
    });

    await test.step('Resume and verify the clock advances', async () => {
      const pausedAt = (await getPlayerTimes(page)).current;
      await revealPlayerControls(page);
      await getPlayPauseControl(page, 'play').click();
      await waitForClockToAdvance(page, pausedAt);
      await revealPlayerControls(page);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
    });
  });

  test('seeking forward keeps playback active and lands within five percent of the target', async ({ page }) => {
    await test.step('Seek forward to approximately 72 percent', async () => {
      const duration = (await getPlayerTimes(page)).duration;
      await seekTo(page, 0.72);
      const target = duration * 0.72;
      const tolerance = duration * 0.05;
      await expect.poll(async () => {
        const { current } = await getPlayerTimes(page);
        return Math.abs(current - target);
      }, { timeout: 20_000 }).toBeLessThanOrEqual(tolerance);
    });

    await test.step('Verify playback continues without pressing Play', async () => {
      await verifyPlaybackContinuesAfterSeek(page);
    });
  });

  test('seeking backward keeps playback active and lands within five percent of the target', async ({ page }) => {
    await test.step('Seek backward to approximately 24 percent', async () => {
      const duration = (await getPlayerTimes(page)).duration;
      await seekTo(page, 0.72);
      const forwardTarget = duration * 0.72;
      const tolerance = duration * 0.05;
      await expect.poll(async () => {
        const { current } = await getPlayerTimes(page);
        return Math.abs(current - forwardTarget);
      }, { timeout: 20_000 }).toBeLessThanOrEqual(tolerance);

      await seekTo(page, 0.24);
      const backwardTarget = duration * 0.24;
      await expect.poll(async () => {
        const { current } = await getPlayerTimes(page);
        return Math.abs(current - backwardTarget);
      }, { timeout: 20_000 }).toBeLessThanOrEqual(tolerance);
    });

    await test.step('Verify playback continues without pressing Play', async () => {
      await verifyPlaybackContinuesAfterSeek(page);
    });
  });

  test('changes quality without resetting position or stopping playback', async ({ page }, testInfo) => {
    await test.step('Change quality and verify selection, position, and continued playback', async () => {
      const beforeQualityChange = (await getPlayerTimes(page)).current;
      const changeStarted = Date.now();
      const qualityOptions = await openQualityMenu(page);
      await expect(qualityOptions.first()).toBeVisible();
      const optionCount = await qualityOptions.count();
      await testInfo.attach('quality-options', {
        body: JSON.stringify({ url: page.url(), options: await qualityOptions.allTextContents(), userAgent: await page.evaluate(() => navigator.userAgent) }, null, 2),
        contentType: 'application/json',
      });
      test.skip(
        optionCount < 2,
        `The selected free video exposes ${optionCount} quality option(s); an alternate rendition is required.`,
      );

      const selectedOption = qualityOptions.filter({ has: page.locator('svg[name="check"]') });
      await expect(selectedOption).toHaveCount(1);
      const alternateOption = qualityOptions.filter({ hasNot: page.locator('svg[name="check"]') }).first();
      const alternateLabel = (await alternateOption.innerText()).trim();
      await alternateOption.getByRole('button').click();

      const reopenedOptions = await openQualityMenu(page);
      const newSelectedOption = reopenedOptions.filter({ has: page.locator('svg[name="check"]') });
      await expect(newSelectedOption).toHaveText(alternateLabel);

      await page.getByTestId('quality-btn').click();
      await expect(page.getByTestId('quality-option')).toHaveCount(0);
      const afterQualityChange = (await getPlayerTimes(page)).current;
      expect(afterQualityChange).toBeGreaterThanOrEqual(beforeQualityChange - 2);
      expect(afterQualityChange).toBeLessThanOrEqual(beforeQualityChange + (Date.now() - changeStarted) / 1000 + 2);
      await revealPlayerControls(page);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await waitForClockToAdvance(page, afterQualityChange);
    });
  });

  test('fullscreen controls reflect the browser outcome and playback continues', async ({ page }, testInfo) => {
    test.skip(!await page.evaluate(() => document.fullscreenEnabled), 'Browser does not support or permit fullscreen.');
    await revealPlayerControls(page);
    const before = (await getPlayerTimes(page)).current;
    const started = Date.now();
    await page.getByTitle('Enter Fullscreen', { exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__fullscreenAttempt.status), { timeout: 15_000 })
      .toMatch(/^(granted|denied)$/);
    const outcome = await page.evaluate(() => window.__fullscreenAttempt);
    await testInfo.attach('fullscreen-outcome', { body: JSON.stringify(outcome), contentType: 'application/json' });
    if (outcome.status === 'denied') {
      await revealPlayerControls(page);
      await expect(page.getByTitle('Enter Fullscreen', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await waitForClockToAdvance(page, (await getPlayerTimes(page)).current);
      test.skip(true, 'Browser rejected the real fullscreen request: ' + outcome.error);
    }
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await revealPlayerControls(page);
    await expect(page.getByTitle('Exit Fullscreen', { exact: true })).toBeVisible();
    await page.getByTitle('Exit Fullscreen', { exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await revealPlayerControls(page);
    await expect(page.getByTitle('Enter Fullscreen', { exact: true })).toBeVisible();
    const after = (await getPlayerTimes(page)).current;
    expect(after).toBeGreaterThanOrEqual(before - 2);
    expect(after).toBeLessThanOrEqual(before + (Date.now() - started) / 1000 + 2);
    await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
    await waitForClockToAdvance(page, after);
  });
});
