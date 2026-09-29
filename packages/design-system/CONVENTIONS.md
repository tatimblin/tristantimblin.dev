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
> unstyled — once per page, and a layout's import counts (`FullHeroLayout`
> imports it, so the homepage doesn't repeat it; the catalogue page imports it
> itself).

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

**Components available (55):** `Box`, `Flex`, `Grid`, `GridItem`, `Text`, `EM`,
`Strong`, `Heading`, `H1`–`H4`, `Body`, `Label`, `Button`, `IconButton`, `Card`,
`CardHeader`, `CardBody`, `Callout`, `Pill`, `Chip`, `Anchor`, `List`,
`ListItem`, `InlineCode`, `Icon`, `VisuallyHidden`, `WidgetGrid`, `Widget` —
the instrument UI (next section): `Mono`, `Figure`, `Stat`, `StatStrip`,
`Hairline`, `TickRuler`, `TimeRuler`, `BarGraph`, `RingGauge`, `Legend`,
`LegendItem`, `TileGrid`, `Tile`, `Faces`, `Face` — the reading UI (the
section after it): `PostList`, `PostGroup`, `PostRow`, `Prose`, `Blockquote`,
`Quilt`, `QuiltCell`, `QuiltPanel`, `SearchBar` — and the art (the section
after that): `ArtFrame`.

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
| `src/components/*.astro`, `src/styles/*.css` | For the ported DS components: edit to fix a fidelity bug or add a variant that exists upstream, keeping API parity. For the instrument UI (Card/Pill/Button chrome and the components below): edit freely — those are this site's, not a port. New component ⇒ add its `@import` to `src/styles/index.css` **and** a section to the catalogue page. |

---

## Instrument UI — the card and widget vocabulary

The cards, widgets and controls are drawn after instrument UIs (a hardware
metronome's screen, a dashboard card): **flat** surfaces a few percent apart,
1px **hairlines**, **one accent** (orange-red) used once per card for the lit
thing / the playhead / the primary action, and everything else the **ink at a
few strengths**. Two voices of type: small tracked uppercase **mono** for
structure, and a big regular-weight **numeral** for values. This is a
deliberate departure from the fidelity-fork rule: `Card`, `CardHeader`, `Pill`,
`Button` and `IconButton` keep the DS prop API but are restyled (no shadows, no
glass, caps mono labels), and the components below have no upstream at all.

**Tokens** (`tokens.overrides.css` → INSTRUMENT UI), all global:

| Token | What it is for |
| --- | --- |
| `--accent` | the one accent (retuned from blue; mixed from `--red-900`/`--orange-900`). `--emphasis` is its tint. |
| `--on-accent` | type ON the accent — the dark ink in both themes (white fails AA on it). The accent Pill, primary Button/IconButton and the carousel's caption title use it. |
| `--lit` | a step/tile/key that is ON — the accent on dark, the **ink** on light. Use for binary on/off; use `--accent` for things that must be orange in both themes. |
| `--wash-1/2/3` | the ink at 7 / 16 / 30 % — unlit tile & subtle pill fill; two stronger steps. |
| `--tone-1..5` | the rank ramp: accent, primary, secondary, tertiary, 22 % ink. For ranked things (legend, share ruler). |
| `--hairline`, `--hairline-strong`, `--hairline-fade` | the edge colour; the STRONG edge (the ink at `--wash-3`) for the one outline on a ruled screen that must read over the plain hairlines inside it — the search bar's box, the card's border, a chip under the pointer; the divider gradient that fades at both ends. |
| `--border-radius-tile` (2px), `--border-radius-pill` (9999px), `--tick-pitch` (4px), `--tracking-mono` (0.05em) | the steps below the generated scales. |
| `--ticks-image` | the tick ruler as a gradient (hairlines on `--tick-pitch`, in currentColor) for any box that should read as a ruler — TickRuler's segments, the player's progress bar. |
| `--focus-ring`, `--focus-ring-offset` | the focus ring for anything focusable that is not a native control: `outline: var(--focus-ring); outline-offset: var(--focus-ring-offset)`. |
| `--duration-*` under `prefers-reduced-motion: reduce` | all 0s, so a transition timed by a token is a cut for that visitor and no component needs a reduced-motion block of its own. |
| light-theme `--gray-*` | retuned warm (hue 80, stone/bone). Page, card, hairline and inks all follow. |

**Card chrome.** `<Widget size title>` is a `Card` with the span classes:
both draw the header through `CardHeader` — `title` as a caps `Mono` on the
left (the prop, or a `title` slot for a title a script rewrites: put the hook
on your own element), the `meta` slot on the right, the fading hairline under —
and `<CardBody>` fills the rest of the cell as a flex column with
`--widget-gap`; put `slot="meta"` on a `Pill`/`Mono`. `squeeze="title"` flips
which side gives in a narrow row: the meta is left unclipped (for a control
that overhangs it or a group that drops its own parts) and the title
ellipsises; `headerClass` puts a class of yours on the header row (Volo makes
it a query container) so nothing selects `.ds-card-header` from outside.
`chrome={false}` drops the frame, fill and clip for content that sits
straight on the page. A widget that must release its cell's aspect says
`aspect-ratio: auto` in its own rule (the DS aspect rules carry no
specificity). `depth` is accepted and ignored. Inside a `WidgetGrid`, every
voice below scales with the cell (`--widget-font-*`); elsewhere it falls back
to the type tokens.

**Faces.** `<Faces>` stacks alternatives in one grid cell, one showing: the
card that flips, the season the arrows page, the range a pill cycles. Every
`<Face>` is rendered; `hidden` ones are `aria-hidden`, which is the attribute
the cross-fade keys on, so a script swaps faces by moving it (Github, Volo and
Readers all do). `fill` takes the rest of a card body and clips each face to it;
without it the stack holds its tallest face's height.

```astro
<Widget size="1x1" title="github">
  <Mono slot="meta" as="a" variant="text" href="…">@handle</Mono>
  <CardBody>
    <TileGrid cols={weeks.length} rows={7} fit="height">…<Tile level={3} />…</TileGrid>
    <Figure unit="contributions">1,457</Figure>
  </CardBody>
</Widget>
```

**Voices.** Two prop names recur and mean the same thing everywhere:
`size` is a step on a named scale — the numeric steps on `Mono` are `Text`'s
own scale (`size={1}` on either is `--font-size-1`; `Mono` adds `0`, the label
step below it), and the `sm|md|lg|xl` steps on `Figure`/`Stat`/`IconButton`
are those components' own — and never a length (a ring's `diameter` is a
length, so it is not called `size`). `tone` is SEMANTIC — which ink, from the
theme (`primary|secondary|tertiary|accent`) — where `color` is DATA: a
specific colour a datum carries (a legend dot, a ruler segment, a team's own
colour), passed as a CSS colour.
- `Mono` — `variant="caps" | "text" | "value"` (caps label / dim sentence case /
  ink figure), `size={0|1|3}`, `tone="primary|secondary|tertiary|accent"`,
  polymorphic `as` (as an `a` it gets the link reset).
- `Figure` — big regular numeral + caps `unit` (prop or `slot="unit"`),
  `size="md|lg|xl"`.
- `Stat` — `value` + `label` (props or default/`label` slots), `size="sm|md|lg"`
  (sm = mono at label size, the dashboard stat pair), `inline`.
- `StatStrip` — a row of hairline-cut cells under a hairline: every child is
  a cell (an equal share of the width, a hairline on its right edge — put
  `Stat size="sm"` pairs in it), and the `action` slot is the last cell, a
  fixed width filled with the accent and `--on-accent` on it: give it the
  link. The bottom strip of the /txt card (`3 MIN / read · 541 / words · FEB
  2026 / published · READ →`).
- `Pill` — `variant="subtle"` (default) `| "outline" | "accent" | info | success
  | warning | danger`; `as="button"|"a"` makes it a pill button; an `Icon` in
  the default slot sits before the text. `size="lg"` is the tab step (the
  small button's height, more air inside) for a row of pill links that is a
  page's control, and `aria-current` on one draws it as the selected tab
  (the subtle fill on an outline row).
- `Chip` — the BOXED chip of the ruled screen: caps mono in a square
  hairline box, no fill, where Pill is the capsule with a wash. `as="a"|
  "button"` makes it a chip button (the strong hairline under the pointer,
  the focus ring); `size="sm"` is the key hint's step. SELECTED is read off
  the chip's own ARIA — `aria-current` (a link that is the current filter)
  or `aria-pressed="true"` (a toggle) — and fills it with the ink; there is
  no `selected` prop to fall out of step with what a reader is told. The
  /txt bar's quick filters, the card's category tag, the browse and none
  faces' links.
- `Button` — `primary` (accent) / `secondary` (ink wash) / `tertiary`; `rounded`
  = pill button. `IconButton` — same variants, `size="xs|small|large|xl"`,
  `rounded` = round button, `square` = no corner, `glyph="−"` a text
  character in place of an icon (aria-hidden; give the button an
  `aria-label`); `variant="outline"` is a hairline and no fill (the wash
  comes up under the pointer) — with `square`, the ruled screen's small
  square button, the /txt stepper. Upstream has only `small|large`; `xs`
  (the pill's height, for a card header's meta slot) and `xl` (the one big
  control a screen has) are this site's steps, an exception to the parity
  rule.

**Hairline graphics.**
- `Hairline` — `fade` (default true), `orientation="horizontal|vertical"`.
- `TickRuler` — `segments=[{share, color?}]` (colours default to `--tone-N` by
  order), `playhead={0..1}` (accent line + dot), `lit` (with a playhead: the
  ticks up to it in the primary ink — a progress ruler), `pitch`, `height`.
  The playhead's position is `--at` on the ruler element, so a script moves
  it with one `style.setProperty("--at", "37%")` (the post page's reading
  ruler does).
- `TimeRuler` — ticks on a time scale: `from`/`to` (`YYYY-MM`, inclusive),
  one tick per month, a taller one on each January with the year under it
  (`--k`/`--months` position the labels), and `marks=[{month, label, href,
  no?, dim?}]` — a tall lit tick per post that is a real `<a>` to it, named
  by `label` (the title and date), filling its month's column so the column
  is the hit area (two posts in a month split it). `playhead="YYYY-MM"` draws
  TickRuler's accent line and dot; `label` (default `timeline`) and `readout`
  are the line above. The contract a script drives: `--at` on the root (the
  playhead glides), `data-month` on every column (find a post's column,
  read its `--k`), `data-mark`/`data-no` on a mark and `data-dim` +
  `aria-disabled` on one outside the filter (tick colour, no pointer),
  `data-time-ruler="readout"`.
- `BarGraph` — `values`, `max`, `lit={i|"last"|"max"}` (an index, where Tile's
  `lit` is a boolean), `height`, `label` (its accessible name; without one it
  is `aria-hidden`, as RingGauge is).
- `RingGauge` — `value={0..1}`, `segments`, `diameter` (a length), `stroke`,
  `label`; children sit in the centre. The arc's length is `--ring-value`
  (0–100) on the root, so a script moves it in one `setProperty` and it
  glides on `--duration-settle` — TickRuler's `--at` rule; update the
  `aria-label` beside it.
- `Legend` — `items=[{label, value?, color?}]` or `LegendItem` children (`label`,
  `value` prop or slot, `color`); dots take `--tone-N` by position.
- `TileGrid` — `cols`, `rows`, `fit="width|height"`, `cells=[{level?, lit?,
  title?}]` or `Tile` children (`level={0..4}`, `lit`, any attribute — e.g.
  `style="grid-column:…"` to place).

The catalogue (`/design-system`) shows every one of these, and a "Widget — the
pieces together" section with three sample widgets.

---

## Reading UI — the archive and the reading column

The blog (`/txt`, `src/layouts/BlogLayout.astro` and `PostLayout.astro`) is the
other family of components with no upstream: a quiet, near-monochrome page in
the UI face, where the accent appears once, on a hovered title. Like the
instrument UI it is this site's own, so its CSS may be edited freely.

- `PostList` — the archive, an `<ol>` of groups. `PostGroup` — one band:
  `label` (prop or slot; a year) in the left third over a full-width hairline,
  its rows in the right two thirds. `PostRow` — one link per row: `href`, the
  title in the default slot, an optional `meta` slot (an `Icon` and a category,
  a count) in a column that lines up down the group, an arrow at the right.
  Hairlines between rows run under the right column only. The rows subgrid into
  one grid, which is what aligns the meta column; on a phone the label stacks
  and the meta wraps under the title.
- `Prose` — the reading container around rendered markdown. It spaces the
  blocks, and retunes `--font-heading` / `--font-heading-weight` IN SCOPE so the
  mapped `H2`–`H4` take the UI face at the Semibold with a hairline under each
  h2 — the token layer doing a theme's job, rather than a rule against
  `.ds-heading`. It also styles the tags markdown leaves raw (`pre`, inline
  `code`, `img`, `hr`, `table`, `del`); the mapped components keep their own
  type. `as` for the tag; `numbered` puts each h2's index (`01`, a CSS
  counter in the mono) before it, for a page whose contents rail numbers the
  same sections.
- `Blockquote` — a quoted passage: `--wash-1` fill, a `--wash-3` bar down the
  left edge, the surface radius on the right corners only. Markdown `>` maps to
  it (`src/components/mdx-components.ts`), so its paragraphs arrive as `Body`.
  Quieter than `Callout`, which is an attention box with a badge.

```astro
<PostList aria-label="Posts by year">
  <PostGroup label="2026">
    <PostRow href="/txt/asserting-on-agent-behavior">
      Asserting on Agent Behavior
      <Fragment slot="meta"><Icon name="code" /> Programming</Fragment>
    </PostRow>
  </PostGroup>
</PostList>
```

### Quilt — the index as a grid of art tiles

`/txt` is a **quilt**: a grid of landscape art tiles on the page, cut by an
even gap token and no lines — the art filling each cell, no text on a tile
— one per post, padded with fillers, under one ruled search bar. Hovering or
focusing a post scatters the others and the ruled card takes a freed 3×2
block; typing filters the same grid; a chip in the bar is a search
shortcut. The package holds the **markup, the geometry and the state
contract** (`styles/quilt.css`, `quilt-panel.css`, `search-bar.css`); every
decision — which cells scatter, where the block goes, what the search found
— is the site's (`src/lib/quilt/engine.ts`, pure; `src/lib/quilt/index.ts`,
the DOM wiring), which paints the attributes below. Nothing here ships JS.

```astro
<SearchBar id="quilt-search" label="Search" placeholder="Search a title, a topic, a year…"
           count="5 posts" hint="/" controls="quilt-panel-results">
  <Chip slot="chips" as="a" href="/txt" data-chip="" aria-current="page">all</Chip>
  <Chip slot="chips" as="a" href="/txt?q=projects" data-chip="projects">projects</Chip>
  <IconButton slot="controls" variant="outline" square size="small" glyph="−" aria-label="Previous post" />
  <IconButton slot="controls" variant="outline" square size="small" glyph="+" aria-label="Next post" />
</SearchBar>
<Quilt cols={5} rows={3} colsMd={3} aria-label="Posts">
  <QuiltCell col={3} row={1} colMd={2} rowMd={1} href="/txt/mega-desk"
             label="The Mega Desk" no="003">
    <ArtFrame svg={raw} decorative />
  </QuiltCell>
  <QuiltCell col={1} row={1} colMd={1} rowMd={2} filler><ArtFrame svg={filler} decorative /></QuiltCell>
  <QuiltPanel id="quilt-panel" mode="hidden" col={3} row={2}
              card={…} browse={…} results={…} nothing={…} />
</Quilt>
```

- `Quilt` — the grid: `cols`/`rows` for ≥ 1024, `colsMd`/`rowsMd` for
  640–1023 (`rows` = max(3, ceil(posts / cols)), explicit so the block always
  has lines). The cells sit `--quilt-gap` apart — `--space-2` on the desktop
  board, `--space-3` below 1024 — with no line between or round them. A
  state fades the cell's contents (the art, a phone tile's caption), never
  the cell, so the active outline holds. `position: relative`,
  `role="group"`, `data-quilt`. Under 640 it is two columns of tiles
  captioned with their titles, in DOM order.
- `QuiltCell` — a post (`href`, `label` = the link's accessible name and,
  on a phone only, the caption under the art — the title alone, no date or
  category; `no`; a decorative `ArtFrame` in the slot, filling the cell;
  above 640 a tile carries no text) or a `filler` (aria-hidden, its art
  faint and grey at every state). Placement is `col`/`row` and `colMd`/`rowMd`, set inline as
  `--cell-col`/`--cell-row`/`--cell-col-md`/`--cell-row-md` — the stylesheet
  picks the pair per viewport; a filler with no tablet slot is dropped
  there, and every filler is dropped on a phone. Renders `data-cell="post |
  filler"`, `data-no`, `data-lg` / `data-md` (has a desktop / tablet slot —
  a filler without one is not drawn on that grid).
- `QuiltPanel` — four faces, every one rendered, each the page colour inside
  the strong hairline, square, no fill, filling the block. `card` is the
  RULED CARD: `{ no, category, minutes, words, month, year, rate, title,
  blurb, why?, href }` — a top strip (the category as a `Chip`, `[INDEX]
  000005 · LOG_005.TXT`) over a hairline; the big mono number (`005`) with
  three small mono readouts under it (`STATUS: PUBLISHED`, `NODE:
  TXT/PROGRAMMING`, `RATE: 180 WPM` — words ÷ minutes) beside the title and
  the excerpt; and a `StatStrip` on the bottom edge — `3 MIN / read`, `541 /
  words`, `FEB 2026 / published` — ending in the accent `READ →` cell, the
  link. `browse` (categories with counts, years, the latest post — `Chip
  as="a"` and `Anchor` links to `?q=`), `results` (`role="listbox"` id
  `<id>-results`, hairline-cut rows `role="option"` id `<id>-opt-<n>`, the
  title with `<mark>` on the query, meta and why; the active row carries the
  accent bar), `nothing` (the sentence, coverage, suggestion chips). Props
  fill them at build; hooks let a script refill in place: `data-card="no |
  index | category | node | rate | minutes | words | month | year | title |
  blurb | why | link"`, `data-results="label | list"`, `data-none="query |
  suggestions"`, and a `<template data-result-template>` with one empty row
  (`data-result="title | meta | why"`) to clone. `flow` renders it in flow
  (the phone rendering) anywhere.
- `SearchBar` — the RULED BAR: one box in the strong hairline, square, no
  fill; `role="search"`; the label visually hidden and the `⌕` glyph in its
  place; the input `type="search" role="combobox" aria-autocomplete="list"
  aria-controls={controls}` in the mono (`name` defaults to `q`, so inside a
  GET form it lands on `?q=` with scripting off); the `chips` slot, a `<nav>`
  named `chipsLabel` (hook `data-search-chips`) of the caller's `Chip` links
  — each a real link to `?q=<word>` with `data-chip="<word>"`, a search
  shortcut that works with scripting off, and `aria-current` on the one whose
  word is the query; a divider and the `controls` slot (the stepper); `hint`
  as a small `Chip`, not drawn without a keyboard; the `count` a visually
  hidden live region (`aria-live="polite"`, `data-search-count`) — the bar
  shows no number. `:focus-within` turns the box to the accent. `value` and
  `expanded` render a state statically. Under 1024 the chips take a row of
  their own under the input and scroll sideways.

**The state contract** — what the script sets, and all it sets:

| On | Attribute / property | Meaning |
| --- | --- | --- |
| a cell | `data-state="lit \| faint \| gone"` | rest; the ghost (`--quilt-faint` opacity, greyscale on a desktop with a pointer); invisible and pointer-less — but a post stays focusable, so Tab still reaches it. On a phone `gone` renders as `faint`. Every state is drawn on the cell's **contents**, not the cell, so the active outline never fades. A **filler is never brighter than faint**: its art is drawn faint and greyscale at every state but `gone`, so the posts are the only tiles at full strength. |
| a cell | `--scatter-delay` (ms) | the stagger into faint/gone (0–240); the return to lit has none |
| a post cell | `data-active` | the 1px accent outline round the tile (the cell's `::after`, over the art's edge) — the search result the arrows are on, the stepped post |
| a chip | `aria-current="page"` | the chip whose word is the query (ALL when it is empty); none for any other query |
| the panel | `data-mode="card \| browse \| results \| none \| hidden"` | which face shows; the others are `visibility: hidden` (out of the a11y tree and tab order), so no per-face `aria-hidden` |
| the panel | `--panel-col`, `--panel-row` | the block's top-left cell, 1-based; the block is `--panel-cols` × `--panel-rows` (3 × 2). On the tablet grid the block is every column, so only the row matters |
| a result row | `aria-selected="true"` | the active row (accent bar + `--wash-1`); mirror it as `aria-activedescendant` on the input |
| the input | `aria-expanded`, `aria-activedescendant` | whether the panel shows; the active option's id |

Transitions run on `--duration-settle` (the scatter) and `--duration-swap`
(faces, the ring), both `0s` under reduced motion. The panel is an
**absolutely positioned grid item**, so its containing block is the grid
area its placement names: it lands on cells by line number, and its content
never sizes a row. It is a size query container, and the card fits its
block — three excerpt lines at a 260px+ block; two at the next title step
down; then the readouts go and the number steps down; then the excerpt;
then the strip's stats (READ stays) — rather than clip; on a big board (a
block ≥ 360px tall and 900px wide) the title steps up to `--font-size-8`
and the excerpt to `--font-size-3`.

**Geometry.** On `/txt` the quilt is the board row of the instrument
(`BlogLayout` with `bar`): the ruled bar, the board and the timeline
straight on the page, in the site container (padded by the site's
`--container-inset`, as the site header and the homepage's rows are, so
the quilt's edges fall on the header's brand and nav) under the site
header. The rows stack at their own height, `--space-3` apart — the quilt
right under the bar, growing with the posts while the page scrolls — and
nothing fills or centres to the viewport; the board is a plain row, no
surface and no inset. The timeline is DOCKED: `position: sticky` to the
window's bottom edge on the page colour (a hairline on its top edge only
while it is stuck, via a `scroll-state` container query), above the tiles
and below the panel, so the quilt scrolls under it; its containing block is
the instrument, so at the end it rests in its own place after the quilt and
never reaches the footer. The cells sit `--quilt-gap` apart and the art
fills each. The panel's 3×2 block spans three cells and the two gaps
between them, so its edges fall on the block's outer cells' edges. The
cell sizes below are the board's at each width.

| Viewport | Columns | Cell | Block | Mode |
| --- | --- | --- | --- | --- |
| ≥ 1024 | `cols` (5) | ~221×124 at 1440 and wider (the container caps it) | 3×2 ≈ 679×256 | hover quilt |
| 640–1023 | `colsMd` (3) | ~228×128 at 768 | full width × 2 rows | hover quilt |
| < 640 | 2 | ~173×97 at 390, plus the title | none — the panel is in flow above the tiles | captioned list, a tap navigates |

---

## Art — the illustration language and its frame

Every post has its own hand-drawn SVG, and the quilt on `/txt` pads the grid
with fillers, all in one language taken from the reference tile sheet
(`.playwright-mcp/refs/illustration-style.jpg`): **white 1px line work and flat
fills in four colours on a near-black landscape plate** — circuits with
right-angle bends and terminal dots, isometric solids, concentric rings, flow
lines, dashed paths, dot fields; systems metaphors, no text, compositions that
crop off the tile's edges. The language is centralised so a file carries only
its drawing: the **tokens** name every colour, the **frame** owns the plate and
the motion, a **validator** holds the rules, and the `post-art` skill
(`.claude/skills/post-art/`) is how an AI session draws one.

**Tokens** (`tokens.overrides.css` → ART, on the theme classes, the same values
in both themes — the plate is a fixed dark, so a light page shows dark windows
on bone; "ink on bone" is a one-block retune later):

| Token | Value | Use |
| --- | --- | --- |
| `--art-plate` | `oklch(17% 0.008 280)` | the tile fill |
| `--art-edge` | `oklch(34% 0.006 280)` | the tile's 1px edge |
| `--art-ink` | `oklch(97% 0 0)` | line work and white fills |
| `--art-ink-2` | the ink at 45% | secondary lines: grids, dashed paths, ghost outlines — the one dimming |
| `--art-lavender` `--art-coral` `--art-cyan` `--art-green` | `#bda3ea` · `var(--accent)` · `#54b4cb` · `#4a9c63` | the fills; coral IS the site accent |
| `--art-radius` | `var(--border-radius-1)` | the frame's corner |
| `--duration-loop` | `6s` (MOTION; `0s` under reduced motion) | one cycle of an art animation |

A file's every `fill`/`stroke` is `none`, `currentColor` (the ink) or one of
these — never a literal, never an `opacity` attribute. The ink plus at most
three of the four colours per file; one dominates.

**Files.** A post's art is `src/content/txt/<slug>.svg` beside its `.mdx`
(the content loader globs only `*.{md,mdx}`, so it is invisible to it);
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
`tests/post-art.spec.ts` enforce all of it. Import a file with `?raw`
(`@whois/design-system/art/_template.svg?raw`, or an `import.meta.glob` with
`query: "?raw"`); it must be inlined, since its colours are tokens and its
motion is the frame's CSS.

**`ArtFrame`** — the window every artwork renders through
(`styles/art-frame.css`): the plate, the edge, the corner, `overflow: hidden`
and the aspect ratio; it strips the file's prolog and comments and puts
`aria-hidden`/`focusable="false"` and a slice fit on the root.

```astro
<ArtFrame svg={raw} label="The Mega Desk" />          role="img" — a hero, the catalogue
<ArtFrame svg={raw} decorative />                     aria-hidden — inside the link that names the post, or a filler
<ArtFrame svg={raw} label="…" play />                 motion running from the start (the open post)
<ArtFrame svg={raw} label="…" ratio="3 / 1" chrome={false} />   another crop; no plate, edge or corner
```

A frame with no `label` is aria-hidden whether or not it says `decorative`;
the art is decorative inside a link, and the **link** carries the title.
`chrome={false}` leaves the ink on whatever is behind it, so on a light page
it wants a dark surface of its own.

**Motion contract.** A file marks at most one group `<g data-motion="spin |
drift | slide | blink | dash" data-speed="0.5 | 1 | 2">`; the frame owns the
keyframes (`transform-box: fill-box; transform-origin: center`), paused at
rest and **running on `:hover`, `:focus-within`, inside a hovered or focused
`a`, or when the frame carries `data-art-play`** (the `play` prop, or a
script's `toggleAttribute`). Durations are fractions of `--duration-loop`
divided by `data-speed`, and every loop is seamless: `spin` one turn; `drift`
a slow alternate translate, out and back; `slide` moves the group left by
exactly 40 units, so draw it repeating every 40 and one period past the right
edge; `blink` dims to 0.3 and back on a hard step, four per loop; `dash`
advances a `4 4` or `2 6` dashed trace by its 8-unit period via
`stroke-dashoffset`, six per loop (the one non-transform/opacity animation —
a bent trace has no transform that does it). The still frame is the poster:
a drawing must read at t=0, and under reduced motion the loop is `0s` and it
is all that ever shows.

The catalogue's "Art" section shows the swatches, the template at tile and
hero size and on both pages, the line weights, the five motions with a
play-all toggle, and the ratio/chrome variants.

---

## Authoring (extending the package)

Everything below is for **rule 4** — adding or extending a component. The package
began as a **faithful, no-React fork**: each PURE (presentational) React/Stitches
component is ported 1:1 to an Astro component + a plain CSS file. Fidelity means
**same prop/variant names, same defaults, same CSS declarations** (referencing
the same token custom properties). Only the delivery mechanism changes.

That rule now has a named exception: the **instrument UI** (previous section)
restyles the card, pill and button chrome and adds components with no upstream.
For those, the file layout, class naming and `.astro` shape below still apply
verbatim — only the "same CSS declarations" clause does not.

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
(no `-2`), weights `--font-weight-400/500/600`, and the light-theme colors
`--text-primary/secondary/tertiary`, `--accent`, `--background`,
`--card-background`, `--border-color`, `--danger`/`--warning`/`--success`
(+ `-emphasis`), the `--gray/blue/green/red/orange/pink-*` scales, `--white`, and
`--hyperlink`; plus the instrument tokens (`--lit`, `--wash-*`, `--tone-*`,
`--hairline`, `--hairline-strong`, `--hairline-fade`, `--border-radius-tile/-pill`,
`--tick-pitch`, `--tracking-mono`). Legacy site aliases live in `bridge.css` (`--color-fg`,
`--color-bg`, `--font-serif`, …). Breakpoints (from Stitches media):
`xs 480 / sm 640 / md 768 / lg 1024 / xl 1280` → standard
`@media (min-width: …)`.

**Fonts are named by role, not by family** (`tokens.overrides.css`; the faces are
self-hosted from `/fonts`, built by `tools/fonts/build.sh`):

| Token | Face | Where |
| --- | --- | --- |
| `--font-hero` + `--font-hero-weight` | Migra Bold | the hero lockup |
| `--font-heading` + `--font-heading-weight` | Migra Medium | `h1`–`h3`, DS `H1`–`H3` |
| `--font-subheading` | FS Mondwest Bold | small-type labels, DS `H4` |
| `--font-body` | PP Mondwest | everything else |

Migra is ONE family with two cuts, so a role that uses it needs the family AND
the weight — set only the family and the browser picks the cut. The DS's own
`--font-display` aliases `--font-body`; `--font-mono` / `--font-numeric` /
`--font-mono-code` are the system mono stack (no web font). Live specimens are in
the catalogue's first section.

**Do not invent tokens.** If the DS style references one not listed, transcribe it
verbatim (it resolves from the theme). Shadows come from the `Shadows[0..3]`
constant in the upstream `tokens/shadows.ts` — transcribe the resolved box-shadow
strings.

### After adding a component

1. Add `@import "./<name>.css";` to `src/styles/index.css`.
2. Add a labeled section to `src/pages/design-system.astro` showing every variant.
3. Verify against the original in the browser (`/design-system`) and confirm no
   React/Stitches leaks into the client bundle.
