# AGENTS.md

Guidance for AI agents working in this repo.

## Repo layout

- **`src/`** — the Astro site (static output). Pages in `src/pages/`, shared
  shell in `src/layouts/Layout.astro` (the blog's in `BlogLayout` /
  `PostLayout`), global CSS in `src/styles/global.css`, the homepage's tiles in
  `src/widgets/`, posts as `src/content/txt/<slug>.mdx` with their images
  (`images/`) beside them. Data lives in `src/data/`: the widgets' JSON/CSV
  (written by the nightly fetchers in `tools/`, see `.github/workflows/nightly.yml`)
  and the media manifests. A change to only content, data or docs skips the
  full Playwright suite in CI (build, smoke, deploy only).
- **`theme/*`** — the site's look, as workspace packages (Bun workspaces,
  consumed as `@whois/*`, source exports, no build step):
  - `@whois/design-system` — the design system (tokens + Astro/CSS components).
  - Web Components (custom elements): `stories-heading`, `wobble-text`.
- **The halftone elements live in their own repo**,
  [tatimblin/dotgrid](https://github.com/tatimblin/dotgrid):
  `@tristimb/dotted-grid` (`<dotted-grid>`) and `@tristimb/video-carousel`
  (`<video-carousel>`), installed from GitHub Release tarballs (see the URLs in
  `package.json`). To change them, release there and bump the URL here.
- **`tests/`** — Playwright, against the built site (`bun run test`);
  `bun run test:unit` runs the unit tests beside the code (`src/**/*.test.ts`
  and `theme/*/src/**/*.test.ts`; a bare `bun test` sees `src/` only — see
  `bunfig.toml`). Specs import `test` from `tests/fixtures/test.ts`, not
  `@playwright/test`: it answers the media host from two tiny local clips
  (`tests/fixtures/media-stub.*`, the only videos in git), so the suite never
  streams from R2.

## Page views — GoatCounter

Pages are counted by hosted GoatCounter (`tristantimblin.goatcounter.com`):
`src/lib/analytics/count.ts` loads the pinned `count.v5.js` on the production
host only (never on localhost, a preview, or under `navigator.webdriver`) and
counts each `astro:page-load` under the page's build-time
`<meta name="hit-path">` (Layout's `hitPath` prop, normalised by
`src/lib/analytics/path.ts`). The nightly `tools/pageviews/fetch.mjs` reads the
API into `src/data/pageviews.json`, which the readers widget, the post strip
and `/txt` read at build time; counts under 10 are not shown.
`tests/hit.spec.ts` covers it.
- Run the dev server with **`bun run dev`** (copies the fleet demo, then
  `bunx astro dev` under Node). Do **not** use
  `bunx --bun astro dev` — it crashes the HMR WebSocket.

## The fleet demo — a prebuilt dependency

The VS Code embed in `/txt/no-honey-we-have-a-dashboard-at-home` (the extension
and the monaco-vscode-api workbench page) lives in its own repo,
[tatimblin/vscode-fleet](https://github.com/tatimblin/vscode-fleet), and arrives
as `@tristimb/fleet-demo`: a GitHub Release tarball pinned by URL in
`package.json`. No npm publish, and no monaco build here. The tarball carries:

- `dist/` — the built workbench page. `copy:fleet-demo` copies it to
  `public/fleet-demo/` (gitignored); the root `build` and `dev` both run it
  first, and so does Playwright's `webServer` (via `build`).
- `src/element.ts` / `element.css` — the `<fleet-demo>` poster/launch element,
  imported as source by `src/components/FleetDemo.astro`.

To change the demo: edit it in vscode-fleet, `bun run release <version>` there,
then bump the tarball URL here and `bun install`. To try an unreleased build
locally, `bun run build` in vscode-fleet and copy its `demo/dist` over
`public/fleet-demo/`. `tests/fleet-demo.spec.ts` boots the embed in the post;
the demo's own build and bundle-size guard live in vscode-fleet.

## Media — videos live in R2, not git

Videos are served from the R2 bucket `tristantimblin-dev-media` at
`https://media.tristantimblin.dev`. `src/data/media.json` maps each logical
name (`videos/fabric.mp4`) to an immutable, hash-named key
(`videos/fabric.63d79c4a.mp4`); pages call `media(name)` from
`src/lib/media.ts`, the one place the base URL lives. Never commit video files
or add them to `public/`. To add or change one: put the render in `media/`
(gitignored; `tools/dotgrid` writes there), run `bun run media:push`, commit
`media.json`. Details in `tools/media/README.md`.

**One bucket per project:** `<project>-media` served at
`<project>-media.tristantimblin.dev`, so projects' assets never mix. Keep the
hostname flat: Universal SSL covers `*.tristantimblin.dev` but not a nested
`media.<project>.tristantimblin.dev`. This site is the exception, at `media.`.

## Post embeds — experiments from other repos

A live experiment in a post (the painterly Sutro scene, from the private
`tatimblin/painterly-scene`) is `<Embed name="…" poster={…} alt="…" />`
(`src/components/Embed.astro`). Its repo's release uploads a built ES module
and its assets to the project's bucket under `v<version>/`, and
`src/data/embeds.json` pins the version and the host. `<Embed>` shows the
poster, `import()`s `<base>/v<version>/index.js` when the frame nears the
viewport, calls its `mount(el, { assetBase })`, and calls `destroy()` once it's
far away or on navigation. Nothing is installed and CI needs no secrets. To
move a post to a new release, cut it in the experiment's repo and bump the
version here. `PUBLIC_EMBED_BASE` points a build's R2 embeds at a local
stand-in (`url` ones ignore it).
`tests/embed.spec.ts` routes the bucket to a stub module (set
`PAINTERLY_DIST=<painterly-scene>/dist` to use the real bundle).

**GitHub Pages variant** (a public repo, e.g. `tatimblin/meetLolla`): no
bucket. The repo's `pages.yml` deploys the repo as tagged to GitHub Pages on
every `v*` tag, built `dist/` included, and the entry is
`{"version", "url": "https://tatimblin.github.io/<repo>/", "entry": "dist/index.js"}`:
`assetBase = url`, `src = <url><entry>`, and the media stays at its usual repo
paths. Pages serves only the latest deployed tag at that unversioned URL, so
`version` is informational (the release this site was checked against) and a
new tag changes what the site loads: tag only releases that keep `mount()`'s
contract. Not jsDelivr: its GitHub CDN refuses repos over 50 MB (meetLolla's
audio is more), intermittently 403s them and caches the 403.
Per-entry opt-outs, for any host: `"webgl": false` mounts without WebGL (it's
required by default); `"reducedMotion": "mount"` mounts under
prefers-reduced-motion because the module turns its own motion off (otherwise
only a `stillFrame` embed mounts then); `"touchAction"` replaces the demo
page's `none` (`auto` for a module that scrolls inside its own root). A module
that draws DOM instead of a canvas has its stage labelled (`role="region"`)
instead. `tests/fixtures/test.ts` 404s all of `https://tatimblin.github.io/**`;
`serveEmbed(page, name, stub)` routes one embed to `embed-stub.js` (canvas) or
`embed-stub-dom.js` (DOM).

**Demos** are the full-screen form: `src/content/demos/<slug>.md` (all
frontmatter: title, a one-line description, date, tags, `embed` — a key in
`embeds.json` — the poster and its alt, optional notes/credits, draft) renders
at `/demo/<slug>/` (`src/pages/demo/[slug].astro`): `<Embed fullscreen>`
fills the viewport and mounts at once, with one small DS Card over it. Demos
are interleaved by date on `/txt` (a DEMO chip), ride in the feed and the
sitemap, and are numbered on their own (`demo / 001`), never as a txt.
`tests/demo.spec.ts` covers them.

## The cursive card — a live agent

`src/widgets/cursive/` wraps agent-web's `<cursive-terminal>`, imported at
runtime from `https://agent.cursive.info/terminal/v1.js` (floating `v1` on
purpose; see `config.ts`). The endpoint is rendered at build time: staging
under `astro dev`, production in a build. Production refuses every origin but
this site's, so to try a build locally with `astro preview`, build it against
staging (which allows localhost and `*.tristantimblin.pages.dev`):
`PUBLIC_CURSIVE_AGENT=https://staging.agent.cursive.info bun run build`.
`tests/cursive.spec.ts` runs on a stub element (`tests/fixtures/cursive-route.ts`,
routed for every context); `CURSIVE_REAL=1` uses the real bundle and agent.

## Design system — read before writing UI CSS

The site is built on **`@whois/design-system`** (`theme/design-system`). It
provides a global token layer (spacing, type, color, radii, fonts) plus
presentational Astro components. **Prefer DS components and tokens over bespoke
CSS** — hand-rolling values it was built to standardize drifts the design back to
ad-hoc.

**The gate (work top-down, stop at the first match):**

1. Maps to a component (text/heading, layout, button, card, pill, chip, link,
   list, icon, figure, hit area)? → **use the
   DS component.**
2. Bespoke layout/visual with no matching component? → **write your own CSS but
   consume DS tokens** (`var(--space-*)`, `var(--font-size-*)`, colors, radii).
   Never hardcode a value a token exists for.
3. Genuinely unique, non-reusable visual (hero, art direction)? → **hand-roll it**,
   still pulling spacing/color from tokens.
4. Same pattern in ≥2 places, or duplicating component CSS? → **expand the
   package**, don't copy-paste.

**Don't** fork component CSS inline, invent token names, or hardcode magic values
(`padding: 17px`, `#3b5bdb`).

**Full guide:** [`theme/design-system/CONVENTIONS.md`](theme/design-system/CONVENTIONS.md)
— usage, the gate in detail, when to edit which token file, and authoring
conventions for extending the package.

**Themes:** one attribute, `data-theme="light|dark"` on `<html>` — light by
default; the inline init in `Layout.astro` applies `localStorage.theme` before
first paint (`window.__setTheme`), and the `SiteFooter` toggle writes both. Never
key styles off a class or `prefers-color-scheme`; scope with `[data-theme]` (a
`ThemePage` wrapper sets it too, so derived tokens must be declared on
`[data-theme]`, not `:root`, to re-resolve inside one). The token files, in
`theme/design-system/src/tokens/`, load in this order:
`tokens.generated.css` (generated — never edit) → `tokens.overrides.css` (type
roles, motion, the EDGES and INSTRUMENT UI blocks) → `themes/light.css` /
`themes/dark.css` (every value that differs between the themes, the same set in
each) → `bridge.css` (the `--color-*` names the web components read).

**Edges:** every box is `var(--border)` (1px **dashed** `--border-color`) at
`var(--radius-box)` (2.5px), panels add `--shadow-panel` and a
`--panel-header-bg` header; code is `--code-bg` / `--code-fg` (+ `--code-border`),
links `--link-color` / `--link-decoration*`, transitions `--duration-standard` +
`--ease-standard`. Don't hand-write `1px solid`, `border-radius: 0` (use
`--radius-square`) or a hex colour.

**Halftone:** `<dotted-grid>` takes its tone from `--dg-*` custom properties
(`--dg-ink`, `--dg-ink-hi`, `--dg-paper`, `--dg-glow`, `--dg-polarity`,
`--dg-gamma`, `--dg-contrast`, `--dg-cutoff`, `--dg-feather`, `--dg-dot-scale`,
`--dg-levels`, `--dg-bloom`, `--dg-crosshatch`, `--dg-denoise`,
`--dg-dot-shape`); precedence is **attribute → CSS variable → default**, and it
re-reads them whenever `<html>`'s `class` / `data-theme` / `style` changes. The
per-theme presets (hero, phone carousel, footer clip) live in
`src/styles/halftone.css` under `[data-theme=…]`, inked from `--halftone-ink` /
`--halftone-ink-soft`. Keep tuning out of the markup: an attribute pins its
setting in both themes and silently beats the preset. Tune live at `/dotgrid`.
The full attribute and variable reference is in the
[dotgrid README](https://github.com/tatimblin/dotgrid#readme).

**Fonts:** two faces, by role, never by family — DM Sans (400/500/700) for
`--font-hero`, `--font-heading`, `--font-ui`, `--font-display`; Roboto Mono
(300/400/500) for `--font-body` and `--font-code`. Self-hosted latin + latin-ext
woff2 in `public/fonts` (`tools/fonts/build.sh`), one @font-face per cut at its
real weight plus metric-matched fallbacks in `src/styles/fonts.css`; a role names
its weight too (`--font-heading-weight` …, see CONVENTIONS). `font-synthesis` is
off, so ask only for a cut that exists. `tests/fonts.spec.ts` checks every cut
loads.

**Live catalogue:** run the dev server and open `/design-system`
(`src/pages/design-system.astro`) — every component in every variant/state. It's
the API reference; consult it instead of guessing props.
