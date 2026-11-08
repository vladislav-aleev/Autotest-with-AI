# DeoVR Playwright E2E

[![Playwright E2E](https://github.com/vladislav-aleev/Autotest-with-AI/actions/workflows/playwright.yml/badge.svg)](https://github.com/vladislav-aleev/Autotest-with-AI/actions/workflows/playwright.yml)

**Green CI means no unexpected failures, not complete coverage. Quality and fullscreen can be skipped for unmet prerequisites. The revised suite contains no XFAIL rules.** Each job publishes actual passed / failed / skipped / XFAIL counts and reasons in its summary and `reports/summary.json` artifact.

## User path and rationale

[DeoVR homepage](https://deovr.com/) → search for “Hanoi Train Street” → choose the first result without a Premium marker → verify its URL and heading → play → exercise player controls.

This works without login or a Premium subscription, covers the main player functions, and tests a fundamental reason to visit DeoVR. Poor playback can discourage registration and subscription purchases.

## Run

Use Node.js 24 and npm:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:headed
npm run report
```

Linux CI installs system dependencies with `npx playwright install --with-deps chromium`. For one project use `npx playwright test --project="Desktop Chrome"` or `--project="Pixel 7"`.

## Scenarios

Preconditions: DeoVR/search/CDN are reachable; search returns a free, playable video. Each test starts in a fresh context and independently searches. Mobile coverage is a search-to-playback smoke test; the six player scenarios run on desktop Chromium.

| Scenario | Actions | Expected result |
| --- | --- | --- |
| Search and play | Search, open a result without a Premium marker, press Play | Result URL and video heading match; the clock advances without login. |
| Pause / resume | Pause, observe for 1.2 seconds, resume | Play/Pause titles reflect state; paused time stays within one displayed tick; resumed time advances. |
| Seek forward | Click 72% of the timeline | Position is within ±5% of total duration around the target; playback resumes autonomously within 60 seconds. |
| Seek backward | Click 72%, then 24% | Both positions meet the tolerance; playback resumes autonomously within 60 seconds. |
| Quality | Select another rendition, reopen settings, check selection, close menu | Selection changes; position stays within elapsed time and rounding tolerance; playback continues. Skip if fewer than two options exist. |
| Fullscreen | Request fullscreen, inspect native promise outcome, exit when granted | Granted: actual fullscreen and button state agree; exit preserves position and playback. Denied: Enter Fullscreen remains and playback advances; the unavailable transition is skipped with the browser's reason. |

Shared search and validated `mm:ss` / `hh:mm:ss` parsing live in `tests/helpers.js`. Seek recovery never presses Play. Failures retain traces, screenshots, video, and a player-state snapshot. Buffering has a bounded 60-second allowance on every OS; a longer stall remains a failure. Tests have a 180-second budget and no retries.

## Verified environments and limitations

The previous [CI run](https://github.com/vladislav-aleev/Autotest-with-AI/actions/runs/42435526512) succeeded on Windows, macOS, and Ubuntu but allowed XFAIL. Job status alone does not reveal its exact pass/XFAIL counts; those counts are not reconstructed as evidence.

| Current revision | Passed | Failed | Skipped | XFAIL |
| --- | --- | --- | --- | --- |
| Windows CI, headless | Pending | — | — | 0 by design |
| macOS CI, headless | Pending | — | — | 0 by design |
| Ubuntu CI, headless | Pending | — | — | 0 by design |
| macOS CI, headed | Pending | — | — | 0 by design |

Local runs use Windows 11. The additional macOS job executes `npm run test:headed` on a hosted Mac; it does not reproduce every interactive user's Mac permissions or window-manager configuration.

Quality options are recorded with the video URL and user agent. Local observations showed one 1080p option; the candidate reported options up to 4096p on a Mac. The cause is unconfirmed: neither subscription status nor OS alone is established as the explanation. Compare quality attachments across jobs. Missing alternatives are test-data prerequisites and are skipped, never classified as a product bug.

Earlier Windows logs showed target seek positions but no advancing clock and no Pause control. They establish a failure, not its cause: buffering, decoding, and player state require trace evidence. The revised test gives buffering more time and preserves assertions on every platform. No product defect is declared or suppressed without a reproducible diagnosis and issue reference.

## AI workflow

Codex generated and revised the project. The candidate supplied the scenario, reviewed assertions and CI logs, and challenged misleading green results. Additional review was supplied in the conversation; the identity of a second AI tool was not provided, so this project does not claim a verified run with that tool or manual authorship of AI-written patches.

Key prompts:

- “Write a stable end-to-end autotest using Playwright for this checklist. Include the complete project setup and instructions in the README for running it.”
- “Start from the homepage, find a video through search, verify the video page opens and that it is not Premium, then continue with the remaining checks.”
- “Do not press Play after seeking. Capture a fresh timestamp after fullscreen exit, validate hh:mm:ss, and check seek positions within ±5%.”
- “Remove runner-specific XFAIL rules, share helpers, use skip for missing quality prerequisites, and verify fullscreen with a headed macOS run.”

AI helped inspect controls, generate fixtures and interpret output. Review caught a stale final timestamp, automatic Play recovery that hid failures, an invalid parser, a Play/Pause locator that ignored state, broad quality selectors, swallowed Escape errors, and unjustified Windows XFAIL logic. These were corrected in code. The earlier claim that an absent Pause button proved a product bug was withdrawn; the cause remains under investigation.
