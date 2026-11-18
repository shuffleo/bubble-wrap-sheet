

# Bubble Wrap

Click, drag, tap or use a physical keyboard to pop those bubbles. Works on desktop and mobile.

**Demo Link:** https://bubblewrapsheet.netlify.app/

![Bubble Wrap](assets/social/bubble-wrap-social-v8.png)

## Hidden interactions

- Pull the invisible corner grab areas to flex the sheet.
- The 47 physical keys in the four QWERTY rows map spatially to the bubbles.
- Spacebar refreshes the sheet, even when it is already fresh.
- Enter on the focused sheet pops its next bubble.
- Append `?panel=show` to the URL to open the settings sidebar.

## Build and deploy

Requires Node.js 22 or newer.

```sh
npm install
npm run build   # outputs dist/
npm run dev     # http://127.0.0.1:5173
```

Netlify builds with `npm run build` and publishes `dist/` via `netlify.toml`. No environment variables or backend needed. Update `site.config.json` if you deploy to a different domain.

## Credits and assets

**Sound effects** by [Anthousai](https://freesound.org/people/Anthousai/) on [Freesound](https://freesound.org/) under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

**Libraries:** [Bootstrap 5.3.6](https://getbootstrap.com/), [Jamie Owen](https://github.com/jamieowen/glsl-blend) `glsl-blend` functions, TypeScript. Licenses are in `licenses/`.
