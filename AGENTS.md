# AGENTS.md

Guidance for AI agents working in this repo.

## Repo layout

- **`src/`** — the Astro site (static output). Pages in `src/pages/`, shared
  shell in `src/layouts/Layout.astro`, global CSS in `src/styles/global.css`.
- **`packages/*`** — workspace packages (Bun workspaces, consumed as `@whois/*`,
  source exports, no build step):
  - `@whois/design-system` — the design system (tokens + Astro/CSS components).
  - Web Components (custom elements): `dotted-grid`, `video-carousel`,
    `stories-heading`, `wobble-text`.
  - Two exceptions with real build steps: `fleet-extension` and
    `vscode-fleet-demo` — see below.
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
for copy edits and the other 29 pages (seconds, vs. minutes for the monaco
build on a cold cache) — but `public/fleet-demo/` is gitignored, so on a clean
checkout it silently ships the post with a dead embed. Ship with `build`.

**Three dev loops:**

- *Extension:* `build` (or leave `watch` running), then F5 in
  `packages/fleet-extension`; or `vscode-test-web` against `dist/web`.
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

## Design system — read before writing UI CSS

The site is built on **`@whois/design-system`** (`packages/design-system`). It
provides a global token layer (spacing, type, color, radii, fonts) plus
presentational Astro components. **Prefer DS components and tokens over bespoke
CSS** — hand-rolling values it was built to standardize drifts the design back to
ad-hoc.

**The gate (work top-down, stop at the first match):**

1. Maps to a component (text/heading, layout, button, card, callout, pill, link,
   list, inline code, icon)? → **use the DS component.**
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

**Live catalogue:** run the dev server and open `/design-system`
(`src/pages/design-system.astro`) — every component in every variant/state. It's
the API reference; consult it instead of guessing props.
