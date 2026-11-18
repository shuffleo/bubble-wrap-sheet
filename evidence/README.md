# Verification evidence

Files beginning `release-` belong to v8.0.0. `release-browser-results.json` lists
64 current browser/deployment assertions; `release-unit-log.txt` records 158
passing unit tests. `release-react-log.txt` is syntax-only adapter verification.
Screenshots are actual Chromium WebGL frames, not generated concept images.
The slide-mid frame freezes the common timeline at 50% for reproducibility.

`crop-contours.jpg` and `source-crop-review.jpg` are the current material audits.
`history/` preserves earlier milestone logs, screenshots, and explicitly generated
audio test fixtures. Those fixture WAVs are NOT the samples used by the app.
The real recordings and processing report are in `assets/audio/`.

The npm-lock logs record failed network/cache attempts; no successful clean
registry install is claimed. A checked-in lockfile could not be produced here.
