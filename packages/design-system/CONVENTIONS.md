# `@whois/design-system` — usage & conventions

> **For agents:** this is the guide for using the design system in this repo.
> Read the **Decision gate** below before writing any UI CSS. The short rule:
> **prefer a DS component; else use DS tokens in your own CSS; hand-roll raw
> values only for genuinely unique visuals; expand the package when a pattern
> repeats.**

## What it is

A **no-React, Astro + plain-CSS fork** of [MaximeHeckel's design
system](https://github.com/MaximeHeckel/design-system). It has two parts:

- **A token layer** — CSS custom properties (spacing, type, color, radii, fonts)
  applied globally. The light OKLCH theme is set via `class="maximeheckel-light"`
  on `<html>` (see `src/layouts/Layout.astro`), so tokens resolve at first paint
  with no JS.
- **Presentational components** — `.astro` components (`Text`, `Grid`, `Button`,
  `Card`, …) that render fixed markup + a CSS class, consuming those tokens.

No React, Stitches, or Base UI ship to the browser — the upstream npm package is
a dev-only source for generating tokens and a reference for porting.

## How to use

**1. Import the component** (named files, one per component):

```astro
---
import Heading from "@whois/design-system/Heading";
import Text from "@whois/design-system/Text";
import Grid from "@whois/design-system/Grid";
import GridItem from "@whois/design-system/GridItem";
import Button from "@whois/design-system/Button";
// Component CSS is NOT global — import it ONCE per page that uses components.
import "@whois/design-system/styles.css";
---

<Grid templateColumns="repeat(12, 1fr)" gap={4}>
  <GridItem colSpan={8}>
    <Heading as="h2" size={3}>Section title</Heading>
    <Text size={3} variant="secondary">Body copy using a type + color token.</Text>
  </GridItem>
  <GridItem colSpan={4}>
    <Button variant="primary">Action</Button>
  </GridItem>
</Grid>
```

> **Gotcha:** tokens (`--space-*`, colors, …) are already global via
> `Layout.astro`, but **component styles are not**. Any page that renders DS
> components must `import "@whois/design-system/styles.css"` or they'll be
> unstyled. (The homepage does not import it yet; the catalogue page does.)

**2. The prop model** — every component follows the same shape:

- Props mirror the upstream DS names/defaults (e.g. `Text` has `size`, `variant`,
  `weight`, `family`; `Button` has `variant`, `inverted`, `rounded`).
- `class` is **merged**, not replaced — add your own hooks freely.
- All other attributes **pass through** (`id`, `aria-*`, `data-*`, `href`,
  `onclick`, `style`, …).
- Children go in the default `<slot />`; a few components use named slots
  (`Button` → `start-icon`/`end-icon`; `Callout` → `icon`).
- Polymorphic `as` where upstream has it (`<Text as="label">`, `<Box as="section">`).

**3. The live catalogue is the reference.** `src/pages/design-system.astro`
(served at `/design-system`) renders **every component in every variant/size/state**
— including columns/gutters/breakpoints for `Grid`. Open it instead of guessing a
prop; this doc deliberately does not duplicate per-component API tables.

**Components available (26):** `Box`, `Flex`, `Grid`, `GridItem`, `Text`, `EM`,
`Strong`, `Heading`, `H1`–`H4`, `Label`, `Button`, `IconButton`, `Card`,
`CardHeader`, `CardBody`, `Callout`, `Pill`, `Anchor`, `List`, `ListItem`,
`InlineCode`, `Icon`, `VisuallyHidden`.

## The decision gate

Work top-down. Stop at the first rule that matches.

| # | Situation | Do this |
|---|-----------|---------|
| 1 | What you're building maps to a component (any text/heading, layout, button, card, callout, pill, link, list, inline code, icon) | **Use the DS component.** This is the default. |
| 2 | Bespoke/one-off layout or site visual with no matching component | **Write your own CSS, but consume DS tokens** — `var(--space-*)`, `var(--font-size-*)`, colors, `var(--border-radius-*)`. Never hardcode a value a token exists for. |
| 3 | A genuinely unique, non-reusable visual (hero dotted-grid, the stories-heading lockup, page-specific art direction) | **Hand-roll it** — but still pull spacing/color from tokens where any apply. |
| 4 | The same component-like pattern now appears in **≥2 places**, or you're about to duplicate component CSS, or you need a variant upstream already has | **Expand the package** — add/extend a component (see *Authoring* below). Don't copy-paste. |

**Hard don'ts:**
- ❌ Don't fork a component's CSS inline to tweak it — extend the component instead.
- ❌ Don't invent token names — use the ones that exist (below); if a value has a
  token, use it.
- ❌ Don't hardcode magic values. If you're typing `padding: 17px` or
  `color: #3b5bdb`, **stop** — round to a `--space-*` step / use a color token.
- ❌ Don't add per-instance style overrides that belong in a variant.

**Worked examples:**
- *"I need a section heading."* → rule 1 → `<Heading as="h2" size={3}>`.
- *"I need a one-off full-bleed hero with a canvas effect."* → rule 3 → bespoke
  CSS, but its padding/gaps come from `var(--space-*)`.
- *"This pill-shaped status badge is now on 3 pages."* → rule 4 → it's already
  `Pill`; if it weren't, port/extend it in the package.

## When to edit vs. leave alone

| File | Rule |
|------|------|
| `src/tokens/tokens.generated.css` | **Never hand-edit.** It's generated from the upstream package. Regenerate with `bun scripts/gen-tokens.mjs` after `bun update @maximeheckel/design-system`. |
| `src/tokens/tokens.overrides.css` | The **only** place to retune DS token *values* for this site (it wins over generated). Empty by default. |
| `src/tokens/bridge.css` | Edit to add a legacy-name alias (e.g. mapping a site/Web-Component `--color-*` name onto a DS token). |
| `src/components/*.astro`, `src/styles/*.css` | Edit only to fix a fidelity bug or add a variant that exists upstream. Keep API parity with the DS. New component ⇒ add its `@import` to `src/styles/index.css` **and** a section to the catalogue page. |

---

## Authoring (extending the package)

Everything below is for **rule 4** — adding or extending a component. The package
is a **faithful, no-React fork**: each PURE (presentational) React/Stitches
component is ported 1:1 to an Astro component + a plain CSS file. Fidelity means
**same prop/variant names, same defaults, same CSS declarations** (referencing
the same token custom properties). Only the delivery mechanism changes.

### File layout per component

- `src/components/<Name>.astro` — the component.
- `src/styles/<name>.css` — its styles, added as one `@import` to
  `src/styles/index.css` (the aggregate imported once per page).
- Source of truth to port from:
  `/tmp/mh-design-system/src/components/<Name>/<Name>.tsx` (+ `.styles.tsx`).
  (Clone with `git clone --depth 1 https://github.com/MaximeHeckel/design-system
  /tmp/mh-design-system` if it's not present.)

### Class naming (mechanical translation of Stitches variants)

Stitches hashes its class names; we use readable, deterministic ones instead.
The mapping from a Stitches `variants` object is purely mechanical:

- **Base class:** `ds-<name>` (kebab). e.g. `ds-flex`, `ds-button`.
- **Variant class:** `ds-<name>--<key>-<value>`, key kebab-cased.
  - `variant: { primary: {...} }` on Button → `.ds-button--variant-primary`
  - `gap: { 3: {...} }` on Flex → `.ds-flex--gap-3`
  - `alignItems: { 'flex-end': {...} }` on Flex → `.ds-flex--align-items-flex-end`
- **Boolean variant** (`true`/`false` keys): `ds-<name>--<key>-<value>`, e.g.
  `.ds-button--inverted-true`. Only emit the class for values that carry rules.
- **Compound variants** become selector unions, e.g.
  `.ds-button--variant-primary.ds-button--inverted-true { … }`.

### The `.astro` shape

```astro
---
// Mirror the DS prop names + defaults exactly (see <Name>.types.ts / defaultVariants).
import { cx } from "../lib/cx";
interface Props {
  as?: string;
  variant?: "primary" | "secondary" | "tertiary";
  class?: string;
  [key: string]: unknown; // pass-through
}
const { as = "button", variant = "primary", class: className, ...rest } = Astro.props;
const Tag = as as any;
const cls = cx(
  "ds-button",
  variant && `ds-button--variant-${variant}`,
  className,
);
---
<Tag class={cls} {...rest}><slot /></Tag>
```

Rules:
- **Polymorphic `as`:** default to the DS base tag; `const Tag = as` then `<Tag>`.
- **Pass-through:** accept `class` (merge via `cx`) and spread `...rest` for
  arbitrary attributes (`id`, `aria-*`, `data-*`, event handlers, `style`).
- **No `css` prop.** The DS `css` prop (ad-hoc per-instance overrides) is out of
  scope. EXCEPTION: where a DS component itself maps *arbitrary string props*
  onto CSS via `css` (Grid's `templateColumns`, `colSpan`, `area`, …), render
  those as an inline `style` — that's a real API, not an ad-hoc override.
- **Defaults:** set Astro prop defaults to the Stitches `defaultVariants`. If a
  default value has no matching variant rule (e.g. Flex `justifyContent:
  'flex-start'` has no such key), emit no class — the base style already covers it.
- **Children:** `<slot />`. Named sub-components (Card.Header) become separate
  `.astro` files (`CardHeader.astro`); document the composition in the catalogue.

### Tokens available

All resolve globally from `@whois/design-system/tokens.css` (imported in Layout):
spacing `--space-0..15`, radii `--border-radius-0..3`, type `--font-size-1..8`
(no `-2`), weights `--font-weight-400/500/600`, fonts `--font-display`(Inter) /
`--font-mono` / `--font-numeric`, and the light-theme colors
`--text-primary/secondary/tertiary`, `--accent`, `--background`,
`--card-background`, `--border-color`, `--danger`/`--warning`/`--success`
(+ `-emphasis`), the `--gray/blue/green/red/orange/pink-*` scales, `--white`, and
`--hyperlink`. Legacy site aliases live in `bridge.css` (`--color-fg`,
`--color-bg`, `--font-serif`, `--font-decorative`, …). Breakpoints (from Stitches
media): `xs 480 / sm 640 / md 768 / lg 1024 / xl 1280` → standard
`@media (min-width: …)`.

**Do not invent tokens.** If the DS style references one not listed, transcribe it
verbatim (it resolves from the theme). Shadows come from the `Shadows[0..3]`
constant in the upstream `tokens/shadows.ts` — transcribe the resolved box-shadow
strings.

### After adding a component

1. Add `@import "./<name>.css";` to `src/styles/index.css`.
2. Add a labeled section to `src/pages/design-system.astro` showing every variant.
3. Verify against the original in the browser (`/design-system`) and confirm no
   React/Stitches leaks into the client bundle.
