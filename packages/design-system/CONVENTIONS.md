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
  motion) applied globally. The theme is set via `class="maximeheckel-light"`
  or `-dark` on `<html>` (see `src/layouts/Layout.astro`), so tokens resolve at
  first paint with no JS.
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

> **The CSS is global, once.** `Layout.astro` imports
> `@whois/design-system/tokens.css` and then `@whois/design-system/styles.css`;
> no page or layout imports either again. Every page renders with the whole
> package's styles, in two cascade layers (below).

**2. Cascade layers.** The package's CSS sits in `@layer ds.components, ds.roles`
(`src/styles/index.css`). The *roles* — heading, body, caps, numeric — compose on
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
— including columns/gutters/breakpoints for `Grid` — and `/design-system/art`
every artwork on both pages. Open it instead of guessing a prop; this doc
deliberately does not duplicate per-component API tables.

**Components available (67):** `Box`, `Flex`, `Grid`, `GridItem`, `Text`, `EM`,
`Strong`, `Heading`, `H1`–`H4`, `Body`, `Button`, `IconButton`, `Card`,
`CardHeader`, `CardBody`, `Pill`, `Chip`, `Anchor`, `List`, `ListItem`, `Icon`,
`VisuallyHidden`, `WidgetGrid`, `Widget`, `WidgetEmpty`, `HitArea` — the
instrument UI (next section): `Mono`, `Figure`, `Stat`, `StatStrip`,
`Hairline`, `RuleLabel`, `DimensionLabel`, `TickRuler`, `TimeRuler`,
`BarGraph`, `Legend`, `LegendItem`,
`TileGrid`, `Tile`, `Faces`, `Face` — the reading UI (the section after it):
`PostList`, `PostGroup`, `PostRow`, `Prose`, `Blockquote`, `Fig`, `Index`,
`IndexRow`, `Quilt`, `QuiltCell`, `QuiltPanel`, `SearchBar` — the art:
`ArtFrame`, the micrographics `Glyph`, `GlyphTile`, and their readouts
`ReadoutStack`, `Formula`, `NumberStream` — and the catalogue's
tooling: `Knobs`, `KnobGroup`, `Knob`, `ThemePage`.

**Client helpers** (`@whois/design-system/lib/*`, plain TS, no DOM at import):
`breakpoints` (`WIDGET_COMPACT_MQ`, `WIDGET_WIDE_MQ`), `faces` (`showFace`,
`shownFace`), `keys` (`stepFromKey`), `lifecycle` (`onPage`), `bar-graph`
(`markBar`, `barsOf`), `readouts` (`parseFormula`, `spokenFormula`,
`numberStream` — the readouts' pure parts). See *Widget grid* below.

## The decision gate

Work top-down. Stop at the first rule that matches.

| # | Situation | Do this |
|---|-----------|---------|
| 1 | What you're building maps to a component (any text/heading, layout, button, card, pill, chip, link, list, icon, a glyph or its keycap tile, a figure, an index table, a hit area) | **Use the DS component.** This is the default. |
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
| `src/tokens/tokens.generated.css` | **Never hand-edit.** It's generated from the upstream package. Regenerate with `bun scripts/gen-tokens.mjs` after `bun update @maximeheckel/design-system`. |
| `src/tokens/tokens.overrides.css` | The **only** place to retune DS token *values* for this site (it wins over generated), and where the site's own tokens live: the type roles and scale steps, the motion vocabulary, the INSTRUMENT UI block (on the theme classes), the ART block. |
| `src/tokens/bridge.css` | Edit to add a legacy-name alias (e.g. mapping a site/Web-Component `--color-*` name onto a DS token). |
| `src/components/*.astro`, `src/styles/*.css` | Edit freely: the package is this site's. For a component that is still a port (`Grid`, `Flex`, `List`, `Anchor`, `Icon`, `VisuallyHidden`) keep the prop names. New component ⇒ add its `@import` to `src/styles/index.css` (in a layer) **and** a section to the catalogue page. |
| `src/lib/*.ts` | Client helpers a widget's script imports; keep them DOM-free at import time. |

---

## Instrument UI — the card and widget vocabulary

The cards, widgets and controls are drawn after instrument UIs (a hardware
metronome's screen, a dashboard card): **flat** surfaces a few percent apart,
1px **hairlines**, **one accent** (orange-red) used once per card for the lit
thing / the playhead / the primary action, and everything else the **ink at a
few strengths**. Two voices of type: small tracked uppercase **labels** for
structure, and a big regular-weight **numeral** for values. `Card`,
`CardHeader`, `Pill`, `Button` and `IconButton` keep a DS-shaped prop API but
are restyled (no shadows, no glass, caps labels), and the components below have
no upstream at all.

**Tokens** (`tokens.overrides.css` → INSTRUMENT UI, on the theme classes unless
noted):

| Token | What it is for |
| --- | --- |
| `--accent`, `--accent-hover` | the one accent (retuned from blue; mixed from `--red-900`/`--orange-900`), and the accent under the pointer (a touch lighter, by relative colour — a primary Button, the strip's action cell). |
| `--on-accent` | type ON the accent — the dark ink in both themes (white fails AA on it). |
| `--lit` | a step/tile/key that is ON — the accent on dark, the **ink** on light. Use for binary on/off; use `--accent` for things that must be orange in both themes. |
| `--wash-1/2/3` | the ink at 7 / 16 / 30 % — unlit tile & subtle pill fill; two stronger steps. |
| `--tone-1..5` | the rank ramp: accent, primary, secondary, tertiary, 22 % ink. For ranked things (legend, share ruler). |
| `--hairline`, `--hairline-strong`, `--hairline-fade` | the edge colour; the STRONG edge (the ink at `--wash-3`) for the one outline on a ruled screen that must read over the plain hairlines inside it — the search bar's underline and ring, the card's border, a chip under the pointer; the divider gradient that fades at both ends. The package reads `--hairline`, never `--border-color`. |
| `--bar-width` (`:root`, 2px) | every solid edge bar: the pull quote's, a post's mark on the tick timeline, the active result's, the /txt progress bar. |
| `--border-radius-tile` (2px), `--border-radius-pill` (9999px), `--tick-pitch` (4px) — `:root` | the steps below the generated scales. |
| `--ticks-image`, `--ticks-image-ink` | the tick ruler as a gradient (hairlines on `--tick-pitch`) in currentColor, and in the ink — for a box that should read as a ruler and cannot take the classes (the player's progress bar). TickRuler draws its own on the same pitch. |
| `--focus-ring`, `--focus-ring-offset`, `--focus-ring-inset` | the focus ring for everything focusable that is not a native control, drawn by `control.css` for every `ds-control`; the offset, and the inset form of it for a control that rings inside its box (set `--control-ring-offset: var(--focus-ring-inset)` in scope). |
| `--playhead-dot` | the playhead's dot (`playhead.css`, the one accent line-and-dot TimeRuler draws). |
| `--shadow-1..3` | the upstream shadow scale on the theme's `--shadow-color`, for the few things that float — a control panel. Cards are flat and take none. |
| `--voice-mono-*`, `--voice-figure-*` | the label voice (family, size, tracking) and the figure voice (family, weight, tracking, size) as custom properties, for a shadow-DOM consumer styled through `::part()`. Mono and Figure read them; a WidgetGrid redefines the sizes on its scale. |
| `--duration-reveal / -settle / -swap / -quick / -loop`, `--ease-reveal` | the motion vocabulary; all `0s` under `prefers-reduced-motion: reduce`, so a transition timed by a token is a cut for that visitor and no component needs a reduced-motion block of its own. |
| light-theme `--gray-*` | retuned warm (hue 80, stone/bone). Page, card, hairline and inks all follow. |

**Controls.** Every control — Button, IconButton, a Pill or Chip as a button or
link, Anchor, PostRow's link, a quilt tile's link, a TimeRuler mark, HitArea —
composes the `ds-control` class (`control.css`): the native reset, the pointer,
`:disabled` and the focus ring, once. A control that must ring inside its box
sets `--control-ring-offset: var(--focus-ring-inset)`.

**Card chrome.** `<Widget size title>` is a `Card` with the size class
(`ds-widget--size-2x1`, …): both draw the header through `CardHeader` —
`title` as a caps `Mono` on the left (the prop, or a `title` slot for a title a
script rewrites: put the hook on your own element), the `meta` slot on the
right, the fading hairline under — and `<CardBody>` fills the rest of the cell
as a flex column with `--widget-gap`; put `slot="meta"` on a `Pill`/`Mono`.
`squeeze="title"` flips which side gives in a narrow row; `headerClass` puts a
class of yours on the header row (Volo makes it a query container) so nothing
selects `.ds-card-header` from outside. `chrome={false}` drops the frame, fill
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
  thin (`--font-display`, Mondwest Thin, at `--font-size-8`) with a caps
  label BESIDE it on the numeral's top edge; the label wraps (a `<br>`, or a
  title and a meta line in the `label` slot).
- `StatStrip` — a row of hairline-cut cells under a hairline: every child is
  a cell (an equal share of the width, a hairline on its right edge — put
  `Stat`s in it), and the `action` slot is the last cell, a fixed width
  filled with the accent and `--on-accent` on it: give it the link. The
  bottom strip of the /txt card.
- `Pill` — `variant="subtle"` (default, the wash) `| "outline"` (the Chip's
  edge: hairline at rest, strong under the pointer); `as="button"|"a"` makes
  it a pill button; an `Icon` in the default slot sits before the text.
- `Chip` — the BOXED chip of the ruled screen: caps in a square hairline box,
  no fill. `as="a"|"button"` makes it a chip button; `size="sm"` is the key
  hint's step. SELECTED is read off the chip's own ARIA — `aria-current` or
  `aria-pressed="true"` — and fills it with the ink. `variant="tab"` is the
  same caps with NO box — a text tab, the tertiary ink at rest, selected the
  ink over a 1px accent underline — and `count` a small superscript figure
  after the label (the search bar's quick filters). The readout TAGS (the
  micrographics' panels): `tone="accent"` draws the box's edge and caps in
  the accent (TELEMATIC), and `variant="arrow"` is a FILLED tag cut to a
  right-pointing chevron by clip-path (a border cannot follow the cut) —
  the ink with the page colour on it, or the accent with `--on-accent`
  under `tone="accent"` (REPLACE). Both are static tags.
- `Button` — `primary` (accent) / `secondary` (ink wash) / `tertiary`; `rounded`
  = pill button; `start-icon`/`end-icon` slots. `IconButton` — `secondary`
  (default, a wash in a hairline) / `outline` (the hairline alone),
  `size="xs|sm|lg|xl"`, `rounded` = round button, `glyph="−"` a text
  character in place of an icon (aria-hidden; give the button an
  `aria-label`). `variant="outline" rounded size="sm"` is the ruled screen's
  CIRCLED control — the − / + stepper at the foot of /txt, the size of the
  search bar's ring.

**Hairline graphics.**
- `Hairline` — a 1px rule fading at both ends; an `hr`, or `as="span"`.
- `RuleLabel` — a caps label under a 1px DOTTED hairline (`--hairline-strong`),
  no box: `no` (a leading number in the accent), the label in the default
  slot, a trailing `meta` slot in the tertiary ink at the far end; `dim` (the
  row and the number in the tertiary ink — a filler's `F_07`), `truncate`
  (one line, ellipsised; the label wraps without it), `lines={2}` (two
  lines reserved, the text at their top, so a row of labels holds one
  height whichever wrap). A quilt entry's title row.
- `DimensionLabel` — `|—•—•— LABEL —•—•—|`: the caps label in the ink,
  centred on a dimension line (an end tick at each edge, a hairline, dots on
  an even pitch; drawn by `::before`/`::after`, never read out). `as="h2"`
  when it heads the section it spans.
- `TickRuler` — `segments=[{share, color?}]` (colours default to `--tone-N` by
  order): a share bar, or a plain stretch.
- `TimeRuler` — a ruler on a time scale: `from`/`to` (`YYYY-MM`,
  inclusive), one slot per month, the year under each January
  (`--k`/`--months` position the labels), and `marks=[{month, label, href,
  no?, dim?, value?, focus?}]` — one per post, a real `<a>` to it, named by
  `label`, filling its month's column so the column is the hit area. Two
  drawings: TICKS (the default) — a tick per month, a taller lit one per
  mark (a `--bar-width` bar), `playhead="YYYY-MM"` the `.ds-playhead`
  (accent line and dot), `label` (default `timeline`) the caps line above;
  BARS (`variant="bars"`, the spec sheet's chart) — a mark is an OUTLINED
  bar its `value` tall against `max` (words per post), the mark in `focus`
  filled with the accent (the playhead's job here; no line is drawn), an
  empty month a tiny tick, a hairline baseline, a SCALE at the right edge
  (`max` … 0), and `label` on a `DimensionLabel` above. The contract a
  script drives: `--at` on the root (the playhead glides), `data-month` on
  every column, `data-mark`/`data-no` on a mark, `data-dim` +
  `aria-disabled` on one outside the filter, `data-focus` on the one in
  focus (bars), `--time-ruler-value` on a mark (bars, its fraction).
- `BarGraph` — `values`, `max`, `mark={i|"last"|"max"}` (the one bar in the
  accent, `data-mark`; an index, where Tile's `lit` is a boolean), `height`,
  `label` (its accessible name; without one it is `aria-hidden`);
  `interactive` for a graph a script reads back — it composes `ds-control`
  (the ring), takes a crosshair once the script has given it `role="slider"`
  (and its name and tabindex; without the script it stays a picture), and
  leaves vertical touch drags to the page. The script moves the accent with
  `markBar(graph, i)` from `lib/bar-graph` and never selects the bar class.
- `Legend` — `items=[{label, value?, color?, swatch?, href?}]` or `LegendItem`
  children (`label`, `value` prop or slot, `color`, `swatch="dot|line|dashed"`
  for a series drawn as one, `href` — the row as a link, a `ds-control`
  filling it); dots take `--tone-N` by position. `variant="leaders"` is the
  spec sheet's KEY: no dot, the label joined to its value by a dotted
  leader (the strong hairline) — the /txt topic key, each category a link
  to its query.
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
element the widget does not render (Volo's header container) or a shadow
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
  (`/txt/tag/<tag>`) are built from it.
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
  row), the fourth air; below 1024 the heads stack. It expects the sectioned
  markup the site's rehype plugin emits (`src/lib/mdx/post-sections.ts`; the
  shape is in `Prose.astro`): images as a `Fig` (`figure.ds-fig`), fences as
  `figure.ds-prose-code` between two hairlines under a header row, a quote with
  an attribution as `figure.ds-prose-quote`; links in the ink on a 1px
  underline (`--hyperlink` and `--anchor-border-color` retuned in scope).
- `Fig` — the numbered figure: the image on a hairline, square, `Fig. 0N /` and
  a caption in the caps voice. `no`, `caption` (prop or slot),
  `layout="flow"` (the caption line under the image — what the plugin emits)
  `| "ruled"` (a row on the page's columns: the label in the first, the image
  and caption across the other three; stacks below 1024 — the post's hero).
- `Blockquote` — the quote on the ruled page, and the one design: no fill, a
  `--bar-width` bar of the accent down the left edge, the words a step up (the
  body role's size and leading retuned in scope), an attribution as a `footer`
  in the caps voice (`<Mono as="footer">`). Markdown `>` maps to it; in a post
  the plugin moves the attribution out into the figure's caption.
- `Index` + `IndexRow` — the table at the foot: rows on `--ruled-columns` (or
  `columns`), baseline-aligned, cut by hairlines, opened by an inverted `head`
  row; a `dim` row is an end with nothing beyond it. Cell classes:
  `ds-index__title` (the reading-size link), `ds-index__span` (the rest of the
  row), `ds-index__fold` (the fourth column, which folds under the title below
  1024; head and dim rows drop it).
- `Anchor` — the DS link, plus `variant="ink"` (the primary ink at rest, the
  accent under the pointer or focus, no underline — the index's titles and
  tags) and `underline="always"` (drawn at rest in the text's colour). `arrow`,
  `external`, `discreet` as upstream.

```astro
<Index aria-label="Index">
  <IndexRow head><Mono>index</Mono><Mono>no.</Mono><Mono>title</Mono><Mono class="ds-index__fold">filed</Mono></IndexRow>
  <IndexRow><Mono>← previous</Mono><Mono tone="primary">004</Mono>
    <Anchor variant="ink" class="ds-index__title" href="/txt/tahoe-mountain-hair/">Tahoe Mountain Hair</Anchor>
    <Mono class="ds-index__fold">jun 2025</Mono></IndexRow>
</Index>
```

### The ruled post — one grid, every row on it

A post (`src/layouts/PostLayout.astro`, `/txt/<slug>`) is one four-column
grid in the site container — `--ruled-columns` / `--ruled-gap` set on the
article, the tokens the ruled `Prose`, `Fig` and `Index` read, so the page's
rows and the body's sections fall on the same lines — under the site header:

1. the STATUS STRIP, one `Grid` row between two `--hairline-strong` rules in
   the caps `Mono`: `TXT / 005` (the ink) · the category (a link to its
   query on the quilt) · `3 MIN · 541 WORDS` · the date `02.02.2026` on the
   right edge (the ink, a `time`);
2. the column numbers `01 02 03 04`, aria-hidden;
3. the TITLE (`Heading as="h1" size={6} responsive` — 72px, 44px below 1024)
   across the first three columns, `--line-height-heading` retuned to 0.95 in
   scope; the LEAD — the excerpt, `Text` at size 5 in the primary ink — in
   the second and third; the art as a MARK (`ArtFrame variant="mark" play`)
   in the fourth, resting on the lead's last line;
4. the HERO, when the frontmatter has one (`hero: { src, alt, caption? }`,
   `src` an image beside the post through the schema's `image()`): a ruled
   `Fig no="01"` around a `<Picture>`;
5. the SECTIONS — `Prose variant="ruled"` around the mapped body, which the
   plugin has cut at each h2 (`00 / Intro` for what comes first; a post with
   no h2s is one section, its text at the same measure as any other);
6. the INDEX, an `Index` at the foot: `INDEX · NO. · TITLE · FILED`, then the
   tags (joined with ` · `, each an ink `Anchor`), the PREVIOUS (older) post
   and the NEXT (newer); an end with nothing beyond it is a dim row,
   `Nothing older` / `Nothing newer`.

Below 1024 it is one column: the strip two by two, no column numbers, the
title at 44px, the mark after the lead at 16rem, the hero and the index
full width (the Fig and the Index collapse themselves).

### Quilt — the index as a spec sheet of art entries

`/txt` is a **quilt**: the spec sheet's grid of entries on the page, cut by
gap tokens and no lines — each a caps LABEL over a dotted rule (the post's
number in the accent, its title) with its art BARE under it (no plate, edge
or corner; the crop is the only edge) — one per post, the newest the 2×2
LEAD at the top-left with its excerpt, the leftover cells fillers tagged
`F_NN`, under the open search bar. Hovering or focusing a post scatters
the others and the ruled card takes a freed 3×2 block; typing filters the
same grid; a chip in the bar is a search shortcut. The package holds the
**markup, the geometry and the state contract** (`styles/quilt.css`,
`quilt-panel.css`, `search-bar.css`); every decision — which cells scatter,
where the block goes, what the search found, which cells are the lead's —
is the site's (`src/lib/quilt/engine.ts`, pure; `src/lib/quilt/index.ts`,
the DOM wiring), which paints the attributes below. Nothing here ships JS.

```astro
<SearchBar id="quilt-search" label="Search" placeholder="Search a title, a topic, a year…"
           count="5 posts" readout="05" hint="/" controls="quilt-panel-results">
  <Chip slot="chips" variant="tab" count={5} as="a" href="/txt" data-chip="" aria-current="page">all</Chip>
  <Chip slot="chips" variant="tab" count={1} as="a" href="/txt?q=projects" data-chip="projects">projects</Chip>
</SearchBar>
<Quilt cols={5} rows={3} colsMd={3} rowsMd={4} aria-label="Posts">
  <QuiltCell col={1} row={1} colMd={1} rowMd={1} span={[2, 2]} href="/txt/asserting-on-agent-behavior"
             label="Asserting on Agent Behavior" no="005" numeral="05" excerpt="I built Aptitude — …">
    <ArtFrame svg={raw} decorative variant="bare" />
  </QuiltCell>
  <QuiltCell col={3} row={2} colMd={3} rowMd={1} href="/txt/mega-desk"
             label="The Mega Desk" no="003" numeral="03">
    <ArtFrame svg={raw} decorative variant="bare" />
  </QuiltCell>
  <QuiltCell col={4} row={1} colMd={1} rowMd={3} filler file={7}><ArtFrame svg={filler} decorative variant="bare" /></QuiltCell>
  <QuiltPanel id="quilt-panel" mode="hidden" col={3} row={2}
              card={…} browse={…} results={…} nothing={…} />
</Quilt>
```

- `Quilt` — the grid: `cols`/`rows` for ≥ 1024, `colsMd`/`rowsMd` for
  640–1023 (the engine's rows: at least 3, and 4 on the tablet grid, where
  the block cannot sit beside the lead and needs two rows under it; explicit
  so the block always has lines). The cells sit `--quilt-gap` apart across
  — `--space-4` on the desktop board, `--space-3` below 1024 — and
  `--quilt-row-gap` (`--space-5`) down, the room a label's rule needs over
  it, with no line between or round them. Rows size to their content: every
  cell in a row is a two-line label over the same 16:9 box, so the arts in
  a row line up. A state fades the cell's contents (a post's link — label,
  art, excerpt as one; a filler's label and art on the same delay), never
  the cell. `position: relative`, `role="group"`, `data-quilt`. Under 640 it
  is two columns of entries in DOM order, the lead across both.
- `QuiltCell` — a post (`href`; `label` = the link's accessible name and the
  label row's title; `no` = `data-no`, the script's key (`005`); `numeral` =
  the number as the label draws it (`05`); `span={[2, 2]}` the lead's
  footprint, as `--cell-cols`/`--cell-rows` and `data-span`; `excerpt`, the
  lead's, under the art at ≥ 640 in `Body`'s voice a step down, 52ch, three
  lines — not drawn on a phone; a decorative bare `ArtFrame` in the slot,
  filling the cell's width) or a `filler` (`file` → the dim `F_07` tag;
  aria-hidden; its art a step back at rest — `--quilt-dim`, grey — and
  never brighter). Placement is `col`/`row` and `colMd`/`rowMd`, set inline
  as `--cell-col`/`--cell-row`/`--cell-col-md`/`--cell-row-md`; a filler
  with no tablet slot is dropped there, and every filler is dropped on a
  phone. Renders `data-cell="post | filler"`, `data-no`, `data-span`,
  `data-lg` / `data-md`; the label is a `RuleLabel lines={2}`
  (`.ds-quilt-cell__label`), the art sits in `.ds-quilt-cell__art`, which
  draws the active ring. The link is a `ds-control`.
- `QuiltPanel` — four faces, every one rendered, each the page colour inside
  the strong hairline, square, no fill, filling the block. `card` is the
  RULED CARD: `{ no, category, minutes, words, month, year, rate, title,
  blurb, why?, href }` — a top strip (the category as a `Chip`, `[INDEX]
  000005 · LOG_005.TXT`) over a hairline; the big number (Mono's value voice
  at the display step) with three small readouts under it beside the title
  and the excerpt; and a `StatStrip` on the bottom edge ending in the accent
  `READ →` cell, the link. `browse`, `results` (`role="listbox"`, hairline-cut
  `role="option"` rows, the active row's `--bar-width` accent bar), `nothing`.
  Hooks let a script refill in place: `data-card="no | index | category | node
  | rate | minutes | words | month | year | title | blurb | why | link"`,
  `data-results="label | list"`, `data-none="query | suggestions"`, and a
  `<template data-result-template>`. `flow` renders it in flow (the phone
  rendering) anywhere.
- `SearchBar` — the OPEN BAR: no box, no fill; `role="search"`; the label
  visually hidden and the search `Icon` in a round outlined RING (the
  stepper's size, `--hairline-strong`, not a control) in its place; the input
  `type="search" role="combobox" aria-autocomplete="list"
  aria-controls={controls}` in the label voice (`name` defaults to `q`) on
  one `--hairline-strong` UNDERLINE that takes the accent on focus, 16px
  under 640 (iOS zooms a smaller field on focus); the `readout` — the count
  as DRAWN, `05` / `2 / 5`, a small value `Mono` at the row's right
  (`data-search-readout`, aria-hidden); `hint` as a small `Chip`, not drawn
  without a keyboard. No stepper: the − / + sit with the in-focus readout
  at the foot (below). Under that row the `chips` slot, a `<nav>` named
  `chipsLabel` (hook
  `data-search-chips`) of the caller's `Chip variant="tab"` links, each with
  its `count`; under 1024 it holds one line, scrolls sideways (no
  scrollbar) and fades at its right edge. `count` is the live region a
  reader hears in full (`aria-live="polite"`, `data-search-count`, visually
  hidden). `value` and `expanded` render a state statically.

**The state contract** — what the script sets, and all it sets:

| On | Attribute / property | Meaning |
| --- | --- | --- |
| a cell | `data-state="lit \| faint \| gone"` | rest; the ghost (`--quilt-faint` opacity, greyscale on a desktop with a pointer); invisible and pointer-less — but a post stays focusable, so Tab still reaches it. On a phone `gone` renders as `faint`. A **filler is never brighter than its rest** (`--quilt-dim`). The label and the art fade together. |
| a cell | `--scatter-delay` (ms) | the stagger into faint/gone (0–240); the return to lit has none |
| a post cell | `data-active` | the 1px accent outline round the art (the art wrapper's `::after`, over the crop's edge; the label is left alone) |
| a chip | `aria-current="page"` | the chip whose word is the query (ALL when it is empty) |
| the panel | `data-mode="card \| browse \| results \| none \| hidden"` | which face shows; the others are `visibility: hidden` |
| the panel | `--panel-col`, `--panel-row` | the block's top-left cell, 1-based; the block is `--panel-cols` × `--panel-rows` (3 × 2) |
| a result row | `aria-selected="true"` | the active row (accent bar + `--wash-1`); mirror it as `aria-activedescendant` on the input |
| the input | `aria-expanded`, `aria-activedescendant` | whether the panel shows; the active option's id |
| the count | `data-search-count` text | the live region, in full: `5 posts`, `2 of 5 posts` |
| the readout | `data-search-readout` text | the count as drawn: `05` at rest, `2 / 5` while a query filters |

Transitions run on `--duration-settle` (the scatter) and `--duration-swap`
(faces), both `0s` under reduced motion. The panel is an **absolutely
positioned grid item**, a size query container, and the card fits its block
(the container queries in `quilt-panel.css`) rather than clip.

**Geometry.** On `/txt` the quilt is the board row of the instrument
(`BlogLayout` with `bar` and `foot`): the search bar, the board and the
FOOT straight on the page under the site header, the rows stacked
`--space-3` apart. The foot (`src/styles/blog.css`, the layout's — the
page only computes and passes its data) is one grid in three parts: the
TOPIC KEY (a `RuleLabel` over a `Legend variant="leaders"` of links to
`?q=<category>`, hook `data-quilt-key`; the script sets the query in place
as it does for a chip) | the TIMELINE (`TimeRuler variant="bars"`, words
per post, hook `data-quilt-ruler`) | IN FOCUS (a `RuleLabel` with the
post's place among the posts in its `meta` — `5 / 5` — over a `Stat
variant="numeral"`: the two-digit number, the title in the ink and `feb
2026 · 554 w` a step back in its label, and the circled − / + `IconButton`s,
`data-step="older|newer"`); under them the corner marks — a `--bar-width`
PROGRESS BAR at the left (`--progress`, the place as a fraction) and the
sheet code at the right. Every readout hook is `data-focus="no | title |
meta | position | progress"`, and the script writes every copy of each. On
a desktop (≥ 1024) the foot is DOCKED: `position: sticky` to the window's
bottom edge on the page colour (a hairline on its top edge only while it is
stuck, via a `scroll-state` container query). On a tablet it stacks — the
key and the focus side by side, the timeline full width under — and sits
in the flow. On a phone the key and the progress go, the focus keeps its
readout but not its stepper (`display: none`, out of the tab order), and a
DOCK (`data-quilt-dock`) sticks to the window's bottom instead: the
progress line, −, the post in focus on one line (`05 · Title`, ellipsised),
+. The stepper is rendered twice; one copy is drawn per viewport, and the
script binds both.

---

## Art — the illustration language and its frame

Every post has its own hand-drawn SVG, and the quilt on `/txt` pads the grid
with fillers, all in one language taken from the reference tile sheet
(`.playwright-mcp/refs/illustration-style.jpg`, gitignored — local only): **white 1px line work and flat
fills in four colours on a near-black landscape plate** — circuits with
right-angle bends and terminal dots, isometric solids, concentric rings, flow
lines, dashed paths, dot fields; systems metaphors, no text, compositions that
crop off the tile's edges. The language is centralised so a file carries only
its drawing: the **tokens** name every colour, the **frame** owns the plate and
the motion, a **validator** holds the rules, and the `post-art` skill
(`.claude/skills/post-art/`) is how an AI session draws one.

**Tokens** (`tokens.overrides.css` → ART, on the theme classes). **The plate
follows the theme.** The values below are the dark palette the language was
sampled on (cyan and green since retuned toward signal neon); the light theme overrides them, so a light page shows ink on bone
rather than black windows: the same drawing, inverted.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--art-plate` | `oklch(17% 0.008 280)` | `var(--gray-300)` | the tile fill |
| `--art-edge` | `oklch(34% 0.006 280)` | `var(--gray-500)` | the tile's 1px edge |
| `--art-ink` | `oklch(97% 0 0)` | `var(--gray-1200)` | line work and "white" fills — dark on light |
| `--art-ink-2` | the ink at 45% | the same mix of the light ink | secondary lines: grids, dashed paths, ghost outlines — the one dimming |
| `--art-lavender` `--art-cyan` `--art-green` | `#bda3ea` · `#5b8def` · `#5ee27f` | each by relative colour from the dark value, hue kept, lightness down and chroma up (green's chroma a touch down, to stay in sRGB) | the fills |
| `--art-coral` | `var(--accent)` | `var(--accent)` (the light theme's own) | coral IS the site accent |
| `--art-radius` | `var(--border-radius-1)` | — | the frame's corner |
| `--scene-glow` `--scene-text-glow` | a 2px drop-shadow in the ink at 40%; a 0.25em text-shadow in the readout's colour | `none` | a scene's CRT bloom (`Scene glow`), the nearest theme deciding |
| `--duration-loop` | `6s` (MOTION; `0s` under reduced motion) | — | one cycle of an art animation |

Draw for both: **`--art-ink` is dark on a light page**, so never rely on a
"white" face being white or on a dark cut being dark. Check a new file in both
columns of `/design-system/art`.

A file's every `fill`/`stroke` is `none`, `currentColor` (the ink) or one of
these — never a literal, never an `opacity` attribute. The ink plus at most
three of the four colours per file; one dominates.

**Files.** A post's art is `src/content/txt/<slug>.svg` beside its `.mdx`;
fillers are `packages/design-system/src/art/filler-NN.svg`. Every file starts
from **`packages/design-system/src/art/_template.svg`**, whose comments carry
the rules (they are stripped on render): `viewBox="0 0 320 180"` on a 10-unit
grid, a 16-unit safe area, at least one shape running out of frame; every
stroked shape `vector-effect="non-scaling-stroke"` (1px at any size) with its
weight by class, `art-line` (1, the inherited default) or `art-line--2` (1.5,
one emphasis outline); dashes `4 4` or `2 6`; isometrics at true 30°; no
`width`/`height`/`style`/`text`/gradients/filters/ids except a `clipPath`'s
prefixed with the slug; ≤ 120 elements, ≤ 12 KB. The validator
(`scripts/validate-art.mjs`, `bun run validate:art <file>`) and
`tests/post-art.spec.ts` enforce all of it. Import a file with `?raw`; it must
be inlined, since its colours are tokens and its motion is the frame's CSS.

**Profiles.** The validator is one scanner with three profiles
(`PROFILES.art`, `PROFILES.glyph`, `PROFILES.scene`; `validateSvg(source, {
profile })`, `validateArt` is the art one). **`art`** is everything above.
**`scene`** is art's language with room for a whole illustration (see
*Micrographics → L4 — scenes*). **`glyph`** is for
the micrographics in `src/glyphs/` (`bun run validate:glyph <file>`): viewBox
`0 0 48 32`, or `0 0 96 32` / `0 0 96 64` wide; no `clipPath`/`defs`/`use`,
no ids, no `class` — every stroked shape states `stroke-width` 1 or 1.5; line
work is `currentColor` (dimmed: `var(--glyph-dim)`), never `--art-ink`, plus at
most two of the four colours; dashes `0.01 3.99` (round-capped dots), `2 2`,
`4 4` — screen px, since `non-scaling-stroke` takes the dash array out of the
viewBox; ≤ 40 elements / 3 KB (80 / 6 KB wide), groups ≤ 3 deep. Motion is
art's contract. The glyph fixtures are `src/lib/validate-glyph.test.ts`
(`bun run test:unit`).

**`ArtFrame`** — the window every artwork renders through
(`styles/art-frame.css`, class `ds-art-frame`): the plate, the edge, the corner,
`overflow: hidden` and the 16:9 box (`--art-ratio` retunes it in scope; the
quilt's cells do); it strips the file's prolog and comments and puts
`aria-hidden`/`focusable="false"` and a slice fit on the root.

```astro
<ArtFrame svg={raw} label="The Mega Desk" />          role="img" — a hero, the catalogue
<ArtFrame svg={raw} decorative />                     aria-hidden — inside the link that names the post, or a filler
<ArtFrame svg={raw} label="…" play />                 motion running from the start (the open post)
<ArtFrame svg={raw} label="…" variant="mark" play />  the MARK: no chrome, the page's ink (the open post)
<ArtFrame svg={raw} decorative variant="bare" />      no plate, edge or corner; the art's own inks, still clipped
<ArtFrame svg={raw} decorative variant="corners" />   bare, with an L-tick at each crop corner
```

A frame with no `label` is aria-hidden whether or not it says `decorative`;
the art is decorative inside a link, and the **link** carries the title.
`variant="mark"` is the drawing ON the page rather than in a window — no
plate, edge or corner, and `--art-ink` retuned in scope to `--text-primary`
(with `--art-ink-2` re-derived from it), so the line work and the "white" faces
are the same ink as the title it sits beside; the fills keep their colours.
`variant="bare"` is the window with its chrome taken away — no plate, edge or
corner — but the art's OWN inks (`--art-ink` follows the theme), still the
16:9 box and still clipped, so the crop is the only edge: the spec sheet's
tile under a `RuleLabel`. `variant="corners"` is bare plus a registration
mark at each crop corner: an 8px (`--space-2`) L of two 1px bars in
`--text-tertiary`, drawn by the frame's `::after` over the art.

**Motion contract.** A file marks at most one group `<g data-motion="spin |
drift | slide | blink | dash" data-speed="0.5 | 1 | 2">`; the host owns the
keyframes (`styles/motion.css`, shared by the frame and the glyphs;
`transform-box: fill-box; transform-origin: center`), paused at
rest and **running on `:hover`, `:focus-within`, inside a hovered or focused
`a`, or when the frame carries `data-art-play`** (the `play` prop, or a
script's `toggleAttribute`). Durations are fractions of `--duration-loop`
divided by `data-speed`, and every loop is seamless: `spin` one turn; `drift`
a slow alternate translate; `slide` moves the group left by exactly 40 units;
`blink` dims to 0.3 and back on a hard step, four per loop; `dash` advances a
`4 4` or `2 6` dashed trace by its 8-unit period via `stroke-dashoffset`, six
per loop. The still frame is the poster: a drawing must read at t=0, and under
reduced motion the loop is `0s` and it is all that ever shows.

The catalogue's "Art" section shows the swatches, the template at tile and
hero size and on both pages (two `ThemePage`s), the line weights, the five
motions with a play-all toggle, and the mark.

---

## Micrographics — glyphs, generators and the tile

The micrographics are the signal-panel marks: waveforms, envelopes, filter
curves, gauges, dials, fans, pip matrices, rings, the exploded iso parts.
They are hairline marks on a 48×32 grid in the art palette, inlined beside
text or set in a keycap tile, and they are built on a ladder, each rung
drawing with the one below:

| Rung | What | Built as | Lives in |
| --- | --- | --- | --- |
| **L0 kit** | geometry that emits SVG element strings with the discipline baked in | pure TS | `src/lib/micro/` (`kit.ts`, `iso.ts`, `geometry.ts`) |
| **L1 glyphs** | fixed marks | a **recipe** on the kit, baked to a file, or a **hand-drawn** file | `src/glyphs/recipes/<name>.ts` → `src/glyphs/<name>.svg` |
| **L2 generators** | parametric marks, drawn from props at build time | a pure function plus a thin component | `src/lib/micro/gen/<family>.ts` + `src/components/<Family>.astro` |
| **L3 modules** | L1/L2 plus HTML text in tiles: the signal chain, a labelled readout | **composition in a page today; a component when reused** in ≥ 2 places (rule 4) | page markup |
| **L4 scenes** | whole illustrations — a projected globe, a sliced mesh, an exploded assembly — with HTML readouts over them | a **scene source** on the kit plus whatever data it needs, baked to a file under the scene profile; `Scene` hosts it | `tools/scenes/<name>/scene.ts` → `src/scenes/<name>.svg` |

Every rung up to L3 renders through one host, so a baked file and a
generated mark are the same `<svg class="ds-glyph">` on the page, and the
validator's glyph profile (see *Art → Profiles*) is the gate on all of
them; a scene renders through `Scene`, an `ArtFrame`, under the scene
profile.

**The tile sheet**, `/design-system/glyphs` (`src/pages/design-system/
glyphs.astro`), shows every registered glyph (72 files: 64 recipes, 8
hand-drawn) and a spread of every generator (13) in tiles, captioned `<family>·NN name` and marked R (recipe), H
(hand-drawn) or G (generator), grouped by family, with the L3 signal chain
and a readouts panel; one tile is `#glyph-<name>` or
`#gen-<component>-<n>`. The families: **A** waves · **B** curves · **C**
instruments · **D** routing · **E** fields · **F** controls · **H** iso
parts — and **G** readouts, the HTML text below, marked T (a glyph file's
family is the sheet's `FAMILY` table; unlisted is F).
The catalogue's "Glyphs" section shows the inline mark, the size scale, the
tiles on both pages, one generator per family, and links to the sheet.

### L0 — the kit

**`lib/micro`** (`import { kit } from "@whois/design-system/lib/micro"`):
pure TS geometry that emits SVG element strings with the language's
discipline baked in — every stroke non-scaling and of a legal weight, every
fill stated, every colour a token — so a recipe composes marks and never
types a paint string.

**Target-aware.** A kit is made for the language it emits — one target
per validator profile: `kit("glyph")`, `kit("art")` or `kit("scene")` — and
the semantic names map per target: paint `ink` is `currentColor` on a
glyph and `var(--art-ink)` on art and a scene, `dim` is `var(--glyph-dim)`
/ `var(--art-ink-2)`, and `blue | red | green | lavender` are `--art-cyan |
-coral | -green | -lavender` on all (`none` is none); weight `hair` is 1
and `line` 1.5 — a glyph's default is `line`, art's and a scene's is `hair`
(its 1.5 is the one emphasis outline) and those two also write the
agreeing `art-line` class; dash `dotted | dash | long` is `0.01 3.99 | 2 2
| 4 4` on a glyph and `2 6 | 4 4 | 4 4` on art and a scene, and `dotdash`
(`6 3 1 3`, an orbit) is the scene kit's alone — `dash()` throws for a
name the target has no array for, so a kit never writes a dash its
profile refuses. A scene's fill may be a **wash**, `k.wash(colour, pct)`:
the colour mixed down to 1–25% over transparent (`color-mix(in oklab,
var(--art-cyan) 22%, transparent)`), the scene profile's one translucency,
fill only. `svg()` writes the target's viewBox unless told another. Signatures read **position, then size, then
an options object**; angles are degrees on a dial (0 up, clockwise);
coordinates are rounded to two decimals (`snap()` to the half grid is there,
not forced); every primitive returns a string, one element or a few on
their own lines.

| Group | Primitives |
| --- | --- |
| points | `dot` (filled; the target's terminal radius) · `pip` (hollow) · `terminal` (square) |
| lines | `line` · `polyline` · `path` · `guide` (dim, hair, dotted) · `wire(points, {radius, start, end})` (rounded elbows, dot or terminal ends) · `leader(from, to)` (a callout ending in a dot) |
| curves | `arc(cx, cy, r, a0, a1)` · `ring` · `band(cx, cy, r0, r1, a0, a1)` (a filled sector with half-disc caps — a thick line is a shape) · `polar` · `onArc` · `spread` |
| marks | `arrowhead` · `chevron` · `plus` · `cross` · `check` · `ticksRadial` · `ticksLinear` · `needle` |
| shapes | `polygon` · `tri` · `rect` · `roundRect` · `pill` · `keycap` · `bracket(x, y, size, corner)` · `hex` · `star(cx, cy, n, inner, outer)` · `coil(x, y, length, turns, r)` |
| iso (`iso.ts`) | `iso(x, y, z, at?)` at a true 30° (`ISO_X` / `ISO_Y` / `ISO_Z` the unit axes) · `isoBox` · `isoCylinder(x, y, r, h, {axis, top, side})` (upright, or lying along `x` / `y`; discs r × r/2) · `isoEllipse(x, y, r, {axis})` (a 2:1 disc on the ground or standing on the x / y face) · `isoRoundRect(x, y, w, d, c)` (flat, rounded corners; `c = d/2` is a pill) · `isoRoundBox(x, y, w, d, h, c, {top, side})` (rounded vertical edges: a shell, a board) · `isoCoil(x, y, r, h, turns)` (a standing spring, one path) · `isoPlane({grid})` · `vanishingGrid` — visible faces only, never a wireframe; a disc keeps ry = r/2, a rounded corner is the true projection so it meets the 30° edges tangent |
| assembly | `group(children, {motion, speed, transform})` (the data-motion contract; a transform with a motion goes on an outer `g`) · `svg({viewBox, children, header})` · `wash(colour, pct)` (a scene's translucent fill) |

```ts
const k = kit("glyph");
export default k.svg({ header: "baked from recipes/dial.ts — edit the recipe", children: [
  k.ticksRadial(24, 18, 10, 13, 5, -120, 120, { weight: "hair", dash: "dash" }),
  k.needle(24, 18, 11, -35, { paint: "blue" }),
  k.guide([[4, 28], [44, 28]]),
] });
```

Its tests (`src/lib/micro/*.test.ts`, `bun run test:unit`) validate every
primitive's output against both profiles.

### L1 — glyphs: recipes, hand-drawn files, the bake, the registry

A glyph is a file, `src/glyphs/<name>.svg`, and it gets there one of two
ways:

- **A recipe** — `src/glyphs/recipes/<name>.ts`, a few lines on the kit,
  default-exporting `recipe((k) => [ …elements ])` (or `{ viewBox?: "0 0 96
  32" | "0 0 96 64", draw(k) }` for a wide one; `Recipe` in
  `src/glyphs/recipe.ts`). **`bun run glyphs:bake`** bakes every recipe
  through `kit("glyph").svg()` under the header `<!-- baked from
  recipes/<name>.ts — edit the recipe -->`, validates each with the glyph
  profile (exit 1, nothing written, on a violation), writes what is stale,
  and removes a baked file whose recipe is gone. **`bun run glyphs:check`**
  is the same comparison with no writes: exit 1 on a stale or orphaned
  file. Edit the recipe, never the baked file.
- **Hand-drawn** — a plain `.svg` with no header, for an organic one-off
  the kit would fight (the eight: `amp`, `compass`, `hand`, `knob`, `lock`,
  `pan`, `speaker`, `toggle`). The bake tells the two
  apart by the header alone and never touches a file without one; a recipe
  and a hand-drawn file of the same name is an error.

**A recipe may call a generator** (or any `lib/micro` export — `iso`,
`polar`, `rng`, `lineD` / `simplify`) and, since a generator is pure, bake
its output as fixed marks: `sine-square`, `phase-cross`, `phase-invert`
and `transient` draw with `wave()`, `cards` with `envelope()`,
`switch-ladder` / `ladder-switch` with `ladder()`. A Drawing's `children`
are the glyph kit's strings on the 48×32 grid, so spread them in place
(`...wave("sine", { amp: 6 }).children`) or, to move, scale or mirror
them, wrap them in ONE group with a transform — `k.group(bars.children,
{ transform: "translate(11.5 0)" })`, `scale(0.5)` for a mark inside a
card, `matrix(1 0 0 -1 0 32)` for the inverted twin. The strokes are
non-scaling, so a scaled generator keeps its weights; a shared drawing
function a recipe exports (`switchLadder(k, mirror)`) is how two glyphs
share one. Keep the whole under the budget and the two-colour cap — a
generator's paints count.

**The registry** (`src/glyphs/glyphs.ts`, `import { glyphSvg, GLYPH_NAMES }
from "@whois/design-system/glyphs"`) is an eager `?raw` glob of the
directory plus `GLYPH_NAMES` (`names.ts`, the `GlyphName` type — add a name
when you add a file). It does not care how a file was made. Its test
(`src/glyphs/glyphs.test.ts`, `bun run test:unit`) holds the names against
the directory, runs the glyph profile over every file, re-bakes every baked
file in memory and fails on a stale one, and fails on a recipe never baked
— so a bake cannot be forgotten and a hand edit to a baked file cannot land.

**Inlining** is `lib/inline-svg` (`inlineSvg(raw, { attrs, host })`,
`viewBoxOf`): the prolog, doctype and comments dropped, `attrs` put on the
root (one the file already carries is kept). ArtFrame and `GlyphSvg` go
through it; a drawing is inlined, never an `<img>`, because its colours are
tokens and its motion is CSS.

### L2 — generators

A generator is a glyph drawn from props at build time: a **pure function**
in `src/lib/micro/gen/<family>.ts`, `(params) => Drawing` (`{ viewBox,
children }`, the children the glyph kit's element strings), exported from
`lib/micro` (`import { wave, gauge, fan, … } from
"@whois/design-system/lib/micro"`), plus a **thin component** that maps its
props to the function and hands the Drawing to **`GlyphSvg`** — the one
host `Glyph` also renders through (`Glyph` is name → file → `GlyphSvg`), so
a generated mark takes the same `size` / `label` / `play` / `class` / rest
(`lib/glyph-host.ts`, `GlyphHostProps`), the same `--glyph-dim`, the same
motion gating and ARIA. Its own hook is `data-gen="<family>"` (plus
`data-shape` / `data-type` / `data-dir` / `data-mode` / `data-mark` /
`data-axis` where the family has kinds).

**The contract.** A generator clamps every parameter into the range its
doc comment states, and falls back to its default on a value that is not a
number or not a name — so its output passes the glyph profile for ANY
input; the same params give the same string (a `seed`, never
`Math.random`); it stays inside the budget by drawing one `path` with many
points rather than many elements, rounding to two decimals and dropping
sub-pixel points (`simplify`, Ramer–Douglas–Peucker at a twentieth of a
unit). Shared props: `paint` (the main line: `ink | dim | blue | red |
green | lavender`, the reference sheet's default per kind) and, where a
family has a second mark, `accent` (the same names, or `none`).

| Fam. | Generator → component | Params (ranges; defaults) | Draws |
| --- | --- | --- | --- |
| A | `wave(shape, {cycles, amp, seed, paint})` → `<Wave>` | shape sine \| saw \| square \| triangle \| noise \| burst; cycles 1–6 (2); amp 1–12 (8); seed (7) for noise and burst; paint per shape | one path in the paint; a burst sits on a dim guide |
| B | `envelope({a, d, s, h, r, paint})` → `<Envelope>` | a d h r relative times 0–1, shared out in proportion; s sustain 0–1; paint blue | one path from the baseline and back; a zero-width stage is left out, not drawn as a hook (ADSR, AR, AD) |
| B | `filter(type, {cutoff, q, paint, accent})` → `<Filter>` | type lp \| hp \| bp \| notch; cutoff 0.05–0.95; q 0.5–10; paint red (lp/hp) or blue (bp/notch); accent red on a bp, else none | the biquad's magnitude in dB over a dim dotted 0 dB guide; a bp's centre as a fine dashed accent |
| B | `curve(points, {nodes, smooth, dotted, paint, accent})` → `<Curve>` | points 2–12 in viewBox units, held to the safe area; nodes true; smooth false; dotted true; paint dim when dotted, ink when solid; accent green | an automation line through the points, a node dot at each |
| C | `gauge(value, {sweep, paint, track})` → `<Gauge value>` | value 0–1; sweep 90–330° (270); paint green; track dim | a thick arc as two filled `band`s (never a wide stroke): the track, the value over it; centred on the tile at any sweep |
| C | `dial(value, {ticks, sweep, paint})` → `<Dial value>` | value 0–1; ticks 2–12 (5); sweep 90–330° (270); paint blue | hair dashed radial ticks, a needle in its own `<g>` (no motion by default — the hook for one), a hub dot |
| C | `ladder(value, {steps, lit, axis, paint})` → `<Ladder value \| lit>` | value 0–1 → `round(value × steps)` lit, or `lit` 0–steps (wins); steps 2–12 (9); axis vertical \| horizontal; paint blue | hairline bars, lit from the bottom / the left; two paths (lit, unlit dim) |
| C | `segments(value, {paint})` → `<Segments value>` | digits, `-`, ` ` (else a blank), 1–8 chars (cut past 8); paint blue | seven-segment digits as line segments — lit in the paint, unlit a dim dotted hair ghost (a solid dim hair reads as "8" at 1×); two paths; 1–4 on 48×32, 5–8 on the wide `0 0 96 32` |
| C | `progress(value, {dotted, paint})` → `<Progress value>` | value 0–1; dotted true; paint green | a filled bar (a `roundRect`, never a wide stroke) from the left, the remainder a dim hair — dotted, or solid — out to an ink end tick marking the whole; three elements at most, under a quarter unit is no bar |
| C | `selector(n, {active, colours, paint, accent, spin})` → `<Selector>` | n 3–12 (8); active 0…n−1, wrapped (0, the top); colours a pip pattern, cycled (ink/dim, red opposite the active); paint blue (centre, input); accent green (active pip); spin | pips on a ring round a centre ring and dot, an input line from the left; `spin` puts the file's one `data-motion="spin"` on the pip ring |
| D | `fan(n, {dir, dotted, paint, accent})` → `<Fan>` | n 2–8 (4); dir split \| merge; dotted; paint blue (dim when dotted); accent red (none drops the input) | a split (1 → n) or merge (n → 1): an accent input line into a node, n cubic branches (one path) to the far edge; `dotted` is the dotted spread. Always 48×32 — eight branches still read apart |
| E | `rings(n, {mode, fade, dotted, paint, accent})` → `<Rings>` | n 1–6 (4); mode chain \| concentric; fade; dotted 0 to n − 1 (concentric); paint red; accent none | `chain`: n linked rings in a row, the unison glyph, `fade` dimming the last; `concentric`: a nested stack out to r 12, the outer `dotted` as dim dotted rings (the halo), `accent` a centre dot |
| E | `matrix(rows, cols, {on, hot, mark, cursor, paint, accent})` → `<Matrix>` | rows 1–6 (4) × cols 1–10 (5); on a pattern (`"10110;01001"`) or row bitmasks (MSB leftmost); mark pip \| dot \| x; hot and cursor `[row, col]`; paint blue; accent red | a grid at pitch 5 (tighter for six rows): `pip` lit filled, unlit dim hollow; `x` the desk operator's x/o grid; `hot` cells and the square `cursor` in the accent. Every mark of one kind in one paint is ONE path, so 60 cells are a handful of elements; past six columns it takes `0 0 96 32` for the 6 KB budget |

- **A meter's ARIA** (`meterAria`, `gen/meter.ts`): with a `label`,
  `<Gauge>`, `<Dial>`, `<Ladder>` and `<Progress>` pass `role="meter"`,
  `aria-valuemin="0" aria-valuemax="100"`, `aria-valuenow` the whole
  PERCENT the drawing shows (a screen reader says "62", not "0.62") and
  `aria-valuetext` — "62%", a ladder's "6 of 9" — in the rest; the host
  keeps the role it was given and adds the label's `aria-label`. Without a
  label they pass none of it and are aria-hidden like any glyph.
  `<Segments>` and `<Selector>` are not meters: labelled, they are the
  host's `role="img"` — give a segments readout its value as the label
  ("045", or "045 BPM").
- **Two colours at most** (the glyph profile's palette): a selector keeps
  its paint, its accent, then its pattern's colours, first come first
  kept, and draws a third in ink — under the default blue centre the
  reference's red pip is ink; `paint="ink"` shows green and red.
- **Spin turns about the group's box** (`transform-box: fill-box`), so a
  spinning ring must be centrally symmetric: an odd `n` adds a dim dotted
  halo round the pips that squares the box.
- **Tests.** `gen/gen.test.ts` (A/B), `gen/instruments.test.ts` and `gen/progress.test.ts` (C),
  `gen/fields.test.ts` (D/E) sweep each function's params, extremes and
  out-of-range values: validate clean, within budget (each viewBox held to
  its own: ≤ 40 elements / 3 KB, 80 / 6 KB wide), deterministic, the
  geometry it claims. `tests/glyphs.spec.ts` renders every component on the
  sheet.

### The host: `Glyph`, `GlyphTile`, motion

- **`Glyph`** — the mark inline (`styles/glyph.css`, the `<svg>` itself is
  the element, class `ds-glyph`): `name` (a `GlyphName`), `size` (`6 | 8 |
  10 | 12`, its HEIGHT on the space scale, numbered as Icon's size is — 6
  is 32px, the 48×32 viewBox at 1×, 10 is 2×, 12 is 3×; in text, with no
  size, it is 1em tall, `vertical-align: middle`, as wide as the viewBox
  makes it — 3:2, or 3:1 wide), `label` (→ `role="img" aria-label`;
  without one it is `aria-hidden` + `focusable="false"`: a mark beside a
  word that already says it), `play` (`data-art-play`, the art's
  attribute, on the root), `class` merged, the rest on the root
  (`data-glyph="<name>"` is always there). A generator component takes the
  same host props.
- **`--glyph-dim`.** The line work is `currentColor`, so a glyph takes the
  colour of its text or a `color` set in scope; `--glyph-dim` is declared
  on `.ds-glyph` as `color-mix(in oklab, currentColor 40%, transparent)`
  and resolves ON THE ELEMENT THAT USES IT — `currentColor` in a custom
  property is not substituted where the property is declared (a `var()`
  would be), so a dim stroke deep in the file is 40% of the glyph's own
  ink, whichever colour it was given. (Measured in Chromium in both
  themes: the toggle's pill computes to the text colour at alpha 0.4, and
  to green at 0.4 on a green glyph.)
- **`GlyphTile`** — the keycap (class `ds-glyph-tile`): a 3:2 cap
  (`__cap`; the `--art-edge` hairline rim, `--border-radius-1`, a
  `--wash-1` fill so it sits a few percent off the page or a card in
  either theme; the rim goes `--hairline-strong` under the pointer) that
  fills its column — a row of them grids with `Grid` — and sizes the mark
  in its default slot itself (just over three quarters of the cap's width,
  the height by the ratio; a glyph's `size` does not apply inside).
  `label` (prop, or the `label` slot for markup) is the caps voice
  (`ds-mono ds-caps`) under the cap, one line; the `readout` slot is drawn
  over the mark, centred, in the spec sheet's thin numeral
  (`--font-display` at `--font-size-7`), in the tile's colour unless its
  content says its own; `wide` is the cap for a 96-unit glyph (keycaps, an
  8-digit Segments, a Matrix past six columns): it spans two grid columns
  and keeps ONE tile's height — `(its width − the gap) / 3`, the gap read
  from `--glyph-tile-gap` (`--space-4` unless the grid says) — so a row's
  caps and labels line up and the wide mark draws at its neighbours'
  scale; `as` (`figure` when the label captions it), `class` merged,
  `id`/`name`/`data-*` pass through. Hovering the tile plays the mark
  inside it.
- **Motion.** The data-motion contract is one file, `styles/motion.css`,
  shared with the art frame: the keyframes, `--duration-loop` (0s under
  reduced motion, so nothing moves and no host needs a block of its own),
  the pause at rest. A glyph runs **on hover of the glyph or of the
  `GlyphTile` it sits in, inside a hovered or focused link, with `play`
  (`data-art-play` on itself) or under any ancestor carrying
  `data-art-play`** — never on focus, since a glyph is not focusable. The
  `dash` keyframe offsets by 8 screen px; a glyph's dash arrays repeat
  every 4 or 8, so every loop is seamless.

**Glyph vs Icon.** `Icon` is a UI AFFORDANCE: a 2px stroke in the ink, a
meaning (chevron, copy, play), sized as a square on the space scale. A
`Glyph` is a MARK — decorative or data: a hairline (1 / 1.5), the art
palette, the text's ink dimmed, aria-hidden unless labelled, 3:2. A thing
the reader acts on or must recognise is an Icon; a thing that decorates a
label, illustrates a reading, or shows a value's shape is a Glyph.

### L3 modules — composition today

A module is L1/L2 marks plus HTML text in tiles, composed in the page with
DS components and tokens: the **signal chain** (`Dial` → the `amp` glyph
with a `readout` "34" → an `Envelope` in stacked tiles → a `Selector`,
joined by the `junction` glyph, caps labels SPEED / AMOUNT / DEST / P.DEST
as tile labels) and the **readouts panel** (`Stat variant="numeral"` for
the caps label and thin numeral, a labelled `Dial`, the G readouts and
Chip's tags) are on the sheet. Text is never inside the SVG. When one is needed in
a second place it becomes a component (rule 4).

### G — readouts: the text beside a mark

The synth panel pairs its marks with small typographic readouts. They are
HTML text (never inside an SVG) that sits centred in a `GlyphTile`'s cap
where a mark would, or beside one in a panel. The gate first: the label
and thin numeral pair ("PHONIC 45") is `Stat variant="numeral"`, and the
boxed and arrow tags are `Chip`'s `tone="accent"` / `variant="arrow"`; three
had no component and are new (`styles/readout-stack.css`, `formula.css`,
`number-stream.css`; the pure parts in `lib/readouts.ts`, tested by
`readouts.test.ts`). Their site use is the micrographic migration's tiles.

- `ReadoutStack` — `values`, `active` (an index, clamped): a list, the
  emphasised value `aria-current="true"` and drawn off that attribute in
  the thin numeral (`--font-display` at `--font-size-6`), the rest the
  label voice in the tertiary ink (the sample-rate tile: 32.0k / **44.1k**
  / 96.0k). Name it with `aria-label`.
- `Formula` — `value` in a tiny syntax (`z^-1`, `x^3`, `f_c`, `x^{n+1}`:
  `^` raises and `_` lowers the next run, a `{…}` group or a sign and
  letters/digits; a hyphen is a minus), drawn in the thin numeral at
  `--font-size-6` with real `<sup>`/`<sub>` in the label face; the drawing
  is aria-hidden and a visually hidden twin says `label`, or the formula
  spoken ("z to the minus 1").
- `NumberStream` — `seed` (7), `rows` 1–8 (2), `digits` 1–16 (10): rows of
  digits in the label voice, tabular, the same for the same seed.
  aria-hidden unless it has a `label` (then `role="img"`). `motion` steps
  the rows up one line at a time, a seamless loop (the rows drawn twice) of
  `--duration-loop` per two rows — the art's clock and its gating: paused
  at rest, running under the pointer, in a hovered tile or link, with
  `play` (`data-art-play`) on itself or any ancestor; `0s`, so still,
  under reduced motion.

### L4 — scenes

A scene is a whole illustration in the art language — the globe, a
sliced mesh, an exploded assembly — that a hand cannot draw and a recipe
cannot hold: it is projected, computed or imported, with data and
dependencies a page must never ship. So it is **baked**: a source at the
repo root draws it through the scene kit, and the site sees only the
committed file.

**The profile** (`PROFILES.scene`, `bun run validate:scene <file>`; its
fixtures `src/lib/validate-scene.test.ts`): art's elements (clipPath and
defs included; still no text, images, gradients, filters, animation),
art's paints plus **one wash form** for a fill only — `color-mix(in oklab,
var(--art-<colour>) N%, transparent)`, N 1–25 — on the **plate** (`0 0 320
180`) or the **square panel** (`0 0 400 400`); art's weights and classes;
art's dashes plus the **dot-dash** `6 3 1 3` (still or spinning, never in a
`dash` group: its period does not divide the motion's 8, and the rule
says so); **two** motion groups (an orbit that spins and a marker that
blinks), each under the contract; ids as art's, prefixed with the scene's
name. **Budget ≤ 400 elements, ≤ 64 KB**, ≤ 3 clipPaths, groups ≤ 4 deep:
elements are the cap that matters — each is a node the DOM lays out and a
motion group composites, and a scene past 400 is drawing many marks where
one path with many points would do — while bytes are the wire cost of a
file inlined into the HTML, set where a scene stays cheaper than the image
it replaces (a coastline is one long `d`; the globe is 57 KB, 26
elements). Palette as art's, a wash counting as its colour.

**Sources and the bake.** A scene is `tools/scenes/<name>/scene.ts`, with
its data, assets and a README of credits beside it, default-exporting
`scene({ viewBox, credit?, draw(k, ctx) })` (`SceneRecipe`,
`src/scenes/recipe.ts`, `import { scene } from
"@whois/design-system/scenes/recipe"`): `k` is `kit("scene")`, `ctx` is `{
name, dir, width, height }` — `dir` the absolute path of the scene's
directory, for reading what sits beside the source — and `draw` may be
async, returning the kit's element strings in paint order. Whatever the
drawing needs at bake time (`d3-geo`, `topojson-client`, `world-atlas`, a
mesh reader) is a **root devDependency**: it runs in the bake and never
ships. **`bun run scenes:bake`** (`scripts/bake-scenes.ts` — in the
package, beside the validator and the glyph bake, because what it writes
and gates is the package's; the sources are the site's) runs every source,
validates each with the scene profile (exit 1, nothing written, on a
violation), writes `src/scenes/<name>.svg` under a two-line header —
`<!-- baked from tools/scenes/<name>/scene.ts (sources <hash>) — edit the
source -->` and `<!-- credit: … -->` — and removes a baked file whose
source is gone; **`bun run scenes:check`** is the same with no writes,
exit 1 on a stale or orphaned file. **Determinism is the contract**: the
same sources give the same bytes (round every coordinate — the globe's
paths to a tenth — never `Math.random` or the clock), because the check
compares bytes. The scenes are committed; the site's build does not bake.

**The registry** (`src/scenes/scenes.ts`, `import { sceneSvg,
sceneCredit, SCENE_NAMES } from "@whois/design-system/scenes"`) is an
eager `?raw` glob plus `SCENE_NAMES` (`names.ts`, the `SceneName` type —
add a name when you add a scene) and the credit read off the header. Its
test (`src/scenes/scenes.test.ts`) holds the names against the directory,
runs the profile over every file, and checks **freshness by the hash**:
the header's hash is the sha256 of everything under `tools/scenes/<name>/`
(paths and bytes, sixteen hex digits), recomputed and compared — not a
re-bake, so the suite loads none of a scene's dependencies or data and
takes no time. What the hash cannot see is a dependency's version (a
d3-geo update that moves a coastline), which is why `scenes:check`
re-bakes; run it before shipping.

**`Scene`** (`styles/scene.css`) — `<Scene name label? decorative? play?
glow? ratio? tone? credit? variant? …>` — is an **`ArtFrame`** (the gate's
first rung: the plate, the edge, the clip, the line weights and the
motion contract are the frame's, with `variant` bare / corners; not
`mark`) with two things added. A **readout layer** over it: `Scene`'s
default slot, a grid-cell sibling of the frame rather than its child,
because a labelled frame is `role="img"` and an image's children are
presentational — text inside it would be lost to a reader — so the layer
is real, selectable, read text; the scene (not the frame) is what hovering
plays (motion.css has the selector). And the **credit** under it: the
file's header's unless said, `false` for none. `ratio` is the box's ratio,
the file's viewBox unless said; `tone` colours the whole layer (the
console's phosphor, `green`; one of the four; `dim`); `glow` is the CRT's
bloom — `--scene-glow` / `--scene-text-glow`, ART tokens the light theme
sets to `none`, so the nearest theme decides and a light `ThemePage` on
the dark page has none; off under `prefers-reduced-transparency` and
forced colours — host CSS on the frame's `<svg>`, never in a file. The
root carries `data-scene="<name>"`; the rest passes through.

**`SceneLabel`** — `<SceneLabel at? x? y? align? variant? size? tone? box?
as?>` — is one readout: placed at one of nine anchors (`at="tl | t | tr |
l | c | r | bl | b | br"`, `--scene-inset` in from the edges, an edge or
the centre putting the label's middle on the axis) or at a point (`x` /
`y`, percent of the frame; `align` says whether the point is the label's
start, centre or end), in the caps voice by default or the thin display
numeral (`variant="numeral"`), at a step of the console — `sm | md | lg |
xl`, 2.2 / 2.6 / 4.4 / 7 units of `--scene-unit`, a hundredth of the
scene's width (the spike's `cqw`, made a token), so plain text **scales
with the scene**; a DS component inside — `Chip tone="accent"` for the
tag, `ReadoutStack` for a stack, `Stat` — keeps its own size. `tone` is the
drawing's own tokens, `box` a hairline round it. Text is never inside the
SVG; this is where it goes.

**The four routes**, chosen by subject:

| Route | For | How | Status |
| --- | --- | --- | --- |
| **Constructed** | an iso platform, a HUD road, the exploded phone, radar chrome | a source composing the kit's primitives, `iso.ts`, `vanishingGrid` and the glyph recipes (`part()`) — no data | **`phone`** (`/design-system#scenes`) |
| **Data** | a globe, maps, terrain, ground tracks | `d3-geo` over Natural Earth (`world-atlas` 110m), a graticule, coordinates to a tenth | **`globe`** (`/design-system#scenes`) |
| **3D → line** | busts, bodies, objects | a `.glb` read directly, vertices welded, plane slices and silhouette edges, a z-buffer for hidden lines, orthographic to the panel | spiked, not ported |
| **Hand vector** | characters with personality | Figma/Illustrator with a placeholder swatch set, an import that swaps each hex for its `var(--art-*)` token and validates | not spiked |

**The constructed route, implemented: `phone`** (`tools/scenes/phone/`).
A constructed scene composes what the package already draws. The iso
parts are glyph recipes (family H, `src/glyphs/recipes/`), all in the
kit's one true-30° projection, so an exploded assembly is those recipes
run again, stacked along one axis (usually z, up the page) so their edges
stay parallel — never their geometry copied into the scene. **`part(k,
recipe, { at, scale?, recolour?, weight? })`** (`src/scenes/parts.ts`,
`import { part } from "@whois/design-system/scenes/parts"`; the recipes
import as `@whois/design-system/glyphs/recipes/<name>`) is the adapter: it
runs `recipe.draw` with a kit of the scene's target, so the paints come
out as the scene's (`--art-*`, `--art-ink-2` for dim, art's dashes and
classes), and wraps the result in one `<g transform="translate scale">`
with the tile's centre at `at`. It carries the two things that differ
from a glyph: a recipe's **unmarked stroke** keeps the glyph's `line`
(1.5) rather than dropping to the scene kit's `hair`, so an outline stays
heavier than its detail; and **`recolour`** maps a paint for that part —
the H parts use all four colours between them and a scene may use three,
so the phone draws its case (shells, handset) in the ink and lets the
internals carry green, red and blue. The rest — the explosion axis, the
wires to square terminals — is the kit at plate coordinates, and the
text is `SceneLabel`s over the outer thirds. The source's hash covers
only its own directory, so an edited recipe is caught by `scenes:check`
(which re-bakes), not the registry test.

**Credits.** A scene drawn from a licensed source — a map, a scan — says
so: `credit` in the recipe (written into the header, shown by `Scene`
under the drawing) and a README beside the source with the licence and
the link. The globe's land is Natural Earth, public domain, via
`world-atlas`; it is credited anyway.

The catalogue's "Scenes" section shows the globe with its readouts on
both pages (`ThemePage`), glowing on the dark one; `tests/scenes.spec.ts`
holds it.

### Adding one — checklists

**A glyph (L1):**

1. Look for a generator first — a curve, a meter, a progress bar, a fan,
   a grid or a ring of any shape is a generator's props, not a new file;
   a generator's mark plus a little more is a recipe that calls it (above).
2. Pick the family (A–H) and the build: a **recipe** for anything the kit
   can say (rings, ticks, arcs, wires, shapes, iso); **hand-drawn** only
   for an organic one-off the kit would fight.
3. Recipe: `src/glyphs/recipes/<name>.ts` → `recipe((k) => […])`, then
   `bun run glyphs:bake`. Hand-drawn: `src/glyphs/<name>.svg`, no header,
   then `bun run validate:glyph src/glyphs/<name>.svg`.
4. Add the name to `GLYPH_NAMES` (`src/glyphs/names.ts`); if it is not a
   control, give it a family in the sheet's `FAMILY` table.
5. `bun run glyphs:check`, `bun run test:unit`, then look at it on
   `/design-system/glyphs#glyph-<name>` in both themes.

**A generator (L2):**

1. The function in `gen/<family>.ts`: params typed, ranges in the doc
   comment, clamped with `clamp` / `clampInt` / `paintOf`, `K` the glyph
   kit and `SAFE` the 4–44 × 4–28 area from `gen/base.ts`; returns a
   `Drawing`.
2. Re-export it from `gen/index.ts` and `lib/micro`'s index.
3. A `<Family>` component of a few lines on `GlyphSvg` (with `data-gen`,
   and `meterAria` in the rest if it is a meter).
4. A sweep in the family's `gen/*.test.ts`: params, extremes and
   out-of-range values validate clean, within budget, deterministic, the
   geometry it claims.
5. Variants on the sheet (the `spread` table in `glyphs.astro`), the
   component in `GENERATORS` in `tests/glyphs.spec.ts`, a row in the table
   above.

**A scene (L4):**

1. Pick the route (above). Constructed: the kit alone. Data or 3D: the
   dependency as a root devDependency (`bun add -d`), the data beside the
   source or read from `node_modules` at bake time.
2. `tools/scenes/<name>/scene.ts` → `scene({ viewBox, credit, draw })`,
   drawing with `kit("scene")` (`k.wash()` for the one translucency,
   `dotdash` for an orbit); round every coordinate; a README with the
   credits if any source is licensed.
3. `bun run scenes:bake`; add the name to `SCENE_NAMES`
   (`src/scenes/names.ts`).
4. `bun run scenes:check`, `bun run test:unit`; then `<Scene name>` with
   its `SceneLabel`s on `/design-system#scenes` in both themes, hovered
   (the motion) and under reduced motion (still).

---

## Catalogue tooling

- `ThemePage theme="light|dark"` — a piece of one theme's page inside the
  other: the theme class, the page colour, the ink, a hairline box, labelled.
  Every themed token re-resolves inside it (which is why the instrument tokens
  sit on the theme classes, not `:root`).
- `Knobs` / `KnobGroup` / `Knob` — a playground's control panel: a card
  surface with `--shadow-3`; a title row (`title`, the `meta` slot), a `note`
  slot, a scrolling body of `Knob` rows (`label`, `type="range|color|checkbox|
  text"`, `out` for a live `<output data-out>`, the default slot for a row
  that holds its own inputs; every other prop goes to the input) in
  `KnobGroup` fieldsets (`legend`), and an `actions` slot of Buttons. The
  page places it (`/dotgrid`, the catalogue's token editor).

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
  `ds-bar-graph`, `ds-art-frame`).
- **Element:** `ds-<name>__<part>`.
- **Variant class:** `ds-<name>--<key>-<value>`, key kebab-cased:
  `.ds-button--variant-primary`, `.ds-flex--gap-3`. Boolean variants
  `ds-<name>--<key>-true`; emit the class only for values that carry rules.
- **Shared classes** a component composes in its template: `ds-control` (every
  control), `ds-mono ds-caps` (the caps voice), `ds-playhead`.
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
`--font-weight-200/400/500/600/700` (`200` and `700` are the site's: Mondwest's
Thin, and the Bold cut Mondwest and Migra ship), the leadings `--line-height-heading/-body/-ui` (1.15 / 1.6 / 1.3),
the trackings `--tracking-heading` (0, a bitmap face), `--tracking-caps` (0.1em),
`--tracking-mono` (0.04em), the theme colors `--text-primary/secondary/tertiary`,
`--accent`, `--accent-hover`, `--on-accent`, `--background`,
`--card-background`, `--border-color` (site CSS may read it; the package reads
`--hairline`), `--danger`/`--warning`/`--success`, the `--gray/blue/green/red/
orange/pink-*` scales, `--hyperlink`, the `--token-*` code palette, and
`--shadow-color`; plus the instrument tokens (previous section: `--lit`,
`--wash-*`, `--tone-*`, `--hairline*`, `--bar-width`, `--tick-pitch`,
`--ticks-image*`, `--focus-ring*`, `--playhead-dot`, `--shadow-1..3`, the
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
1024px)`: the quilt's desktop gap). The two spellings of one step differ by 1px
(`max-width: 900px` / `min-width: 901px`). A rule about a CELL, not the
viewport, is a container query on the grid (`@container widget`).

**Fonts are named by role, not by family** (`tokens.overrides.css`; the faces
are self-hosted from `/fonts`, built by `tools/fonts/build.sh`, @font-face'd
with metric-matched fallbacks in `src/styles/fonts.css`):

| Token | Face | Where |
| --- | --- | --- |
| `--font-hero` + `--font-hero-weight` | Migra Bold | the hero lockup only (the wordmark takes the Medium itself) |
| `--font-heading` + `--font-heading-weight` | Mondwest Bold | every heading: the post title, section heads, DS `H1`–`H4`, a bare `h2`, the hero lede |
| `--font-ui` | Mondwest Regular | the interface: widget chrome, the label voice (`Mono`, the caps), figures, the blog's chrome, the search bar; `--font-numeric` aliases it |
| `--font-display` + `--font-display-weight` | Mondwest Thin (200) | the big thin numeral: `Stat variant="numeral"` |
| `--font-body` + `--font-body-weight/-size/-line-height/-letter-spacing` | Neue Montreal Regular | reading text (`Body`, and the bare `body`) |
| `--font-code` | the system mono stack | code alone — fenced blocks and inline code; no file is loaded (`--font-mono` is its legacy name) |

Migra and Mondwest are ONE family each with discrete cuts (Migra 500/700;
Mondwest 200/300/400/700), so a role that uses one names the family AND the
weight — set only the family and the browser picks the cut. Neue Montreal
ships 400/600. `font-synthesis-weight` is off site-wide (global.css): a weight
lands on a real cut or it is not drawn. `Text`'s `family` values are these
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
| `RuleLabel` | default (the label), `meta` |
| `StatStrip` | default (the cells), `action` |
| `Legend` / `LegendItem` | default; `value` |
| `PostGroup` / `PostRow` | default; `label` / `meta` |
| `Fig` | default (the image), `caption` |
| `GlyphTile` | default (the glyph), `label`, `readout` |
| `Knobs` | default, `meta`, `note`, `actions` |
| `SearchBar` | `chips` |
| `DimensionLabel`, `TileGrid`, `Faces`, `Index`, `IndexRow`, `Prose`, `Blockquote`, `HitArea`, `ThemePage`, `Quilt`, `QuiltCell` | default |

### After adding a component

1. Add `@import "./<name>.css" layer(ds.components);` to `src/styles/index.css`.
2. Add a labeled section to `src/pages/design-system.astro` showing every variant.
3. Add it to the components list and, if it takes slots, the inventory above.
4. Verify in the browser (`/design-system`, both themes) and confirm no
   React/Stitches leaks into the client bundle.
