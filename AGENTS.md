# AGENTS.md

Guidance for AI agents working in this repo.

## Repo layout

- **`src/`** — the Astro site (static output). Pages in `src/pages/`, shared
  shell in `src/layouts/Layout.astro`, global CSS in `src/styles/global.css`.
- **`packages/*`** — workspace packages (Bun workspaces, consumed as `@whois/*`,
  source exports, no build step):
  - `@whois/design-system` — the design system (tokens + Astro/CSS components).
  - Web Components (custom elements): `dotted-grid`, `video-carousel`,
    `gallery-carousel`, `sticky-heading`, `stories-heading`, `wobble-text`.
- Run the dev server with **`bunx astro dev`** (Node). Do **not** use
  `bunx --bun astro dev` — it crashes the HMR WebSocket.

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
