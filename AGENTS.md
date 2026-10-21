# AGENTS.md

Guidance for AI agents working in this repo.

## Repo layout

- **`src/`** — the Astro site (static output). Pages in `src/pages/`, shared
  shell in `src/layouts/Layout.astro` (the blog's in `BlogLayout` /
  `PostLayout`), global CSS in `src/styles/global.css`, the homepage's tiles in
  `src/widgets/`, posts as `src/content/txt/<slug>.mdx` with their images
  (`images/`) beside them.
- **`packages/*`** — workspace packages (Bun workspaces, consumed as `@whois/*`,
  source exports, no build step):
  - `@whois/design-system` — the design system (tokens + Astro/CSS components).
  - Web Components (custom elements): `dotted-grid`, `video-carousel`,
    `stories-heading`, `wobble-text`.
  - Two exceptions with real build steps: `fleet-extension` and
    `vscode-fleet-demo` — see below.
- **`tests/`** — Playwright, against the built site (`bun run test`);
  `bun run test:unit` runs the unit tests beside the code (`src/**/*.test.ts`
  and `packages/*/src/**/*.test.ts`; a bare `bun test` sees `src/` only — see
  `bunfig.toml`).
- Run the dev server with **`bunx astro dev`** (Node). Do **not** use
  `bunx --bun astro dev` — it crashes the HMR WebSocket.

## The fleet demo — two packages that do have a build step

The VS Code embed in `/txt/no-honey-we-have-a-dashboard-at-home` breaks the
source-export rule above, in both of its packages, because it has to:

- **`packages/fleet-extension`** — a real VS Code extension (not `@whois/*`,
  not a site dependency). An extension host `require()`s one pre-bundled file,
  so esbuild emits `dist/node/` + `dist/web/`; the site consumes the *built
  output*, never the source.
- **`packages/vscode-fleet-demo`** — the embed. Only `src/element.ts` /
  `element.css` (the `<fleet-demo>` poster/launch wrapper) follow the normal
  convention. The workbench page needs its own `vite build` — monaco-vscode-api's
  pipeline must not mix with Astro's — emitting to `public/fleet-demo/`
  (gitignored).

**Build chain:** `build:fleet-demo` = fleet-extension `build:web` →
vscode-fleet-demo `build`. The root `build` runs it before `astro build`, and
so does Playwright's `webServer` — a bare `astro build` ships the post with no
embed in it. `build:site` is that bare `astro build`, kept as an escape hatch
for copy edits and every other page (seconds, vs. minutes for the monaco
build on a cold cache) — but `public/fleet-demo/` is gitignored, so on a clean
checkout it silently ships the post with a dead embed. Ship with `build`.

**Three dev loops:**

- *Extension:* `build` (or leave `watch` running), then F5 in
  `packages/fleet-extension`; or `bunx @vscode/test-web` against `dist/web`.
- *Embed:* the extension's `build:web` first (the demo imports its built bundle
  `?raw`), then `bun run --cwd packages/vscode-fleet-demo dev`.
- *In the post:* `bun run build:fleet-demo`, then `bunx astro dev`.

**Two traps, both silent:** every `@codingame/*` dep is pinned to exactly
**36.2.7** — a `^` on any one of them loads two copies of the core and the
workbench never boots. And **never** add `views-service-override` alongside
`workbench-service-override` — the grid corrupts, the editor collapses to 0px,
nothing errors.

Detail for both lives in [`packages/fleet-extension/README.md`](packages/fleet-extension/README.md)
and [`packages/vscode-fleet-demo/README.md`](packages/vscode-fleet-demo/README.md).

**Baked drawings are committed** — the glyphs (`bun run glyphs:bake` from
`packages/design-system/src/glyphs/recipes/`) and the scenes (`bun run
scenes:bake` from `tools/scenes/<name>/scene.ts`, whose heavy deps — d3-geo,
world-atlas — are root devDependencies that never ship) — so `build` does
not bake; `glyphs:check` / `scenes:check` fail when a source and its file
have drifted, and the unit tests hold the same line.

## Design system — read before writing UI CSS

The site is built on **`@whois/design-system`** (`packages/design-system`). It
provides a global token layer (spacing, type, color, radii, fonts) plus
presentational Astro components. **Prefer DS components and tokens over bespoke
CSS** — hand-rolling values it was built to standardize drifts the design back to
ad-hoc.

**The gate (work top-down, stop at the first match):**

1. Maps to a component (text/heading, layout, button, card, pill, chip, link,
   list, icon, glyph / glyph tile, figure, index table, hit area)? → **use the
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

**Full guide:** [`packages/design-system/CONVENTIONS.md`](packages/design-system/CONVENTIONS.md)
— usage, the gate in detail, when to edit which token file, and authoring
conventions for extending the package.

**Themes:** one attribute, `data-theme="light|dark"` on `<html>` — light by
default; the inline init in `Layout.astro` applies `localStorage.theme` before
first paint (`window.__setTheme`), and the `SiteFooter` toggle writes both. Never
key styles off a class or `prefers-color-scheme`; scope with `[data-theme]` (a
`ThemePage` wrapper sets it too, so derived tokens must be declared on
`[data-theme]`, not `:root`, to re-resolve inside one). The token files, in
`packages/design-system/src/tokens/`, load in this order:
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
