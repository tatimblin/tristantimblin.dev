# tools/media

The site's videos live in R2, not git.

- **Bucket:** `tristantimblin-dev-media`, served at
  `https://media.tristantimblin.dev` (custom domain; the r2.dev URL is off).
- **Sources:** `media/` at the repo root, gitignored. A file's path under it is
  its logical name: `media/videos/fabric.mp4` is `videos/fabric.mp4`.
  `tools/dotgrid/prepare-video.sh` and `prepare-carousel.sh` write their renders
  here. Raw originals (encoder inputs) stay in `media-src/`, also gitignored.
- **Keys:** immutable and hash-named, `videos/<name>.<sha256:8>.<ext>`, uploaded
  with the right `Content-Type` and `Cache-Control: public, max-age=31536000,
  immutable`. A changed file gets a new key; old keys are never overwritten or
  deleted.
- **Manifest:** `src/data/media.json` maps logical name to key. The site builds
  URLs with `media(name)` from `src/lib/media.ts`; set `PUBLIC_MEDIA_BASE` to
  point a build elsewhere.

## Adding or changing a video

```sh
cp my-clip.mp4 media/videos/        # or run a tools/dotgrid script
bun run media:push                  # --dry-run to preview
git add src/data/media.json
```

`media:push` hashes everything under `media/`, skips keys that already answer
on the public domain, uploads the rest with `wrangler r2 object put --remote`
(your `wrangler login`), and rewrites the manifest. Entries for files you don't
have locally are kept. CI never runs it: the build only reads the manifest.

A fresh checkout has no `media/`. To rebuild it, download the keys in
`media.json` from the bucket, or check out the pre-R2 commit (`3bab13a`, where
they were Git LFS files under `public/videos/`).

## CORS

`<dotted-grid>` draws the video into WebGL, so it loads with
`crossOrigin="anonymous"`; without a matching CORS response the canvas taints.
The policy is `cors.json`; apply changes with

```sh
bunx wrangler r2 bucket cors set tristantimblin-dev-media --file tools/media/cors.json
```

It allows GET/HEAD (and the `Range` header) from the production hosts, Pages
previews (`https://*.tristantimblin.pages.dev`) and a few localhost ports. R2
can't wildcard a port, so a new dev port must be listed. It exposes
`Content-Length`, `Content-Range` and `Accept-Ranges` for range requests.

## Other projects

One bucket per project, `<project>-media`, at
`<project>-media.tristantimblin.dev`. Keep the hostname flat: Universal SSL
doesn't cover nested subdomains like `media.<project>.tristantimblin.dev`. This
site's bucket is the exception, at `media.`.
