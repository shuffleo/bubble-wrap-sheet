# Restoring the original press-to-pop feel

Build 6.0.0. Based on the user's uploaded `bubble-ui-old.html`, compared with the immediately preceding `bubble-wrap-studio.zip` (5.0.0). This update keeps the current photographic atlases, black UI, cut edges, keyboard mapping, sounds and sheet flex.

## Why it felt different

The old motion was a fixed-step mass/spring/damper, not a CSS transition or a hand-drawn bezier easing. Three changes in the later release reduced the sensation of pressure:

| Parameter | Uploaded old build | Previous build / uploaded preset | Restored default |
| --- | ---: | ---: | ---: |
| Press spring | 250 | 415 | 250 |
| Press damping | 20 | 23 | 20 |
| Held-press pop threshold | 0.75 | 0.59 | 0.75 |
| Collapse spring | 700 | 780 | 700 |
| Collapse damping | 34 | 43 | 34 |
| Crushed texture starts appearing | 0.48 compression | 0.35 compression | 0.48 compression |
| Crushed texture finishes appearing | 0.98 compression | 0.98 compression | 0.98 compression |
| Intact UV bulge / wrinkle amplitude | 0.10 / 0.035 | 0.055 / 0.018 | 0.10 / 0.035 |

A stiffer press spring reaches a *lower* threshold sooner. More collapse damping suppresses spring overshoot; meanwhile, the earlier texture blend starts showing folds before enough pressure has visually accumulated. The old shader also mixed its material in linear light (gamma 2.2 decoding/encoding), whereas the latest texture mix was in encoded grayscale. The update restores that blend option for intermediate frames only.

### Important distinction about tapping

Both original and preceding engines compressed on pointer down and committed a quick tap on pointer up. Both keyboard paths committed immediately. Holding the pointer down used the physical compression threshold. The new release deliberately keeps those input semantics: there is no timer, delayed input queue, or changed keyboard group selection.

Therefore, **Press tempo** affects a held press (and the shared unpopped spring's release/reinflation). For a short click, tap, or keyboard press, use **Collapse tempo**, **Snap kick**, and **Reveal starts at** to slow the visible ease. The audible pop and counter still fire once when the pop commits, not after a new delay.

### Fixed-step measurements, not device-performance measurements

A controlled isolated-bubble simulation at 120 Hz produced:

| Test | Old | Restored Original | Previous fast |
| --- | ---: | ---: | ---: |
| Held press to rupture | 133.3 ms | 133.3 ms | 75.0 ms |
| Immediate pop: peak compression | 1.0541 | 1.0541 | 1.0064 |
| Immediate pop: first reaching 0.98 compression | 91.7 ms | 91.7 ms | 125.0 ms |

The last row is why "old = everything slower" would be an inaccurate diagnosis. The old build built pressure longer and had much more rebound, but its final collapse was not slower at every point. Lowering Collapse tempo adds real time scaling while preserving the chosen damping ratio.

`evidence/motion-traces.json` contains all samples. `tests/fixtures/uploaded-old-physics.cjs` is the solver extracted verbatim from the exact old HTML, with that HTML's SHA256 recorded. Four comparison tests assert exact Float32 trace equality for presses released after 0, 4, 12 and 24 simulation steps. This verifies the spring response, not pixel-identical reproduction of the older material renderer.

## Sidebar

Open **Press & pop feel** for three motion-only presets:

- **Original**: the old spring coefficients, threshold and texture transition, selected by default.
- **Slower**: Collapse tempo 0.65, a smaller snap kick, less damping and later texture reveal.
- **Previous fast**: the preceding release's pressure/collapse and texture response for A/B comparison.

These preset buttons leave image grade, size, cut edges, audio, repeated-tap jiggle, sheet flex, keyboard mapping and popped progress unchanged. Editing individual motion fields switches the displayed profile to Custom.

### New controls

| Control | Default | What it changes |
| --- | ---: | --- |
| Press tempo | 1 | Speed of compression while holding. Lower is slower. |
| Collapse tempo | 1 | Time scale for the post-pop spring, including click and keyboard pops. |
| Snap kick | 10 | Initial collapse velocity; lower gives a less abrupt start. |
| Rebound allowance | 0.06 | Maximum overshoot beyond the flat position. |
| Reveal starts at | 0.48 | Compression before the popped texture begins to show. |
| Reveal completes at | 0.98 | Compression at fully popped appearance. |
| Reveal easing | 1 | Exponent of the smoothstep blend. Higher holds the inflated image longer. |
| Compression bulge | 0.10 | Transient compression of the intact image. |
| Wrinkle flex | 0.035 | Transient wrinkle displacement of the intact image. |
| Linear-light fade | On | Gamma-2.2 linear-light interpolation, matching the old material's approach. |

Existing press/collapse stiffness and damping remain editable. The old "Collapse speed" label is corrected to **Collapse stiffness**; actual speed is now independently adjustable via tempo.

Reveal start/end are validated together, with at least 0.05 separation; invalid values cannot feed a degenerate GLSL smoothstep. Tempo scales the spring coefficients as `k * tempo^2` and `c * tempo`; the snap velocity scales with collapse tempo. At tempo 1, the original integrator is unchanged.

The inflated and popped resting shader pixels were compared directly across the profiles. Only transition frames change; the collapsed branch deliberately retains the prior release's texture coordinates. Source crops, atlas images, geometry and neighbor texture overlap are unchanged.

## Settings compatibility

Preset format remains version 3. New exports contain all response controls; older files are accepted and receive defaults for missing fields. Explicit fields in an imported file are respected, including old faster spring values. Use **Original** afterward to restore only the response.

Storage uses `bubble-ui-studio-v6-motion`. On first upgrade from `bubble-ui-studio-v4`, only the response-related fields migrate to Original; unrelated saved custom settings are kept. Subsequent visits preserve v6 custom motion. Blocked storage falls back to JSON export/import.

## Boundaries

This is the current 2.5D reference-assisted material with the earlier spring response restored, not a return to the old lighting, crops or UI. The existing pop sounds, refill sound and retap behavior remain. No physical-device frame-rate, Safari latency or hardware haptic claim is made.
