# DeoVR Playwright E2E

[![Playwright E2E](https://github.com/vladislav-aleev/Autotest-with-AI/actions/workflows/playwright.yml/badge.svg)](https://github.com/vladislav-aleev/Autotest-with-AI/actions/workflows/playwright.yml)

This project tests the public video-viewing journey on DeoVR with Playwright Test.

## User Path

**Open the DeoVR homepage → search for “Hanoi Train Street” → choose a result without a Premium marker → open the video → start playback → pause and resume → seek → change quality → enter and exit fullscreen → verify playback continues.**

The test starts at [https://deovr.com/](https://deovr.com/) and selects a video through the site's own search. It does not store a video URL in the test. The first result without a Premium marker is used; the test verifies that result before opening it and confirms the video page is playable without signing in.

I chose this path because:

1. It works without login or a Premium subscription.
2. It allows checking the main video player functions.
3. Watching videos is one of the most fundamental functions on the site. If playback doesn't work well, users won't sign up or purchase a subscription.

## Preconditions

- The public DeoVR homepage and video CDN are reachable.
- Search returns at least one video that is not marked as Premium.
- Playback is available without signing in.
- For the quality-change test, the selected free video must expose at least two quality renditions.

## Test Scenarios

Each desktop player test independently searches from the homepage, opens the first non-Premium result, and starts playback. This keeps failures isolated and makes the search-to-watch path part of every player test. The Pixel 7 project runs a separate mobile smoke test for the same search-to-playback journey.

| Test | Steps | Expected result |
| --- | --- | --- |
| Find and start a public video | Search from the homepage; choose the first result without a Premium marker; open it; start playback. | The search result has no Premium marker, its video page opens, the title matches, and the playback clock advances without login. |
| Pause and resume | Pause; wait through one displayed clock tick; resume. | The play control appears while paused and the clock stays still within its one-second display precision. After resuming, the pause control appears and the clock advances. |
| Seek forward | Seek to approximately 72% of the timeline. | The displayed position lands within ±5% of the target and playback remains active without pressing Play again. |
| Seek backward | Seek to approximately 72%, then to 24%. | The displayed position lands within ±5% of the backward target and playback remains active without pressing Play again. |
| Change quality | Open quality settings and select a different rendition. | At least two options are required. The newly selected option is marked selected, playback does not reset to the beginning or pause, and the clock advances. If only one option is available, Playwright reports an explicit expected failure (XFAIL), not a passing test. |
| Fullscreen | Click Enter Fullscreen, then Exit Fullscreen. | The control changes to Exit Fullscreen and back to Enter Fullscreen. Playback position is preserved, the pause control remains active, and the clock advances from the time captured immediately after exiting. Real browser fullscreen is checked only when granted; unsupported or denied transitions are recorded as a test annotation. |

## Reliability and Coverage

- The scenarios are separate Playwright tests with shared `beforeEach` setup and named `test.step` entries.
- The player renders into a canvas, so the test reads the visible playback clock rather than relying on `HTMLVideoElement.currentTime`.
- The time parser supports both `mm:ss` and `hh:mm:ss` and rejects malformed or out-of-range values.
- Timeline targets use a ±5% tolerance. The test never presses Play automatically after a seek; an unexpected pause is reported as a failure.
- Quality options are located inside the quality menu. The test does not pass when no alternative rendition exists.
- Fullscreen UI state is required on all platforms. The browser's real fullscreen API is recorded separately because a browser or operating system may deny the request.
- The full player-control suite runs in desktop Chromium. Pixel 7 emulation checks the mobile search-to-playback smoke path; mobile player controls use a different layout and are not represented as covered by the desktop-control tests. GitHub Actions runs both projects on Windows, macOS, and Linux.

## Requirements

- Node.js 22, 24, or 26 (see [Playwright system requirements](https://playwright.dev/docs/intro#system-requirements))
- npm
- Internet access to DeoVR and its video CDN

## Install

```bash
npm ci
npx playwright install chromium
```

## Run

Run the desktop player scenarios and Pixel 7 mobile smoke test:

```bash
npm test
```

Run only one project:

```bash
npx playwright test --project="Desktop Chrome"
npx playwright test --project="Pixel 7"
```

Run with a visible browser:

```bash
npm run test:headed
```

Open Playwright's interactive runner:

```bash
npm run test:ui
```

The HTML report is written to `playwright-report/`. Open it with `npm run report`. Traces, screenshots, and video recordings are retained under `test-results/` when a test fails.

## CI and Tested Operating System

The [GitHub Actions workflow](.github/workflows/playwright.yml) runs on `windows-latest`, `macos-latest`, and `ubuntu-latest`. The project was run locally on Windows 11 with Playwright 1.65.0 and Chromium. The GitHub Actions matrix is configured for macOS and Linux; those hosted-runner results should be checked in the workflow before claiming they were verified.

The live search currently returns a free video with only one `1080p` rendition in this environment. The desktop quality scenario reports an explicit expected failure (XFAIL) in that situation instead of reporting a false pass; this does not turn the missing quality option into a pass. Use a free video with multiple renditions to exercise the quality-change assertions. The mobile smoke test passed on the local Windows 11 run; the full mobile player-control suite is not claimed as covered.

## AI Workflow

**Tool used:** OpenAI Codex in the Codex desktop app. Playwright Test was used for the browser automation.

**Key prompts:**

1. “Read this DeoVR take-home assignment and recommend the end-to-end flow that would best demonstrate my QA skills. Explain why you chose it.”
2. “Write a stable end-to-end autotest using Playwright for this checklist. Set up the complete project and add README instructions for installing dependencies and running the test.”
3. “Replace the hard-coded video URL with a search flow. Start at https://deovr.com/, search for a video that is not Premium, verify that the result opens the video page and is not Premium, and then run the player checks.”
4. “Review the test as a picky QA engineer. Check whether each assertion proves the expected behavior, and identify logical errors, fragile locators, unreliable waits, missing scenario details, and mismatches between the test and README.”
5. “Fix the issues found in review: capture a fresh playback-time baseline immediately after exiting fullscreen; do not press Play after seeking, so a pause-after-seek defect remains visible; parse both mm:ss and hh:mm:ss; assert seek positions within ±5% of the target; require an alternate quality and report an explicit expected failure when only one is available; scope quality locators to the menu and close it with its control, then assert it is closed. Split the suite into independent tests with named steps, add a Pixel 7 mobile smoke test, and keep the README accurate.”
6. “Make fullscreen coverage portable across visible Playwright Chromium on Windows, macOS, and Linux. Always assert that the control changes from Enter Fullscreen to Exit Fullscreen and back. Check the real browser fullscreen state only when the browser grants it, and add an explicit annotation when it is unsupported or denied. Add a GitHub Actions matrix for all three operating systems and document which OS was tested locally.”

**What the AI did well:** Codex inspected the live DeoVR page, found that the player uses a canvas instead of a native video element, and identified the visible clock and player test IDs. It generated the Playwright project, ran it against the real site, and used failure output to adjust the search and player interactions.

**What I caught and had corrected during review:**

- The final playback assertion reused a timestamp captured before quality and fullscreen actions. I required a new baseline immediately after fullscreen exit and an assertion that the clock advances from it.
- The test pressed Play after seeking, which could hide a pause-after-seek defect. I removed that recovery action and made continued playback an assertion.
- The time parser treated a value such as `1:02:03` as 62 seconds. I required support for both `mm:ss` and `hh:mm:ss` and validation of the displayed duration.
- The seek check accepted positions far from the target. I replaced it with an absolute ±5% tolerance.
- The quality step could pass without changing quality, and its locators were too broad. I made an alternate rendition mandatory, report XFAIL when only one is available, and scoped the selector to the quality menu.
- The test swallowed Escape errors even though Escape did not reliably close the menu. I changed it to close the menu with its control and verify that it disappears.
- The original suite grouped too many actions together, and the README claimed a page-title check while the code checked the heading. I split the checks into independent tests with named steps and aligned the documentation with the actual assertion.
- Fullscreen behavior depends on browser and operating-system support. I made the UI state change mandatory, while recording whether the browser granted real fullscreen.

I checked the revised assertions against DeoVR and used the Playwright reports and traces to investigate failures.

**Known live-site result:** The current free search result exposes only one quality, so the quality scenario is reported as an expected failure (XFAIL). This finding comes from checking the actual quality menu, not from assuming that an unavailable quality change passed.
