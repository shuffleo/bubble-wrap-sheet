# Bubble wrap - fresh sheets and URL-only controls

Version **7.1.0**. A self-contained WebGL2 bubble-wrap experience. The corrected membrane atlases, grayscale material, restored Original spring response, corner bending, 47-key mapping and one-canvas renderer are retained.

## Open and configure

Open `index.html` in a WebGL2-capable browser. Assets, Bootstrap Offcanvas, shaders, and code are embedded; the preview needs no CDN.

The initial bubble size is **S (52 CSS pixels)**. The normal URL has **no settings icon, sidebar, or crop dialog**. To open the sidebar, add exactly `?panel=show` to the browser address:

```text
index.html?panel=show
http://localhost:5173/?panel=show
```

With another query parameter already present, append `&panel=show`. The panel opens automatically and can be closed. Reload the opted-in URL to open it again. The query is a UI preference, **not authentication or a security boundary**; this remains client-side code.

For source editing:

```sh
npm install
npm run build
npm run dev
```

The development server accepts query strings and binds to loopback by default. This archive is not a deployed public website. The build uses a local TypeScript compiler or a global installation when available.

## A different sheet every time

Both exposed seeds, `edgeSeed` and `variantSeed`, are regenerated together on initial load/reload, Fresh Sheet, Space refresh, or either **New seeds** button in the sidebar. The seed keys are discovered centrally so future seed settings are included too.

Values come from `crypto.getRandomValues` when available, with `Math.random` as a fallback. Each seed differs from the immediately preceding value. Material reseeding also excludes the previous modulo-320 permutation, so a changed number cannot silently reuse the same atlas arrangement. This does not promise a globally unique seed forever.

Rerolling changes both inflated/collapsed texture assignment and the ragged cut boundary. It does not erase custom grading, spring, audio, or size settings. Cut cells are recalculated and remain collapsed; their exclusion can change the total slightly. Keyboard groups are rebuilt for the new intact cells and remain balanced.

Fresh Sheet remains dimmed/disabled at zero pops, as previously requested. **Space and the sidebar seed buttons can still create another random sheet at zero pops**, without playing an unnecessary refill cue. Resetting popped cells retains wave reinflation and its sound.

User preferences save even when the panel is not mounted. Previous v6 preferences migrate once to S while preserving grading and customized motion. Subsequent explicit size choices persist. Saved seed values are rerolled on the next load. Explicit preset import/manual numeric editing can restore specific values for inspection; the next load or reset randomizes them again.

## Sound and credit

The footer of the opt-in sidebar now says **Sound effects by Anthousai on Freesound under CC0**, linking the creator and license. It also reports whether recordings are loaded, so the procedural fallback is not falsely credited to a sample creator.

**No pop/refill WAV uploads were available during this update.** They have not been substituted or analyzed. The existing synthesized sounds therefore remain the bundled defaults. The generated test WAVs are not shipped as playable application effects.

The importer is ready for the recordings: **Audio & performance -> Import pop samples / Import refill sound**. It trims outer silence, keeps a small attack margin and natural tail, balances peak levels, and adds tiny boundary fades. Pop playback uses a no-repeat shuffle bag plus adjustable pitch, gain and tone variation. JSON analysis and cleaned WAV downloads are available beside the imported files. Imports remain session-only; preset files do not include audio bytes.

Full-sheet refill plays the complete trimmed sound at original pitch. Partial-sheet refill uses a shorter ending segment with fades; one bubble defaults to 0.18 seconds. The reset animation shares that duration and clock, instead of adding an extra spring tail after the audio. Muted playback still animates; new resets cancel old refill voices. Original press/pop motion is unchanged.

[AUDIO-NOTES.md](AUDIO-NOTES.md) documents the processing, adaptive timing, attribution, generated test fixtures and limits.

## Haptics

`bubble-haptics.ts` separates tactile feedback from audio. A muted pop can still request feedback.

- Supporting Android browsers: a 13 ms Vibration API pulse at pop; a 7 ms request for repeat-tap crinkle. The sidebar includes a test pulse and status.
- Supporting iPhone/WebKit: an actual pointer tap is routed through a transparent label linked to a native checkbox switch. No scripted `.click()` is used. The native feedback is a tap/release tick, **not controllable per-pop vibration during a drag or external-keyboard input**.
- Unsupported/blocked feedback fails safely without preventing sound or popping. A successful API return is not treated as verification that a motor vibrated.

Physical iPhone/Android hardware has not been tested here. Device settings, browser support, and embedding restrictions can suppress feedback. Open the application directly rather than relying on an embedded chat preview for hardware testing. See [HAPTICS.md](HAPTICS.md) for primary-source references and exact limitations.

## Adjust the feel

In the opted-in sidebar, **Press & pop feel** offers Original, Slower, and Previous fast motion-only presets. Original remains the default. Collapse tempo affects mouse, touch, and keyboard transitions without adding an artificial input delay. **Popped texture transition** adjusts reveal timing, easing, and linear-light blending. [MOTION-CHANGES.md](MOTION-CHANGES.md) retains the source comparison and solver measurements from v6.

## Interaction

Click or tap to pop; drag for a trail; repeat taps crinkle/bounce already popped cells. Invisible corner hit areas bend the sheet and spring back. Cut membranes are permanently flattened and excluded from the counter.

```text
`1234567890-=
qwertyuiop[]\
asdfghjkl;'
zxcvbnm,./
```

Each physical-key press selects one random unpopped cell in its group; holding does not auto-repeat. Space refreshes. Form input and browser shortcuts are protected. Key labels and the live mapping are available only in the opted-in panel.

## Architecture and integration

One shared WebGL2 canvas and one instanced draw call render the registered surfaces. Physics runs imperatively in typed arrays with fixed timesteps, not through React state updates. There are 65 bounded settings, including the four additional audio variation/timing controls. Reseed and audio import actions are buttons, not animation-loop state.

React adapters are in `src/components/bubble-ui/`; include `src/app/bubble-demo.css` or equivalent styles. The optional peer dependencies are React 19 and Bootstrap. The standalone HTML requires neither installation at runtime. The core is strictly type-checked. React adapters are syntax-checked only; host integration has not been runtime-verified here.

## Tests

```sh
npm test
pip install -r requirements-dev.txt
npm run test:browser
```

The browser suite uses Chromium/Playwright and a software renderer. The new v7 tests use inline HTML with real `about:blank?panel=show` query parsing. Storage is an explicit memory test double because browser navigation to the local HTTP origin is blocked in this environment. The local Node server's query routing is checked separately over HTTP. Haptics tests verify calls and trusted-event routing, not physical vibration. [TEST-REPORT.md](TEST-REPORT.md) identifies current tests separately from historical evidence.

## Assets

The material assets are unchanged, reference-derived photographs and derived crushed-film textures. See [ASSET-NOTES.md](ASSET-NOTES.md) and the bundled MIT notices in `licenses/`. The blue edge reference is not a texture.
