# Bubble Wrap v8.0.0 - release verification

Verified 18 November 2026. This report describes the delivered build, not the
unchanged public Netlify deployment. Historical reports are in `docs/history/`.

## Results

| Check | Result |
|---|---|
| Strict TypeScript core compilation | Pass, TypeScript 5.8.3 |
| Unit tests | 158 passed, 0 failed |
| Current browser/deployment assertions | 64 passed, 0 failed |
| React adapter syntax | 6 TSX files passed; not host integration |
| Source audio identity | All four originals match the supplied WAV bytes |
| Embedded audio identity | All four runtime WAVs match processed files byte-for-byte |
| Visual QA | Desktop, mobile, mid-slide frame, icons and both sharing cards inspected |

The unit and browser suites total **222 passing checks**. Counts do not include
historical milestone logs, nested assertion calls, or the six syntax checks.

Commands: `npm test`, `npm run test:react-syntax`, `npm run test:browser`.
Evidence: `evidence/release-unit-log.txt`, `evidence/release-react-log.txt`, and
`evidence/release-browser-results.json` plus the accompanying browser log.

## What was exercised

**Focus and mobile:** mouse click followed by game-key input does not outline
the sheet; Tab/Shift+Tab restores its visible outline; subsequent game-key input
retains the accessibility ring. Returning to pointer input suppresses it. At
320, 390, 520 and 760 px, the brand text is hidden and the interactive header
bubble remains. Its membrane is circular and its wrapper is at least 44 px.
Both bottom controls retain 56 px targets. Two real emulated touch pointers pop
two bubbles without scrolling; touch reset uses the recorded slide excerpt.

**Refresh:** the default is Slide in/out, size S. The outgoing snapshot retains
popped membranes; the incoming grid is inflated except at cut edges. Both use
one canvas and one instanced draw with temporary additional instances. Old
positions move right, new positions enter from the left, and temporary data is
released at completion. The header stays interactive while sheet input is
locked. Repeated refresh commands do not stack sounds or sheets. Resize and
WebGL context loss cancel the exchange safely. Reduced-motion preferences
suppress directional travel.

**Empty/full timing:** both Space and the dim-but-enabled refresh icon work on
an empty sheet. The default minimum is 0.72 s. Full-sheet playback uses the
complete 1.129354 s PCM recording at rate 1. Muting suppresses playback without
skipping the timeline. Refresh insitu remains selectable and keeps its
wave-refill behavior. Its named backup opens with recorded audio available.

**Audio:** the default bank contains the three supplied pop recordings and the
supplied refresh WAV, not generated fixtures. PCM is predecoded before the
first gesture where supported. A running AudioContext schedules actual sample
buffers. Offline-context tests pop and refresh using these samples. Unit tests
check source hashes, embedded bytes, stereo 48 kHz decoding, 42/87/96 ms primary
pop durations, attacks within 3 ms, headroom, boundary fades, full-clean
alternatives, shuffle selection, and bounded variation/timing helpers.

**Keyboard/studio:** all 47 keys pop one member of their mapped group; held keys
do not auto-repeat. Both seeds change on refresh without changing material
contrast. The sidebar only mounts via `?panel=show`; no panel icon exists. Its
68 controls include both refresh modes. Control-field typing does not pop
bubbles. Audio credit and recorded-sample status are present.

**Deployment/metadata:** a local Node server returned correct content types and
successful responses for the page with query strings, favicon, PNG icons,
landscape/square sharing cards, processed WAVs, robots, sitemap and manifest.
Static title, description, canonical, Open Graph, X card and JSON-LD are checked.
PNG dimensions match declared metadata. The portable HTML embeds its favicon
and all application assets/audio. `dist` excludes source code and original WAVs.

## Environment and limitations

Node 22.16.0, npm 10.9.2, global TypeScript 5.8.3, Chromium
144.0.7559.96 with software SwiftShader, Playwright headless browser automation.
The package pins the tested TypeScript version. Registry DNS/cache access failed;
a fresh dependency-backed npm install and lockfile generation were not verified.

Browser interaction tests load actual compiled HTML into an opaque-origin page,
including an offline browser context. This also exercises the storage fallback;
local-storage persistence on a normal hosted origin is not re-certified here.
Public asset routes were independently tested through the local HTTP server.
A fixed 150 ms resize wait was replaced with an explicit viewport/layout-ready
condition after a software-renderer timing failure. The failed run is retained
under `evidence/history/`; the final full run passed.

No physical phone was connected. These checks do not certify iPhone/Android
vibration, Safari audio behavior, perceived headphone loudness, or real-device
60 fps. Haptics remain capability-dependent; see `HAPTICS.md`. React adapters
were syntax-checked only. This is a 2.5D reference-assisted material, not full
cloth simulation or volumetric scattering.

SEO files were not published to the user's domain by this task. Social platform
caches, search indexing, and actual platform card previews are not verified.
See `docs/DEPLOYMENT.md` for publishing the complete `dist/` directory.
