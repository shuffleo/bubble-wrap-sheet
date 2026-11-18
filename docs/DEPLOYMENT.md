# Deploying and sharing Bubble Wrap

## Netlify

Demo Link: https://bubblewrapsheet.netlify.app/

For drag-and-drop deployment, upload **the contents of `dist/`** from the release. The separate deployment ZIP has `index.html` at its root for this purpose. The source archive also includes this directory. For a GitHub-connected Netlify deployment, use the included `netlify.toml`: build command `npm run build`, publish directory `dist`, Node 22.

The archive does not publish or modify the existing live site. Your Netlify deployment remains unchanged until you redeploy.

The standalone HTML embeds the application, recordings and material, so there is no missing audio-file dependency. The separate processed WAVs are still included for version control, auditioning, and reproducible builds. Social crawlers, by contrast, need public image URLs: deploy the favicon/social files too.

## SEO and social metadata

Edit `site.config.json` for the canonical URL, title, description and image paths, then run `npm run build`. Metadata is generated into the static HTML head; crawlers do not need to run the WebGL application to discover it.

Included: canonical URL; page title/description; Open Graph title, description, URL, site name, type, locale, image dimensions/type/alt; X/Twitter large-image card; basic WebSite/WebApplication JSON-LD; an accessible page heading; no-JavaScript explanation; `robots.txt`; `sitemap.xml`; and a web manifest. No ratings, medical claims, reviews, affiliation, or search-ranking guarantees are invented.

The landscape card is 1200 x 630 and the alternate square card is 1080 x 1080. Favicons include multiple ICO sizes and 16/32/48/96 px PNGs, an Apple 180 px icon, and 192/512 px manifest icons. All use the actual single rendered bubble, not a generic symbol. Runtime controls continue using the live WebGL bubble.

The main homepage is indexable. `?panel=show` uses the same canonical and switches its robots meta to `noindex,follow` when the studio mounts; it is an opt-in UI, not a private admin area. Crawlers that do not execute JavaScript may not see that runtime noindex, but the canonical still points to `/`.

After publishing, check these endpoints:

- `/favicon.ico`
- `/assets/social/bubble-wrap-social-v8.png`
- `/assets/social/bubble-wrap-square-v8.png`
- `/assets/audio/processed/refresh.wav`
- `/robots.txt` and `/sitemap.xml`

Verify sharing previews with the destination platform's own preview/debugger. Existing social caches may retain the old card until they refetch it. Asset filenames are versioned to help avoid stale sharing images. Actual indexing, rich-result presentation, and platform cache invalidation are outside the local checks.

Primary metadata references: https://ogp.me/ and https://developers.google.com/search/docs/appearance/favicon-in-search .

## Development notes

The local server serves only public `dist` files and correctly accepts query strings. `SERVE_DIR` can point it at another build; `PORT` defaults to 5173. No server is needed for `standalone.html`. Audio playback still needs a qualifying user gesture, and browser/system mute settings can silence it.

`public/_headers` is copied into `dist` for Netlify. The single-file build intentionally embeds inline scripts/styles and `data:` assets; a deployment-specific Content-Security-Policy must allow those or supply matching hashes. No strict CSP is claimed here.
