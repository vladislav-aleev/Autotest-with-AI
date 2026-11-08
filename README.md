# DeoVR Playwright E2E

[![Playwright E2E](https://github.com/vladislav-aleev/Autotest-with-AI/actions/workflows/playwright.yml/badge.svg)](https://github.com/vladislav-aleev/Autotest-with-AI/actions/workflows/playwright.yml)

Green CI means no unexpected failures, not full coverage — see the results table below.

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

The configuration uses `channel: 'chromium'` to run full Chromium in both headed and modern headless mode. Quality switching passed with ordinary `npm test` on macOS CI, but Windows and Linux CI still exposed only one quality and skipped that scenario. To exercise quality switching in a visible browser, run `npm run test:headed`; this is verified on macOS. The scenario still requires at least two available qualities.

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

All four jobs passed in [CI run 42519126889](https://github.com/vladislav-aleev/Autotest-with-AI/actions/runs/42519126889) for commit `c844846` on November 8, 2026. Each job publishes actual counts and reasons in its `E2E results` annotation and `reports/summary.json` artifact.

| Verified environment | Passed | Failed | Skipped | XFAIL |
| --- | --- | --- | --- | --- |
| Windows CI, headless | 6 | 0 | 1: quality | 0 |
| macOS CI, headless | 7 | 0 | 0 | 0 |
| Ubuntu CI, headless | 6 | 0 | 1: quality | 0 |
| macOS CI, headed | 7 | 0 | 0 | 0 |

Real fullscreen was granted and its enter/exit assertions passed in all four jobs, including `npm run test:headed` on hosted macOS. This does not establish compatibility with every interactive Mac's permissions or window-manager configuration. A genuine browser rejection is reported as a skip after checking that the Enter button remains and playback continues. Local Windows validation of the new full-Chromium configuration was blocked at browser startup by `spawn UNKNOWN`, even after reinstalling Chromium; the Windows result above comes from CI.

With the [previous default headless shell](https://github.com/vladislav-aleev/Autotest-with-AI/actions/runs/42512435413), all three headless jobs exposed only 1080p for the same free video (`72jjd1`). Switching to [full Chromium's modern headless mode](https://playwright.dev/docs/browsers#chromium-new-headless-mode) exposed five qualities on macOS: 1080p, 2160p, 2880p, 3840p, and 4096p, matching its headed run. Windows and Linux still exposed only 1080p. All desktop user-agent strings were identical; changing the browser build helped on macOS but did not eliminate environment differences. The exact codec or site-side selection mechanism is unconfirmed. Quality attachments preserve the URL, options, and user agent; missing alternatives are skipped as unmet prerequisites.

Earlier Windows failures showed a reached seek target followed by a stalled clock. With the same 60-second recovery allowance on every OS, both seek tests passed in all four jobs without pressing Play. This is consistent with a transient stall but does not prove buffering was its cause. There is no Windows exception or suppressed product defect; a stall beyond the allowance fails and retains diagnostics.

## AI workflow

I used Codex to generate and revise the project, and Claude as a second reviewer of the result. I chose the scenario, decided which findings to accept, and checked the fixes against CI runs. Codex implemented the code changes; I reviewed the assertions and questioned results that were green without exercising the intended behavior.

Key prompts:

- “Write a stable end-to-end autotest using Playwright for this checklist. Include the complete project setup and instructions in the README for running it.”
- “Start from the homepage, find a video through search, verify the video page opens and that it is not Premium, then continue with the remaining checks.”
- “Do not press Play after seeking. Capture a fresh timestamp after fullscreen exit, validate hh:mm:ss, and check seek positions within ±5%.”
- “Remove runner-specific XFAIL rules, share helpers, use skip for missing quality prerequisites, and verify fullscreen with a headed macOS run.”
- “Try channel: 'chromium' so Playwright uses full Chromium instead of the headless shell. Check whether quality options appear; if not, explain the headed command in the Run section.”

AI helped me inspect controls, generate fixtures, and interpret output. During review, I accepted findings about a stale final timestamp, automatic Play recovery that hid failures, an invalid parser, a Play/Pause locator that ignored state, broad quality selectors, swallowed Escape errors, and unjustified Windows XFAIL logic. I asked Codex to correct these issues and checked the resulting reports. I also rejected the conclusion that an absent Pause button alone proved a product bug: the original stall's cause remains unconfirmed.
