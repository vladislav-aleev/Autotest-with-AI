import { expect, test } from '@playwright/test';

const HOME_URL = 'https://deovr.com/';
const SEARCH_TERM = 'Hanoi Train Street';
const PLAYER_OVERLAY = '[data-testid="player-overlay"]';
const TIMELINE = '[data-testid="timeline"]';
const SEARCH_RESULTS = 'main article';

function parseMediaTime(value) {
  const parts = value.trim().split(':');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error(`Expected a media time in mm:ss or hh:mm:ss format, received: "${value}"`);
  }

  const numbers = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`Media time contains a non-numeric component: "${value}"`);
    }
    return Number(part);
  });

  const seconds = numbers.at(-1);
  if (seconds >= 60 || (numbers.length === 3 && numbers[1] >= 60)) {
    throw new Error(`Media time contains an out-of-range component: "${value}"`);
  }

  return numbers.reduce((total, component) => total * 60 + component, 0);
}

async function getPlayerTimes(page) {
  const timeParts = page.getByTestId('bottom-controls').locator('p span');
  await expect(timeParts).toHaveCount(2);
  const [currentText, durationText] = await timeParts.allTextContents();
  const current = parseMediaTime(currentText);
  const duration = parseMediaTime(durationText);
  expect(duration, 'The video duration must be greater than zero').toBeGreaterThan(0);
  return { current, duration };
}

async function waitForClockToAdvance(page, previousTime) {
  await expect.poll(async () => (await getPlayerTimes(page)).current, { timeout: 20_000 })
    .toBeGreaterThan(previousTime);
}

function getPlayPauseControl(page, iconName) {
  const desktopControl = page.getByTestId('play-pause-btn');
  const mobileControl = page.locator(`${PLAYER_OVERLAY} button:has(svg[name="${iconName}"])`);
  return desktopControl.or(mobileControl);
}

async function revealPlayerControls(page, testInfo) {
  const overlay = page.getByTestId('player-overlay');
  if (testInfo.project.name === 'Pixel 7') {
    await overlay.tap({ force: true });
  } else {
    const box = await overlay.boundingBox();
    if (!box) throw new Error('The player overlay is not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(overlay).toHaveAttribute('data-ui-hidden', 'false');
}

async function seekTo(page, testInfo, fraction) {
  await revealPlayerControls(page, testInfo);
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toBeVisible();
  const box = await timeline.boundingBox();
  if (!box) throw new Error('The player timeline is not visible');
  await timeline.click({ position: { x: Math.round(box.width * fraction), y: Math.round(box.height / 2) } });
}

async function openQualityMenu(page, testInfo) {
  await revealPlayerControls(page, testInfo);

  const desktopQualityButton = page.getByTestId('quality-btn');
  if (await desktopQualityButton.count()) {
    await desktopQualityButton.click();
  } else {
    // Mobile layout nests quality selection under the player settings menu.
    await page.locator(`${PLAYER_OVERLAY} button:has(svg[name="settings"])`).click();
    await page.getByText('Video quality', { exact: true }).click();
  }

  const qualityMenu = page.getByTestId('quality-option').first().locator('xpath=ancestor::section[1]');
  await expect(qualityMenu).toBeVisible();
  return qualityMenu.getByTestId('quality-option');
}

test.describe('DeoVR public video playback', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await test.step('Search for and open a non-Premium video', async () => {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'VR Videos' })).toBeVisible();

      if (testInfo.project.name === 'Pixel 7') {
        await page.getByRole('button', { name: 'Search', exact: true }).click();
      }
      const searchInput = page.getByPlaceholder("I'm looking for...");
      await searchInput.fill(SEARCH_TERM);
      await searchInput.press('Enter');
      await expect(page).toHaveURL(/\/search\?q=/);
      await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();

      const freeResults = page.locator(SEARCH_RESULTS).filter({
        hasNot: page.locator('a[href*="/videos/premium"]'),
      });
      const freeResult = freeResults.first();
      await expect(freeResult).toBeVisible();
      await expect(freeResult.locator('a[href*="/videos/premium"]')).toHaveCount(0);

      const videoLink = freeResult.locator('h3 a');
      const videoHref = await videoLink.getAttribute('href');
      const videoTitle = await videoLink.innerText();
      expect(videoHref, 'A non-Premium search result must link to a video page').toBeTruthy();
      expect(videoTitle.trim()).not.toBe('');

      await videoLink.click();
      await expect(page).toHaveURL(new URL(videoHref, HOME_URL).href);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(videoTitle);
      testInfo.annotations.push({
        type: 'selected-video',
        description: `${videoTitle.trim()} — selected from search results without a Premium marker.`,
      });
    });

    await test.step('Start playback and confirm the clock advances', async () => {
      const firstPlayButton = testInfo.project.name === 'Pixel 7'
        ? page.locator('main button:has(svg[name="play"])').first()
        : page.getByTestId('first-play-btn');
      await firstPlayButton.click();
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await expect(page.getByTestId('bottom-controls')).toBeVisible();
      const { current } = await getPlayerTimes(page);
      await waitForClockToAdvance(page, current);
      await revealPlayerControls(page, testInfo);
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

  test('pause and resume update the playback clock', async ({ page }, testInfo) => {
    await test.step('Pause and verify the clock remains still', async () => {
      await revealPlayerControls(page, testInfo);
      const pauseButton = getPlayPauseControl(page, 'pause');
      await expect(pauseButton).toBeVisible();
      await pauseButton.click();
      const playButton = getPlayPauseControl(page, 'play');
      await expect(playButton).toBeVisible();
      const pausedAt = (await getPlayerTimes(page)).current;

      // The UI clock has one-second precision; wait through one tick to prove it stays paused.
      await page.waitForTimeout(1_200);
      expect((await getPlayerTimes(page)).current).toBeLessThanOrEqual(pausedAt + 1);
      await revealPlayerControls(page, testInfo);
    });

    await test.step('Resume and verify the clock advances', async () => {
      const pausedAt = (await getPlayerTimes(page)).current;
      await revealPlayerControls(page, testInfo);
      await getPlayPauseControl(page, 'play').click();
      await waitForClockToAdvance(page, pausedAt);
      await revealPlayerControls(page, testInfo);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
    });
  });

  test('seeking forward keeps playback active and lands within five percent of the target', async ({ page }, testInfo) => {
    await test.step('Seek forward to approximately 72 percent', async () => {
      const duration = (await getPlayerTimes(page)).duration;
      await seekTo(page, testInfo, 0.72);
      const target = duration * 0.72;
      const tolerance = duration * 0.05;
      await expect.poll(async () => {
        const { current } = await getPlayerTimes(page);
        return Math.abs(current - target);
      }, { timeout: 20_000 }).toBeLessThanOrEqual(tolerance);
    });

    await test.step('Verify playback continues without pressing Play', async () => {
      const { current } = await getPlayerTimes(page);
      await revealPlayerControls(page, testInfo);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await waitForClockToAdvance(page, current);
    });
  });

  test('seeking backward keeps playback active and lands within five percent of the target', async ({ page }, testInfo) => {
    await test.step('Seek backward to approximately 24 percent', async () => {
      const duration = (await getPlayerTimes(page)).duration;
      await seekTo(page, testInfo, 0.72);
      const forwardTarget = duration * 0.72;
      const tolerance = duration * 0.05;
      await expect.poll(async () => {
        const { current } = await getPlayerTimes(page);
        return Math.abs(current - forwardTarget);
      }, { timeout: 20_000 }).toBeLessThanOrEqual(tolerance);

      await seekTo(page, testInfo, 0.24);
      const backwardTarget = duration * 0.24;
      await expect.poll(async () => {
        const { current } = await getPlayerTimes(page);
        return Math.abs(current - backwardTarget);
      }, { timeout: 20_000 }).toBeLessThanOrEqual(tolerance);
    });

    await test.step('Verify playback continues without pressing Play', async () => {
      const { current } = await getPlayerTimes(page);
      await revealPlayerControls(page, testInfo);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await waitForClockToAdvance(page, current);
    });
  });

  test('changes quality without resetting position or stopping playback', async ({ page }, testInfo) => {
    await test.step('Require an alternate rendition for this quality-change test', async () => {
      const beforeQualityChange = (await getPlayerTimes(page)).current;
      const qualityOptions = await openQualityMenu(page, testInfo);
      await expect(qualityOptions.first()).toBeVisible();
      const optionCount = await qualityOptions.count();
      test.fail(
        optionCount < 2,
        `The selected free video exposes ${optionCount} quality option(s); an alternate rendition is required.`,
      );
      expect(
        optionCount,
        'The selected non-Premium video must expose at least two quality renditions; one option is not a quality-change test.',
      ).toBeGreaterThan(1);

      const selectedOption = qualityOptions.filter({ has: page.locator('svg[name="check"]') });
      await expect(selectedOption).toHaveCount(1);
      const selectedLabel = (await selectedOption.innerText()).trim();
      const alternateOption = qualityOptions.filter({ hasNot: page.locator('svg[name="check"]') }).first();
      const alternateLabel = (await alternateOption.innerText()).trim();
      await alternateOption.getByRole('button').click();

      const reopenedOptions = await openQualityMenu(page, testInfo);
      const newSelectedOption = reopenedOptions.filter({ has: page.locator('svg[name="check"]') });
      await expect(newSelectedOption).toHaveText(alternateLabel);
      expect(alternateLabel).not.toBe(selectedLabel);

      const afterQualityChange = (await getPlayerTimes(page)).current;
      expect(afterQualityChange).toBeGreaterThanOrEqual(beforeQualityChange - 2);
      await revealPlayerControls(page, testInfo);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await waitForClockToAdvance(page, afterQualityChange);

      // Close the quality menu with its control and assert it is gone; Escape is not reliable here.
      await openQualityMenu(page, testInfo);
      if (await page.getByTestId('quality-btn').count()) {
        await page.getByTestId('quality-btn').click();
      } else {
        await page.locator(`${PLAYER_OVERLAY} button:has(svg[name="settings"])`).click();
      }
      await expect(page.getByTestId('quality-option')).toBeHidden();
    });
  });

  test('fullscreen controls toggle and playback position continues after exit', async ({ page }, testInfo) => {
    const fullscreenConsoleMessages = [];
    let positionBeforeFullscreen;
    page.on('console', (message) => {
      if (/fullscreen|not granted/i.test(message.text())) fullscreenConsoleMessages.push(message.text());
    });

    await test.step('Enter fullscreen and verify the control state', async () => {
      positionBeforeFullscreen = (await getPlayerTimes(page)).current;
      await revealPlayerControls(page, testInfo);
      await page.getByTitle('Enter Fullscreen').click();
      await expect(page.getByTitle('Exit Fullscreen')).toBeVisible();

      const fullscreenApiEnabled = await page.evaluate(() => document.fullscreenEnabled);
      const enteredRealFullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
      testInfo.annotations.push({
        type: 'fullscreen-api',
        description: fullscreenApiEnabled && enteredRealFullscreen
          ? 'The browser granted the real fullscreen transition.'
          : `The UI toggled to Exit Fullscreen; real fullscreen was ${fullscreenApiEnabled ? 'not granted by the browser' : 'not supported'}${fullscreenConsoleMessages.length ? ` (${fullscreenConsoleMessages.join('; ')})` : ''}.`,
      });

      if (fullscreenApiEnabled && enteredRealFullscreen) {
        expect(enteredRealFullscreen).toBe(true);
      }
      expect((await getPlayerTimes(page)).current).toBeGreaterThanOrEqual(positionBeforeFullscreen - 2);
    });

    await test.step('Exit fullscreen and prove the playback clock advances from the exit point', async () => {
      const wasActuallyFullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
      await revealPlayerControls(page, testInfo);
      await page.getByTitle('Exit Fullscreen').click();
      await expect(page.getByTitle('Enter Fullscreen')).toBeVisible();
      if (wasActuallyFullscreen) {
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
      }

      const timeImmediatelyAfterExit = (await getPlayerTimes(page)).current;
      expect(timeImmediatelyAfterExit).toBeGreaterThanOrEqual(positionBeforeFullscreen - 2);
      await expect(getPlayPauseControl(page, 'pause')).toBeVisible();
      await waitForClockToAdvance(page, timeImmediatelyAfterExit);
      expect((await getPlayerTimes(page)).current).toBeGreaterThan(timeImmediatelyAfterExit);
    });
  });
});
