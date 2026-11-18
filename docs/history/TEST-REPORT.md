# Bubble wrap - fresh sheets, sampled audio and credits

Build **7.1.0**, 18 November 2026.

## Current completed verification

The strict TypeScript core build passed. **135 unit tests and 126 browser assertions passed** in the completed suites below, with no failed assertions in those runs. These include the source-comparison tests that preserve the restored Original press/pop response.

| Completed suite | Passed | Current evidence |
| --- | ---: | --- |
| Core unit tests, including new PCM/selection/timeline cases | 135 | current-unit-log.txt |
| Mouse, keyboard accessibility, reset, audio, resize | 17 | interaction-results.json |
| Multi-touch, cancellation and WebGL recovery | 14 | touch-recovery-results.json |
| S default, URL-only panel, rerolls, saved preferences, UI, audio import, mobile | 58 | fresh-general-browser-results.json |
| Real Web Audio cleanup, randomized samples, exports, adaptive refill, footer | 28 | audio-browser-results.json |
| Feature-spoofed native-label routing, cancellation and disposal | 9 | native-feedback-results.json |
| **Total assertions in completed suites** | **261** | current-verification.json |

All evidence paths in this table are under `evidence/`. The six React TSX adapters were additionally syntax-transpiled. Their host-React integration was not runtime-tested. The default `npm run test:browser` invokes the five completed browser suites above.

An earlier combined `fresh_browser.py` run reached 64 passing assertions but exceeded the runner time limit in its remaining CDP/native-fallback portion. Its results are NOT included in the total above. General tests and focused native-feedback tests were subsequently run separately to completion. The focused cancellation check is DOM-event simulation; direct native-label activation checks use real trusted browser touch events. Neither is an iPhone hardware test.

## Requested changes checked

- S = 52 CSS pixels on initial load; older v6 preferences migrate to S without losing custom material or restored motion.
- Normal URLs mount no settings icon, sidebar or crop dialog. Exact `?panel=show` opens the existing Bootstrap Offcanvas automatically. Missing, misleading and duplicate query forms are rejected. This is a UI gate, not authentication.
- Both random seeds change together on page load/reload, Space/Fresh Sheet, or either seed reroll action. Material permutation changes are checked as well as the numbers. Non-seed preferences survive. Existing settings persist using a storage test double.
- Real mouse interaction, balanced keyboard groups, icon controls, cut-cell exclusion, corner dragging/release, resize, multi-touch and context recovery continue working. Global corner release handlers now handle capture loss/retargeted release robustly.
- Android feedback requests bounded pulses independent of mute. Native-label fallback allows only genuine direct-tap activation and cleans up its nodes. Unsupported/blocked paths do not break interaction.
- Sidebar footer contains the user-requested Anthousai / Freesound / CC0 credit with official destinations and a separate fallback status. Desktop and mobile screenshots were visually reviewed.

## Audio processing and synchronization checked

No user pop or refill audio files were available. Tests use explicitly GENERATED padded WAV fixtures, not Anthousai recordings. No real recording-specific analysis or quality judgment is claimed.

Checks cover outer-silence removal, sub-5 ms test-fixture onset, bounded peak levels, click-prevention endpoints, DC offset, stereo anti-phase safety, unchanged source buffers, invalid/silent input rejection, clipped-source warnings, valid cleaned WAV export, JSON measurement export, sample bank replacement, no consecutive same-file choice and randomized source rate/gain/tone.

The browser tests verify separate pop/refill banks; complete trimmed refill at original rate for a full sheet; 0.18-second tail excerpts for one cell; explicit source offsets/durations; matching visual endpoints; mute; and seed rerolls. Unit tests use the shared clock directly to confirm reset completion after delayed frames and cancellation when a bubble is popped again during refill. This is not a physical-device audio latency measurement.

## Evidence images

- `evidence/fresh-desktop.png`: actual normal page, S default, no settings icon.
- `evidence/fresh-controls.png`: actual opted-in settings panel.
- `evidence/fresh-mobile.png`: actual mobile normal page.
- `evidence/audio-controls-credit.png`: audio tools and footer credit.
- `evidence/audio-controls-mobile.png`: mobile panel with the credit visible.

## Boundaries

Chromium/Playwright uses a software WebGL renderer. No physical iPhone/Android motor, Safari playback, real-device 60 fps or Bluetooth/audio-output latency was verified. iPhone tap feedback is a best-effort native WebKit switch activation, not programmable feedback for every bubble in a drag trail or for external keys. Read HAPTICS.md for primary-source support details.

Live-origin local-storage persistence remains unverified because local navigation is blocked by this environment. Persistence/migration are tested with a memory double. Node HTTP query routing is checked separately. Reduced-motion preferences intentionally may skip visual refill animation. Imported audio lasts for the browser session; JSON presets do not embed it. The packaged HTML is a self-contained browser file, not a hosted public URL.
