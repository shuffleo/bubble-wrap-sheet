# Architecture and refresh behavior

## Source and output

`src/main.ts` owns the DOM demo; `index.template.html` supplies semantic controls, styling and the library/sidebar shell. `scripts/build.mjs` compiles the strict core, embeds the vendored Bootstrap bundle, type-checked modules, photographic atlases, and processed PCM recordings, then writes `index.html`, `standalone.html`, `dist/`, and the insitu backup. `site.config.json` is the one source of public SEO URLs and copy.

The current renderer uses WebGL 2 directly. It is not a Three.js or React Three Fiber runtime. React adapters exist separately under `src/components/bubble-ui/` and are optional.

## Existing material and input

DOM measurements establish CSS-pixel coordinates. Instanced triangular subdivisions of a hexagonal cell carry the bubble radius, material variants, cut parameters, neighbor data, compression and bounce. A single shader blends adjoining photograph patches while applying flexible-sheet deformation. Irregular boundary tests are shared by CPU eligibility/hit testing and GLSL clipping. Cut bubbles remain collapsed and are excluded from the counter and keyboard groups.

Bubble springs use fixed 1/120-second substeps and typed arrays, without React state updates in the animation loop. The Original motion profile is unchanged. Keyboard groups follow four spatial bands, allocate one bubble per press, and ignore editing fields and key-repeat events. Pointer capture, multiple pointers, corner deformation and cancellation remain supported.

## Slide in/out

At reset, the engine records the old sheet's per-instance attributes into immutable arrays. Its photographic variants, cut edge, and already-compressed membranes stay on the outgoing sheet. The engine then rerolls both seeds, creates a new grid, and initializes its intact cells inflated (cut cells remain flat).

The current grid plus frozen old sheet are uploaded together. A per-instance role distinguishes the stationary header, outgoing sheet, and incoming sheet. They share the same program, GPU context, material textures and single instanced draw; no DOM screenshot or second canvas is used. Temporary geometry is released at completion.

The normalized transport curve is `6t^5 - 15t^4 + 10t^3`, with zero velocity and acceleration at either endpoint. Both sheets travel left-to-right; a gap separates them. A small shared vertex curl during travel avoids looking like two rigid cards. The sidebar exposes the minimum duration and curl amplitude.

The audio schedule supplies the common elapsed-time clock. It is not tied to the spring solver's capped frame delta, so a slow frame does not stretch the sound/animation schedule. A running AudioContext supplies time; wall time is the fallback while silent/unavailable. Mute suppresses the sample, not the timeline. A full sheet uses the complete cleaned recording; sparse or empty slides use an ending excerpt no shorter than the configured minimum, bounded by the available recording.

Input on the moving sheet is gated until the exchange finishes; the header fidget remains usable. Reentrant reset commands do not add duplicate voices or snapshots. Resize and graphics-context loss release the snapshot and cancel stale refill playback, leaving a valid fresh sheet. Reduced-motion preference disables directional transport.

## Refresh insitu

Mode `0` preserves the previous diagonal wave refill. Mode `1` is the new slide default. The common sound timeline and legacy reset-only analytic spring remain available in insitu. The main press/pop solver is not replaced by the reset curve.

`backups/refresh-insitu.html` is rebuilt with all current audio/accessibility fixes and starts in insitu, using a separate preference namespace. The exact pre-change HTML is also retained as `backups/refresh-insitu-v7-original.html` for forensic comparison; it predates the embedded recordings and is not the recommended deployment.

## Focus policy

`bubble-focus.ts` tracks pointer ownership only on the interactive sheet. Pointer interaction marks its region; normal game-key presses cannot turn that mark into a focus ring. Tab removes the mark before native navigation, restoring `:focus-visible`. Other controls retain their normal focus styling. Programmatic focus not preceded by a pointer remains eligible for the focus ring; no `blur()` hack removes keyboard accessibility.

## Audio and honest limits

The bundle contains the actual processed user recordings, decoded from PCM16 base64 before the first gesture when AudioBuffer construction is supported. Older browsers can allocate after AudioContext creation. Original WAVs are never fetched at runtime. Imports replace the bank only in the current session. Synthesis is retained for optional fallback and crinkles.

This remains a baked-lighting 2.5D material, not physically relightable photography, translucent arbitrary-DOM refraction or full cloth simulation. Haptics are capability-dependent; feature detection is not verification of a motor.
