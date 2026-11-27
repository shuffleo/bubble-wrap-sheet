# Verification fixtures

Browser tests and the atlas build write screenshots, logs, and JSON into this
folder. Those captures are gitignored. They are not part of the app.

Two material audits stay in git because `tests/studio.test.cjs` checks them
against the images embedded in the atlas:

- `crop-contours.jpg`
- `source-crop-review.jpg`

Regenerate both with `python3 scripts/build_atlas.py` when the sheet art changes,
then commit the new files together with `src/components/bubble-ui/core/bubble-audit.ts`.
