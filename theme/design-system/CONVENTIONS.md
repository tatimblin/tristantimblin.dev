# `@whois/design-system` — usage & conventions

> **For agents:** this is the guide for using the design system in this repo.
> Read the **Decision gate** below before writing any UI CSS. The short rule:
> **prefer a DS component; else use DS tokens in your own CSS; hand-roll raw
> values only for genuinely unique visuals; expand the package when a pattern
> repeats.**

## What it is

A **no-React, Astro + plain-CSS fork** of [MaximeHeckel's design
system](https://github.com/MaximeHeckel/design-system), pruned to what this
site uses and extended with what it needed. It has two parts:

- **A token layer** — CSS custom properties (spacing, type, color, radii, fonts,
  motion) applied globally. The theme is set via `data-theme="light"` (the
  default) or `"dark"` on `<html>` (see `src/layouts/Layout.astro`), so tokens
  resolve at first paint with no JS; any wrapper may carry its own
  `data-theme` (ThemePage) and every themed token re-resolves inside it.
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

> **The CSS is global, once — mostly.** `Layout.astro` imports
> `@whois/design-system/tokens.css` and then `@whois/design-system/styles.css`;
> no page or layout imports either again. Every page renders with the
> package's shared styles, in two cascade layers (below). The exception is
> CSS whose components only the catalogue and the playgrounds render
> (`Button`, `Knobs`, `ThemePage`): each such component imports its own file in its frontmatter,
> so Astro ships it only on a page that renders one. Those files wrap their
> rules in `@layer ds.components { … }`, so they land in the same layer.

**2. Cascade layers.** The package's CSS sits in `@layer ds.components, ds.roles`
(`src/styles/index.css`). The *roles* — heading, body, caps — compose on
`Text` and win over its variants on the same element by layer order, so no rule
in the package needs a doubled selector or an `!important`. **Site CSS is
unlayered and always wins over the package**, at any specificity: a page that
sets a property on a DS element gets it. The one thing to watch is a bare
element rule (`h2 { font-size }`) — it beats a DS class too, so the site keeps
such rules off DS elements (`h2:where(:not(.ds-heading))`, global.css).

**3. The prop model** — every component follows the same shape:

- Props mirror the upstream DS names/defaults where a port survives (`Text` has
  `size`, `variant`, `family`; `Button` has `variant`, `inverted`, `rounded`).
- `class` is **merged**, not replaced — add your own hooks freely.
- All other attributes **pass through** (`id`, `aria-*`, `data-*`, `href`,
  `onclick`, `style`, …).
- Children go in the default `<slot />`; the named slots are in the **slot
  inventory** at the end.
- Polymorphic `as` where it makes sense (`<Text as="label">`, `<Box as="section">`).

**4. The live catalogue is the reference.** `src/pages/design-system.astro`
(served at `/design-system`) renders **every component in every variant/size/state**
— including columns/gutters/breakpoints for `Grid`. Open it instead of guessing a prop; this doc
deliberately does not duplicate per-component API tables.

**Components available (52):** `Box`, `Flex`, `Grid`, `GridItem`, `Text`, `EM`,
`Strong`, `Heading`, `H1`–`H4`, `Body`, `Button`, `IconButton`, `Card`,
`CardHeader`, `CardBody`, `Pill`, `Chip`, `Anchor`, `List`, `ListItem`, `Icon`,
`VisuallyHidden`, `WidgetGrid`, `Widget`, `WidgetEmpty`, `HitArea` — the
instrument UI (next section): `Mono`, `Figure`, `Stat`, `Hairline`,
`TickRuler`, `BarGraph`, `Legend`, `LegendItem`,
`TileGrid`, `Tile`, `Faces`, `Face` — the reading UI (the section after it):
`PostList`, `PostGroup`, `PostRow`, `Prose`, `Blockquote`, `Fig`, `Sequence` — and the
catalogue's tooling: `Knobs`, `KnobGroup`, `Knob`, `ThemePage`.

**Client helpers** (`@whois/design-system/lib/*`, plain TS, no DOM at import):
`breakpoints` (`WIDGET_COMPACT_MQ`, `WIDGET_WIDE_MQ`), `faces` (`showFace`,
`shownFace`), `keys` (`stepFromKey`), `lifecycle` (`onPage`), `bar-graph`
(`markBar`, `barsOf`). See *Widget grid* below.

## The decision gate

Work top-down. Stop at the first rule that matches.

| # | Situation | Do this |
|---|-----------|---------|
| 1 | What you're building maps to a component (any text/heading, layout, button, card, pill, chip, link, list, icon, a figure, a hit area) | **Use the DS component.** This is the default. |
| 2 | Bespoke/one-off layout or site visual with no matching component | **Write your own CSS, but consume DS tokens** — `var(--space-*)`, `var(--font-size-*)`, colors, `var(--border-radius-*)`, `--bar-width`, `--shadow-*`, the durations. Never hardcode a value a token exists for. |
| 3 | A genuinely unique, non-reusable visual (hero dotted-grid, the stories-heading lockup, page-specific art direction) | **Hand-roll it** — but still pull spacing/color from tokens where any apply. |
| 4 | The same component-like pattern now appears in **≥2 places**, or you're about to duplicate component CSS | **Expand the package** — add/extend a component (see *Authoring* below). Don't copy-paste. |

**Hard don'ts:**
- ❌ Don't fork a component's CSS inline to tweak it — extend the component instead.
- ❌ Don't invent token names — use the ones that exist (below); if a value has a
  token, use it.
- ❌ Don't hardcode magic values. If you're typing `padding: 17px` or
  `color: #3b5bdb`, **stop** — round to a `--space-*` step / use a color token.
- ❌ Don't add per-instance style overrides that belong in a variant.
- ❌ Don't add a prop or a variant the site does not use. The package is pruned
  to what the site sets (the catalogue does not count as use); a new step
  arrives with its first consumer.

**Worked examples:**
- *"I need a section heading."* → rule 1 → `<Heading as="h2" size={3}>`.
- *"I need a one-off full-bleed hero with a canvas effect."* → rule 3 → bespoke
  CSS, but its padding/gaps come from `var(--space-*)`.
- *"This transparent tap surface is now on 2 widgets."* → rule 4 → it's already
  `HitArea`; if it weren't, port/extend it in the package.

## When to edit vs. leave alone

| File | Rule |
|------|------|
| `src/tokens/tokens.generated.css` | The base token set: a frozen snapshot of what the former upstream package (`@maximeheckel/design-system`) generated, now hand-owned — there is no generator. Edit in place only to change a base value; a site retune belongs in `tokens.overrides.css`. |
| `src/tokens/tokens.overrides.css` | Where the site's own theme-independent tokens live (it wins over generated): the type roles and scale steps, the motion vocabulary, the EDGES block (border, radius, link, code-token tokens on `:root`; the composites `--border`, `--shadow-panel`, `--panel-header-bg`, `--link-color` on `[data-theme]`), the INSTRUMENT UI block (on `[data-theme]`). |
| `src/tokens/themes/light.css`, `themes/dark.css` | The two palettes, on `[data-theme="light"]` / `[data-theme="dark"]`: every value that differs between the themes (page, panel, edge colour, inks, washes, accent and `--on-accent`, code block, halftone ink). Edit both together — they name the same set. |
| `src/tokens/bridge.css` | Edit to add a legacy-name alias (e.g. mapping a site/Web-Component `--color-*` name onto a DS token). |
| `src/components/*.astro`, `src/styles/*.css` | Edit freely: the package is this site's. For a component that is still a port (`Grid`, `Flex`, `List`, `Anchor`, `Icon`, `VisuallyHidden`) keep the prop names. New component ⇒ add its `@import` to `src/styles/index.css` (in a layer) — or, while only the catalogue renders it, import the file from the component wrapped in `@layer ds.components` — **and** a section to the catalogue page. |
| `src/lib/*.ts` | Client helpers a widget's script imports; keep them DOM-free at import time. |

---

## Instrument UI — the card and widget vocabulary

The cards, widgets and controls are drawn after instrument UIs (a hardware
metronome's screen, a dashboard card): **flat** surfaces a few percent apart,
1px **dashed edges**, **one accent** (the link blue) used once per card for the lit
thing / the playhead / the primary action, and everything else the **ink at a
few strengths**. Two voices of type: small tracked uppercase **labels** for
structure, and a big regular-weight **numeral** for values. `Card`,
`CardHeader`, `Pill`, `Button` and `IconButton` keep a DS-shaped prop API but
are restyled (no shadows, no glass, caps labels), and the components below have
no upstream at all.

**Tokens** (`tokens.overrides.css` → EDGES and INSTRUMENT UI, on `[data-theme]`
unless noted; the per-theme values in `themes/*.css`):

| Token | What it is for |
| --- | --- |
| `--border` (`--border-width` 1px, `--border-style` dashed, `--border-color` — the parts on `:root`/the theme) | THE edge: cards, dividers, a figure's frame, a section's rule. Compose it (`border-block-start: var(--border)`); never type `1px solid`. A side that must stay invisible uses the parts with a transparent colour. |
| `--radius-box` (2.5px), `--radius-square` (0) — `:root` | the one corner of anything boxed, and a corner square on purpose. `--border-radius-0..3` all resolve to `--radius-box`. |
| `--shadow-panel`, `--panel-outline` | a panel's 1px tinted ring under its edge, and its colour. |
| `--panel-header-bg` | a panel header's fill: the card fading into `--wash-1` (also the primary Button's and the outline Pill's). |
| `--code-bg`, `--code-fg`, `--code-border`, `--code-token-*` | a fenced block: the slab, its ink and edge (per theme), and the shared highlight colours. |
| `--link-color`, `--link-hover-color`, `--link-decoration(-hover)`, `--link-underline-offset/-thickness` | every link: the colour, underlined at rest, plain under the pointer. |
| `--duration-standard` (250ms), `--ease-standard` — `:root` | the chrome's own transition (a chip, a pill, a button washing in). |
| `--halftone-ink`, `--halftone-ink-soft` | the halftones' dot ink per theme, handed to `<dotted-grid>` / `<video-carousel>` as `--color-fg` (bridge.css). |
| `--accent`, `--accent-hover` | the one accent (the link blue, re-tuned lighter on the dark page), and the accent under the pointer. |
| `--on-accent` | type ON the accent — white on the light theme's blue, the dark ink on the dark theme's. |
| `--lit` | a step/tile/key that is ON — a quieter blue off the accent. Use for binary on/off; use `--accent` for the accent itself. |
| `--wash-1/2/3` | three solid tints (the pale blue-grey tag fill, then the panel ring's blue): unlit tile & subtle pill fill; two stronger steps. |
| `--tone-1..5` | the rank ramp: accent, primary, secondary, tertiary, `--wash-3`. For ranked things (legend, share ruler). |
| `--text-subtle` | a quiet label ink between secondary and tertiary — a tag's, a toggle's. |
| `--hairline`, `--hairline-strong`, `--hairline-fade` | the edge colour alone (a drawn stripe, a ring); a stronger edge for under the pointer; the OPT-IN divider gradient that fades at both ends (`<Hairline variant="fade">`). A whole edge is `--border`. |
| `--bar-width` (`:root`, 2px) | every solid edge bar: the pull quote's. |
| `--border-radius-tile` (2px), `--border-radius-pill` (9999px), `--tick-pitch` (4px) — `:root` | the steps below the generated scales. |
| `--ticks-image`, `--ticks-image-ink` | the tick ruler as a gradient (hairlines on `--tick-pitch`) in currentColor, and in the ink — for a box that should read as a ruler and cannot take the classes (the player's progress bar). TickRuler draws its own on the same pitch. |
| `--focus-ring`, `--focus-ring-offset`, `--focus-ring-inset` | the focus ring for everything focusable that is not a native control, drawn by `control.css` for every `ds-control`; the offset, and the inset form of it for a control that rings inside its box (set `--control-ring-offset: var(--focus-ring-inset)` in scope). |
| `--playhead-dot` | a playhead's dot — the video carousel's. |
| `--shadow-3` | the upstream shadow scale's step 3 on the theme's `--shadow-color`, for the few things that float — a control panel. Cards take `--shadow-panel`. |
| `--voice-mono-*`, `--voice-figure-*` | the label voice (family, size, tracking) and the figure voice (family, weight, tracking, size) as custom properties, for a shadow-DOM consumer styled through `::part()`. Mono and Figure read them; a WidgetGrid redefines the sizes on its scale. |
| `--duration-reveal / -settle / -swap / -quick / -loop`, `--ease-reveal` | the motion vocabulary; all `0s` under `prefers-reduced-motion: reduce`, so a transition timed by a token is a cut for that visitor and no component needs a reduced-motion block of its own. |

**Controls.** Every control — Button, IconButton, a Pill or Chip as a button or
link, Anchor, PostRow's link, HitArea —
composes the `ds-control` class (`control.css`): the native reset, the pointer,
`:disabled` and the focus ring, once. A control that must ring inside its box
sets `--control-ring-offset: var(--focus-ring-inset)`.

**Card chrome.** `<Widget size title>` is a `Card` with the size class
(`ds-widget--size-2x1`, …): both draw the header through `CardHeader` —
`title` as a `Mono variant="title"` on the left (the prop, or a `title` slot for
a title a script rewrites: put the hook on your own element; the same variant
heads a panel inside a card in the header's voice), the `meta` slot on the
right, the fading hairline under — and `<CardBody>` fills the rest of the cell
as a flex column with `--widget-gap`; put `slot="meta"` on a `Pill`/`Mono`.
`squeeze="title"` flips which side gives in a narrow row. `chrome={false}` drops the frame, fill
and clip for content that sits straight on the page. There is one card: flat
(no `variant`, `depth` or `glass`). `<WidgetEmpty>` is a tile's empty state,
centred in the body's room. Inside a `WidgetGrid`, every voice below scales
with the cell (`--widget-font-*`); elsewhere it falls back to the type tokens.

**Faces.** `<Faces>` stacks alternatives in one grid cell, one showing: the
card that flips, the season the arrows page, the range a pill cycles. Every
`<Face>` is rendered; `inactive` ones are `aria-hidden`, which is the attribute
the cross-fade keys on, so a script swaps faces by moving it — `showFace(stack,
keyOrIndex)` from `lib/faces` does exactly that (by index, or by `data-face`).
`fill` takes the rest of a card body and clips each face to it; without it the
stack holds its tallest face's height.

**HitArea.** A transparent control laid OVER something — a real `<button>`, no
chrome, filling its positioned parent (or placed as a band with its own inset),
ringed inside the box. `wash` draws `--wash-1` under the pointer and while it
says it is current (`aria-current`) or on (`aria-pressed="true"`). The tap
surface that flips a card; the band over a season on a chart.

```astro
<Widget size="1x1" title="github">
  <Mono slot="meta" as="a" variant="text" href="…">@handle</Mono>
  <CardBody>
    <TileGrid cols={weeks.length} rows={7} fit="height">…<Tile level={3} />…</TileGrid>
    <Figure unit="contributions">1,457</Figure>
    <HitArea aria-pressed="false" aria-label="Show language breakdown" />
  </CardBody>
</Widget>
```

**Voices.** Two prop names recur and mean the same thing everywhere:
`size` is a step on a named scale — `Mono`'s `0|1` are the label step and the
one above it (`--font-size-0/-1`, the widget's `xs`/`sm` inside a grid), and
the `xs|sm|lg|xl` steps on `IconButton` are its own — and never a length.
`tone` is SEMANTIC — which ink, from the theme (`primary|secondary|tertiary|
accent`) — where `color` is DATA: a specific colour a datum carries (a legend
dot, a ruler segment, a team's own colour), passed as a CSS colour.
- `Mono` — the LABEL voice (the name is from when it was a monospace; it is
  the UI face, small): `variant="caps" | "text" | "value"` (caps label / dim
  sentence case / ink figure), `size={0|1}`, `tone`, `truncate`, polymorphic
  `as` (as an `a` it gets the link reset). The `.ds-mono ds-caps` classes ARE
  the caps voice: Pill, Chip and Button compose them, so there is one.
- `Figure` — big regular numeral + caps `unit` (prop or `slot="unit"`); one
  size, the figure voice's.
- `Stat` — `value` + `label` (props or default/`label` slots): the mono pair
  (the value at the next step, in the ink), several in a row.
  `variant="numeral"` is the spec sheet's pair instead: the value big and
  thin (`--font-display`, DM Sans Medium, at `--font-size-8`) with a caps
  label BESIDE it on the numeral's top edge; the label wraps (a `<br>`, or a
  title and a meta line in the `label` slot).
- `Pill` — `variant="subtle"` (default, the wash) `| "outline"` (the Chip's
  edge: hairline at rest, strong under the pointer); `as="button"|"a"` makes
  it a pill button; an `Icon` in the default slot sits before the text.
- `Chip` — the BOXED chip of the ruled screen: caps in a square hairline box,
  no fill. `as="a"|"button"` makes it a chip button (the footer's toggles).
  SELECTED is read off the chip's own ARIA — `aria-current` or
  `aria-pressed="true"` — and fills it with the ink. The TAGS:
  `tone="accent"` draws the box's edge and caps in
  the accent (TELEMATIC), and `variant="arrow"` is a FILLED tag cut to a
  right-pointing chevron by clip-path (a border cannot follow the cut) —
  the ink with the page colour on it, or the accent with `--on-accent`
  under `tone="accent"` (REPLACE). Both are static tags.
- `Button` — `primary` (accent) / `secondary` (ink wash) / `tertiary`; `rounded`
  = pill button; `start-icon`/`end-icon` slots. `IconButton` — `secondary`
  (default, a wash in a hairline) / `outline` (the hairline alone),
  `size="xs|sm|lg|xl"`, `rounded` = round button; give it an `aria-label`.

**Hairline graphics.**
- `Hairline` — a 1px rule fading at both ends; an `hr`, or `as="span"`.
- `TickRuler` — `segments=[{share, color?}]` (colours default to `--tone-N` by
  order): a share bar, or a plain stretch.
- `BarGraph` — `values`, `max`, `mark={i|"last"|"max"}` (the one bar in the
  accent, `data-mark`; an index, where Tile's `lit` is a boolean), `height`,
  `label` (its accessible name; without one it is `aria-hidden`);
  `interactive` for a graph a script reads back — it composes `ds-control`
  (the ring), takes a crosshair once the script has given it `role="slider"`
  (and its name and tabindex; without the script it stays a picture), and
  leaves vertical touch drags to the page. The script moves the accent with
  `markBar(graph, i)` from `lib/bar-graph` and never selects the bar class.
- `Legend` — `items=[{label, value?, color?, swatch?}]` or `LegendItem`
  children (`label`, `value` prop or slot, `color`, `swatch="dot|line|dashed"`
  for a series drawn as one); dots take `--tone-N` by position.
- `TileGrid` — `cols`, `rows`, `fit="width|height"`, `cells=[{level?, lit?,
  title?}]` or `Tile` children (`level={0..4}`, `lit`, any attribute — e.g.
  `style="grid-column:…"` to place).

**Widget grid.** `WidgetGrid cols` is a query container named `widget`; it
exposes `--widget-grid-gap` and the fluid scale (`--widget-cell`,
`--widget-pad`, `--widget-gap`, `--widget-font-xs..xl`, `--widget-font-figure`,
`--widget-icon`), keyed to a 300px reference cell. A 2×1 is one cell tall and a
1×2 two cells and the gap — sized from the cell, not by an aspect ratio, in
`:where()` so a widget that must release its size says `aspect-ratio: auto` /
`block-size: auto` and wins. The COMPACT step — 4 → 2 columns at and below
**900px** — is the site's one breakpoint of its own (`widget-grid.css`;
`WIDGET_COMPACT_MQ` / `WIDGET_WIDE_MQ` from `lib/breakpoints` for a script
that must follow it). Rules about the CELL (the header closing up, the caps
tightening, the legend's gap) are `@container widget (max-width: 624px)`
queries — cells below the reference — not viewport ones. A widget's script
binds with `onPage(bind)` from `lib/lifecycle` (bind on `astro:page-load`,
tear down on `astro:before-swap`) and reads the arrow keys with
`stepFromKey(event, at, last)` from `lib/keys`.

**A widget's shape** (`src/widgets/*`): a typed `Props` of `class` and a
pass-through, spread onto its `<Widget>`, so the PAGE writes the row's
choreography (`data-reveal`, the group, the order — `src/pages/index.astro`)
and the widget knows nothing of it; a widget that must react to the page's
reveal keys its CSS on `data-reveal-state="in"` (the bike's slide-in) rather
than observing on its own. The HEADLINE FIGURE sits at the FOOT of the body
(the contributions total, the visitors, the miles), with the graphic or the
stat pairs above it, so a row of tiles reads its figures on one line. A
widget's own rules go in a scoped `<style>` unless one has to reach a DS
element the widget does not render (an Icon's svg inside a button) or a shadow
DOM (`::part`); the DS spreads the scope attribute onto each component's
root, so a plain class applies, and its CSS sits in a layer under the
site's, so no prefix or doubled selector is ever needed to win.

The catalogue (`/design-system`) shows every one of these, and a "Widget — the
pieces together" section with three sample widgets.

---

## Reading UI — the archive and the reading column

The blog (`/txt`, `src/layouts/BlogLayout.astro` and `PostLayout.astro`) is the
other family of components with no upstream: a quiet, near-monochrome page in
the UI face, where the accent appears once, on a hovered title.

- `PostList` — the archive, an `<ol>` of groups. `PostGroup` — one band:
  `label` (prop or slot; a year) in the left third over a full-width hairline,
  its rows in the right two thirds. `PostRow` — one link per row: `href`, the
  title in the default slot, an optional `meta` slot (an `Icon` and a category,
  a count) in a column that lines up down the group, an arrow at the right.
  Hairlines between rows run under the right column only. The tag pages
  (`/txt`, `/txt/tag/<tag>`) are built from it.
- `Prose` — the reading container around rendered markdown. It spaces the
  blocks, and restates `--font-heading` / `--font-heading-weight` IN SCOPE (the
  heading face at its Bold, with a hairline under each h2) — the token layer
  doing a theme's job, rather than a rule against `.ds-heading`. It also styles
  the tags markdown leaves raw (`pre`, inline `code` — on `--font-code`, the
  one monospace — `hr`, `table`, `del`); the mapped components keep their own
  type. **`variant="ruled"`** is the post page's column (below): the body cut
  into SECTIONS at each h2, each a grid row under a hairline on the page's four
  columns — `--ruled-columns` / `--ruled-gap`, four and `--space-4` unless the
  page sets them — its number and heading sticky in the first column, its text
  in the next two on a subgrid (a block that says `data-prose-bleed` takes the
  row to the right edge, `data-prose-bleed="full"` the head's column too), the
  fourth air; below 1024 the heads stack. It expects the sectioned
  markup the site's rehype plugin emits (`src/lib/mdx/post-sections.ts`; the
  shape is in `Prose.astro`): images as a bled `Fig` (`figure.ds-fig`), fences as
  `figure.ds-prose-code` between two hairlines under a header row, a quote with
  an attribution as `figure.ds-prose-quote`; links in the ink on a 1px
  underline (`--hyperlink` and `--anchor-border-color` retuned in scope).
- `Fig` — the numbered figure: the image on a hairline, square, `Fig. 0N /` and
  a caption in the caps voice. `no`, `caption` (prop or slot),
  `layout="flow"` (the caption line under the image — what the plugin emits)
  `| "ruled"` (a row on the page's columns: the label in the first, the image
  and caption across the other three; stacks below 1024 — the post's hero).
- `Sequence` — a sequence diagram as a flow `Fig`, from props, no script:
  `actors` (`{ key: "Name" }`, lane order), `steps` — each a note
  (`{ note, over }`, `over` a key or a `[from, to]` range), a message
  (`{ from, to, text }`, either direction, the arrowhead at the receiver), or
  an array of them sharing a row — `tone: "accent" | "success"` on any item,
  and `caption`. Dashed actor boxes and lifelines, notes on the page colour;
  the steps are an `ol` and each item opens with VisuallyHidden words naming
  its lanes. The stage is a container: below 480px of its own width the words
  drop to the label step. Pass `data-prose-bleed` to widen it in a post.
- `Blockquote` — the quote on the ruled page, and the one design: no fill, a
  `--bar-width` bar of the accent down the left edge, the words a step up (the
  body role's size and leading retuned in scope), an attribution as a `footer`
  in the caps voice (`<Mono as="footer">`). Markdown `>` maps to it; in a post
  the plugin moves the attribution out into the figure's caption.
- `Anchor` — the DS link, plus `variant="ink"` (the primary ink at rest, the
  accent under the pointer or focus, no underline) and `underline="always"`
  (drawn at rest in the text's colour). `arrow`, `external`, `discreet` as
  upstream.

### The ruled post — one grid, every row on it

A post (`src/layouts/PostLayout.astro`, `/txt/<slug>`) is one four-column
grid in the site container — `--ruled-columns` / `--ruled-gap` set on the
article, the tokens the ruled `Prose` and `Fig` read, so the page's
rows and the body's sections fall on the same lines — under the site header:

1. the STATUS STRIP, one `Grid` row between two `--hairline-strong` rules in
   the caps `Mono`: `TXT / 005` (the ink) · the category · `3 MIN · 541 WORDS · 212 READS` · the date `02.02.2026` on the
   right edge (the ink, a `time`). READS is the post's GoatCounter count from
   the committed ledger (`src/lib/pageviews.ts`), left off under 10;
2. the column numbers `01 02 03 04`, aria-hidden;
3. the TITLE (`Heading as="h1" size={6} responsive` — 72px, 44px below 1024)
   across the first three columns, `--line-height-heading` retuned to 0.95 in
   scope; the LEAD — the excerpt, `Text` at size 5 in the primary ink — in
   the second and third;
4. the HERO, when the frontmatter has one (`hero: { src, alt, caption? }`,
   `src` an image beside the post through the schema's `image()`): a ruled
   `Fig no="01"` around a `<Picture>`;
5. the SECTIONS — `Prose variant="ruled"` around the mapped body, which the
   plugin has cut at each h2 (`00 / Intro` for what comes first; a post with
   no h2s is one section, its text at the same measure as any other);
6. the FOOT, a `Card` with the older post on the left and the newer on the
   right.

Below 1024 it is one column: the strip two by two, no column numbers, the
title at 44px, the hero full width (the Fig collapses itself).

---

## Catalogue tooling

- `ThemePage theme="light|dark"` — a piece of one theme's page inside the
  other: `data-theme`, the page colour, the ink, a hairline box, labelled.
  Every themed token re-resolves inside it (which is why the instrument tokens
  sit on `[data-theme]`, not `:root`).
- `Knobs` / `KnobGroup` / `Knob` — a playground's control panel: a card
  surface with `--shadow-3`; a title row (`title`, the `meta` slot), a `note`
  slot, a scrolling body of `Knob` rows (`label`, `type="range|color|checkbox|
  text"`, `out` for a live `<output data-out>`, the default slot for a row
  that holds its own inputs; every other prop goes to the input) in
  `KnobGroup` fieldsets (`legend`), and an `actions` slot of Buttons.
  `floating` is the playground's placement (`/dotgrid`, the catalogue's token
  editor): fixed to the top-right corner, a `--space-14` column as tall as
  the viewport allows, and at the compact step (900) a sheet docked across
  the bottom; without it the page places the panel.

---

## Authoring (extending the package)

Everything below is for **rule 4** — adding or extending a component. The
package began as a faithful port; it is this site's now, pruned to what the
site uses. The file layout, class naming and `.astro` shape still apply.

### File layout per component

- `src/components/<Name>.astro` — the component.
- `src/styles/<name>.css` — its styles, added as one `@import "./<name>.css"
  layer(ds.components);` to `src/styles/index.css` (a type ROLE that composes
  on Text goes in `layer(ds.roles)`).
- A prop is a variant the site sets. Do not add one for the catalogue.

### Class naming

- **Base class:** `ds-<component-name>` (kebab, the whole name: `ds-tile-grid`,
  `ds-bar-graph`, `ds-widget-grid`).
- **Element:** `ds-<name>__<part>`.
- **Variant class:** `ds-<name>--<key>-<value>`, key kebab-cased:
  `.ds-button--variant-primary`, `.ds-flex--gap-3`. Boolean variants
  `ds-<name>--<key>-true`; emit the class only for values that carry rules.
- **Shared classes** a component composes in its template: `ds-control` (every
  control), `ds-mono ds-caps` (the caps voice).
- **Private custom properties** are prefixed with the component
  (`--button-color`, `--anchor-icon`, `--tick-share`, `--bar-value`), never
  bare (`--color`, `--size`), so nothing leaks between components or into a
  page.

### The `.astro` shape

```astro
---
import { cx } from "../lib/cx";
interface Props {
  as?: string;
  variant?: "primary" | "secondary" | "tertiary";
  class?: string;
  [key: string]: unknown; // pass-through
}
const { as = "button", variant = "primary", class: className, ...rest } = Astro.props;
const Tag = as as any;
const cls = cx("ds-button", "ds-mono", "ds-caps", "ds-control", `ds-button--variant-${variant}`, className);
---
<Tag class={cls} {...rest}><slot /></Tag>
```

Rules:
- **Polymorphic `as`:** default to the natural tag; `const Tag = as` then `<Tag>`.
- **Pass-through:** accept `class` (merge via `cx`) and spread `...rest` for
  arbitrary attributes (`id`, `aria-*`, `data-*`, event handlers, `style`).
- **No `css` prop.** Where a real API maps arbitrary strings onto CSS (Grid's
  `templateColumns`, GridItem's `colSpan`, a cell's `col`/`row`), render them
  as an inline `style` (custom properties where a stylesheet reads them).
- **Defaults:** set to the DS's `defaultVariants` where a port survives; a
  default that has no rule emits no class.
- **Children:** `<slot />`. Named sub-components become separate `.astro` files
  (`CardHeader.astro`); document the composition in the catalogue.
- **A voice is its classes**, not repeated CSS: a component whose text is the
  caps voice composes `ds-mono ds-caps` and keeps only its box and colour.
- **Retune tokens in scope** rather than restyle a component: a reading column
  sets `--font-heading`, a pull quote sets `--font-body-size`, a phone tile
  sets `--tracking-caps`.

### Tokens available

All resolve globally from `@whois/design-system/tokens.css` (imported in
Layout): spacing `--space-0..15`, radii `--border-radius-0..3` (+ `-tile`,
`-pill`), type `--font-size-0..9` (no `-2`; `0` = 12px and `9` = 72px are the
site's steps below and above the generated scale), weights
`--font-weight-200/400/500/600/700` (`200` and `700` are the site's; DM Sans
ships 400/500/700 and Roboto Mono 300/400/500), the leadings `--line-height-heading/-body/-ui` (1.15 / 1.6 / 1.3),
the trackings `--tracking-heading` (0), `--tracking-caps` (0.1em),
`--tracking-mono` (0.04em), the theme colors `--text-primary/secondary/tertiary`,
`--accent`, `--accent-hover`, `--on-accent`, `--background`,
`--card-background`, `--border-color` (site CSS may read it; the package reads
`--hairline`), `--danger`/`--warning`/`--success`, the `--gray/blue/green/red/
orange/pink-*` scales, `--hyperlink`, the `--token-*` code palette, and
`--shadow-color`; plus the instrument tokens (previous section: `--lit`,
`--wash-*`, `--tone-*`, `--hairline*`, `--bar-width`, `--tick-pitch`,
`--ticks-image*`, `--focus-ring*`, `--playhead-dot`, `--shadow-3`, the
voices, the durations, `--ease-reveal` and the reveal's
`--reveal-rise` / `--reveal-stagger`), `--tracking-hero` (the hero
face's display tracking, the lockup's) and the two measures, `--measure-prose`
(the reading column, 44rem) and `--measure-note` (a note's line, 68ch). The `--color-*` names in `bridge.css`
are for the packages that read a colour where a class cannot reach (a canvas,
a knockout); site code reaches for the DS token.

**Breakpoints.** The DS's, from Stitches media: `xs 480 / sm 640 / md 768 / lg
1024 / xl 1280`; and the site's one of its own, the widget grid's **compact
step at 900** (above). **Direction:** a rule that *takes something away* as the
viewport narrows is written `max-width` (`(max-width: 1023px)`: the ruled grid
collapses); a rule that *adds* as it widens is `min-width` (`(min-width:
1024px)`: a wider gap). The two spellings of one step differ by 1px
(`max-width: 900px` / `min-width: 901px`). A rule about a CELL, not the
viewport, is a container query on the grid (`@container widget`).

**Fonts are named by role, not by family** (`tokens.overrides.css`; the faces
are self-hosted from `/fonts`, fetched by `tools/fonts/build.sh`, @font-face'd
with metric-matched fallbacks in `src/styles/fonts.css`):

| Token | Face | Where |
| --- | --- | --- |
| `--font-hero` + `--font-hero-weight` | DM Sans Medium (500) | the hero lockup only: the wordmark, the "&", "other stories" |
| `--font-heading` + `--font-heading-weight` | DM Sans Medium (500) | every heading: the post title, section heads, DS `H1`–`H4`, a bare `h2`, the hero lede |
| `--font-ui` | DM Sans | the interface: widget chrome, the label voice (`Mono`, the caps), figures, the blog's chrome |
| `--font-display` + `--font-display-weight` | DM Sans Medium (500) | the big numeral: `Stat variant="numeral"` |
| `--font-body` + `--font-body-weight/-size/-line-height/-letter-spacing` | Roboto Mono Regular (400) | reading text (`Body`, and the bare `body`) |
| `--font-code` | Roboto Mono | code — fenced blocks and inline code |

DM Sans and Roboto Mono are ONE family each with discrete static cuts (DM Sans
400/500/700, Roboto Mono 300/400/500, each a latin and a latin-ext file split
by `unicode-range`), so a role names the family AND the weight — set only the
family and the browser picks the cut. A weight with no file (600) lands on the
nearest real cut by the CSS matching rules. `font-synthesis-weight` is off
site-wide (global.css): a weight lands on a real cut or it is not drawn. `Text`'s `family` values are these
roles — `ui | heading | body | hero | code`, and `default`, which inherits.
Live specimens are in the catalogue's first section.

**Do not invent tokens.** If a value has no token, it is a literal in a rule-3
visual or a new token in `tokens.overrides.css` with its reason.

### Slot inventory

| Component | Slots |
| --- | --- |
| `Button` | default, `start-icon`, `end-icon` |
| `Card` / `Widget` | default, `title`, `meta` |
| `CardHeader` | default, `title`, `meta` |
| `Figure` | default, `unit` |
| `Stat` | default (the value), `label` |
| `Legend` / `LegendItem` | default; `value` |
| `PostGroup` / `PostRow` | default; `label` / `meta` |
| `Fig` | default (the image), `caption` |
| `Knobs` | default, `meta`, `note`, `actions` |
| `TileGrid`, `Faces`, `Prose`, `Blockquote`, `HitArea`, `ThemePage` | default |

### After adding a component

1. Add `@import "./<name>.css" layer(ds.components);` to `src/styles/index.css`
   (or, for a catalogue-only component, `import "../styles/<name>.css";` in
   its frontmatter with the file's rules in `@layer ds.components { … }`).
2. Add a labeled section to `src/pages/design-system.astro` showing every variant.
3. Add it to the components list and, if it takes slots, the inventory above.
4. Verify in the browser (`/design-system`, both themes) and confirm no
   React/Stitches leaks into the client bundle.
