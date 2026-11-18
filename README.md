# Bubble Wrap

A tactile, full-screen bubble-wrap sheet: click, drag, tap with multiple fingers, or use a physical keyboard to pop realistic grayscale membranes. Recorded pops, spring-driven pressure, irregular cut edges, and a fresh sheet on Space make it a small, self-contained browser fidget.

**Demo Link:** https://bubblewrapsheet.netlify.app/

This is **v8.0.0**. The demo URL is the user's deployment; this archive does not automatically update it.

## Run or deploy

The release contains two convenient builds:

- **`standalone.html`**: open directly in a browser. JavaScript, shaders, material atlases, favicon, and all four processed audio recordings are embedded. No CDN, audio import, or network connection is needed to play.
- **`dist/`**: upload this complete directory to Netlify or another static host. It also contains public favicons, sharing images, processed WAV files, `robots.txt`, a sitemap, and a web manifest. **Publish the whole directory, not just its HTML, so social crawlers can retrieve the images.**

To build from source, use Node.js 22 or newer:

```sh
npm install
npm run build
npm run dev
```

Open `http://127.0.0.1:5173`. Netlify's included `netlify.toml` builds with `npm run build` and publishes `dist`. No environment variables or backend are needed. Update `site.config.json` before deploying to a different canonical domain.

## How to use it

Click or tap a bubble; hold and drag to pop a trail. Tap a popped bubble again for a quiet crinkle and bounce. Pull the invisible corner grab areas to flex the sheet. The single bubble in the header springs back rather than popping; on narrow screens it replaces the brand text.

The 47 physical keys in the four QWERTY rows map spatially to bubble groups. Each press pops one random remaining bubble in its group. Groups differ by at most one bubble, cut edges are excluded, and held keys do not auto-repeat. **Space refreshes the sheet**, including when it is already fresh. Tab navigates accessible controls; Enter on the focused sheet pops its next bubble. Clicking then typing does not create an unwanted sheet focus ring.

The bottom icons refresh and mute. Both have 56-pixel targets. Refresh stays dim on a fresh sheet but remains usable. Audio starts after a user gesture; system/browser restrictions still apply.

## Hidden studio

Append **`?panel=show`** to open the Bootstrap sidebar automatically. There is no visible settings icon. This is a convenience switch, **not authentication**. The studio URL is marked `noindex` at runtime and canonicalizes to the public homepage.

The panel exposes size XS-S-M-L-XL (default **S**), the keyboard map and optional per-bubble labels, material blending and tone, cut edges, membrane motion, sound variation, and render quality. It includes crop/atlas inspection, audio measurements, cleaned-WAV downloads, JSON preset import/export, and local preference storage when the browser allows it.

**Slide in/out** is the default refresh: the old sheet travels right while a new inflated one arrives from the left, with eased movement and subtle flex. **Refresh insitu** preserves the previous wave reinflation. Select either under **Fresh sheet transition**. A ready-to-open insitu version is at `backups/refresh-insitu.html`.

All exposed random seeds change together on load, refresh, or either seed reroll. Material grading and motion preferences remain unchanged. Reduced-motion preferences suppress directional sheet travel.

## Technical approach

The standalone application is strict TypeScript compiled to an inline bundle, with one native **WebGL 2** canvas and instanced GLSL rendering. DOM surfaces register pixel-aligned rectangles; typed arrays own spring state and update GPU buffers outside React. The material combines corrected photographic crops with generated collapsed-film variants, neighboring texture blending, and shared sheet deformation. It is a reference-assisted **2.5D** material, not volumetric scattering or a full cloth simulation.

During slide refresh, a frozen copy preserves the old sheet's popped appearance. New and old sheets share the existing context, atlases, shader and instanced draw. Both animation and sound follow one timeline. Full-sheet refresh plays the complete **1.129-second** cleaned recording; sparse and empty slides use a shorter excerpt with a **0.72-second** default minimum. Insitu retains its shorter single-bubble refill.

Three curated pop recordings are predecoded before the first gesture, chosen from a balanced shuffle bag without consecutive repeats, and varied in pitch, level, and tone. The originals, main-crack edits, full cleaned alternatives, processing script, measurements, and hashes are included.

`src/components/bubble-ui/` also includes optional **React 19** adapters. They share the same engine; the static build does not load React, Three.js, Tailwind, or React Three Fiber. The React example is syntax-checked, not a tested Next.js application.

## Credits and assets

**Sound effects by [Anthousai](https://freesound.org/people/Anthousai/) on [Freesound](https://freesound.org/) under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).** Creator/license attribution was supplied by the user. Original source sound-page IDs were not supplied. Original procedural crinkles and the synthesis fallback are separate project code.

**Libraries:** [Bootstrap 5.3.6](https://getbootstrap.com/docs/5.3/components/offcanvas/) (Offcanvas, MIT), selected [Jamie Owen `glsl-blend`](https://github.com/jamieowen/glsl-blend) functions (MIT), TypeScript (Apache-2.0); optional React adapters (React, MIT). Upstream bundled notices are in `licenses/`. Python asset scripts use NumPy, SciPy, Pillow, SoundFile and Playwright; they are development tools, not browser runtime dependencies. Controls use inline SVG paths, not an external icon font.

**Visual assets:** the favicon and sharing cards are captures of the actual rendered material, with system-font text added by the build script. See `ASSET-NOTES.md`.

## Reproduce and verify

```sh
npm test                         # strict core build + unit tests
npm run test:react-syntax         # syntax only, not host integration
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
npm run test:browser              # current release browser/deploy regression
npm run audio                    # regenerate the processed WAVs and analysis
npm run atlas                    # rebuild photographic atlases/crop audits
npm run build
npm run social                   # capture icons/cards, then rebuild public files
npm run package                  # source, deploy and processed-audio archives
```

`CHROMIUM_PATH` can specify an installed Chromium. Social-image generation needs Liberation Sans or DejaVu Sans, or `SOCIAL_FONT`/`SOCIAL_FONT_BOLD`; no font files are redistributed. Build uses the pinned TypeScript 5.8.3, with a global compiler fallback when npm is unavailable. Registry access was unavailable during packaging, so a clean npm install and lockfile generation were not verified.

See `TEST-REPORT.md`, `docs/ARCHITECTURE.md`, `docs/AUDIO-ANALYSIS.md`, `docs/DEPLOYMENT.md`, and `HAPTICS.md`. Prior milestone reports and browser scripts are retained for history, not counted as current release passes. Physical iPhone/Android haptics, Safari audio, and real-device 60 fps are **not** certified by the emulated browser checks.
