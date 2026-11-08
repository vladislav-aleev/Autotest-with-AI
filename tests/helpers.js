import { expect } from '@playwright/test';

export const HOME_URL = 'https://deovr.com/';
const SEARCH_TERM = 'Hanoi Train Street';
const SEARCH_RESULTS = 'main article';

export function parseMediaTime(value) {
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

export async function getPlayerTimes(page) {
  const timeParts = page.getByTestId('bottom-controls').locator('p span');
  await expect(timeParts).toHaveCount(2);
  const [currentText, durationText] = await timeParts.allTextContents();
  const current = parseMediaTime(currentText);
  const duration = parseMediaTime(durationText);
  expect(duration, 'The video duration must be greater than zero').toBeGreaterThan(0);
  return { current, duration };
}

export async function waitForClockToAdvance(page, previousTime, timeout = 20_000) {
  await expect.poll(async () => (await getPlayerTimes(page)).current, { timeout })
    .toBeGreaterThan(previousTime);
}

export async function searchPublicVideo(page, testInfo, mobile = false) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'VR Videos' })).toBeVisible();

  if (mobile) {
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
}

// Observe the native promise without changing its result, timing, or user activation.
export async function observeFullscreen(page) {
  await page.addInitScript(() => {
    window.__fullscreenAttempt = { status: 'idle' };
    const nativeRequest = Element.prototype.requestFullscreen;
    if (!nativeRequest) return;
    Element.prototype.requestFullscreen = function (...args) {
      window.__fullscreenAttempt = { status: 'pending' };
      try {
        const result = nativeRequest.apply(this, args);
        result.then(
          () => { window.__fullscreenAttempt = { status: 'granted' }; },
          error => { window.__fullscreenAttempt = { status: 'denied', error: String(error) }; },
        );
        return result;
      } catch (error) {
        window.__fullscreenAttempt = { status: 'denied', error: String(error) };
        throw error;
      }
    };
  });
}
