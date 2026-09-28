---
title: "feat: The writing quilt — /txt as a searchable grid of post art, in a new illustration language"
type: feat
created: 2026-09-28
origin: design conversation of 2026-09-27/28 (prototypes in .playwright-mcp/blog-canvas/project/, reference in .playwright-mcp/refs/illustration-style.jpg)
---

# feat: The writing quilt

## Summary

Rebuild `/txt` as a **quilt**: a grid of landscape art tiles, one per post, padded
out with decorative fillers while the blog is small. Hovering (or focusing) a post
scatters every other tile — each vanishes or goes faint, on a random stagger that is
deterministic per post — and the post's text card fades into a freed 3×2 block of
cells. A **full-width search bar above the quilt** filters the same grid live:
matching tiles stay lit, everything else scatters, and the freed block shows a
browse panel, a result list with highlighted titles and a "why it matched" line, the
full card for a single hit, or a never-dead-end "nothing" panel with suggestions.
Keyboard runs all of it (`/` or ⌘K to focus, ↑↓ Enter Esc).

Every post gets its **own hand-drawn SVG** in a new illustration language taken from
the reference image (white 1px line work and flat lavender/coral/cyan/green fills on
a near-black landscape plate — circuits, isometric solids, rings, flow lines, no text
in the art). The language is **centralised**: art tokens, a frame component that owns
size/border/theme/a11y/motion, a validator in the test suite, a catalogue page in both
themes, and a Claude skill (`.claude/skills/post-art/`) that an AI session loads to
draw a post's art. The five existing posts get their art through that skill, as its
live test.

The post page is restyled onto the instrument UI (tick-ruler reading progress, art as
hero beside kicker/title/excerpt/stats/tags, a contents rail, prev/next as art),
reusing the committed `PostLayout` / `Prose` / `Blockquote`. Everything new goes into
`@whois/design-system` with catalogue sections and CONVENTIONS entries; pages stay
thin; chrome lives in `src/layouts/`.

The first phase ships the card-header fix that is live-broken on production,
independently, then re-bases the four unpushed blog commits (which are kept as the
foundation) on top of it.

---

## Decided (so this plan stands alone)

1. **Where.** The blog stays its own page, `/txt`. The homepage is out of scope
   (the site header's default `Writing → /txt` link is the entry point).
2. **The index is a quilt.** Post art tiles plus filler tiles. Hover/focus on a post
   scatters the others (each randomly vanishes or goes faint ≈0.2 opacity grayscale,
   random stagger ≤ ~250 ms, deterministic per post) and a text card fades into a freed
   3×2 block: kicker `NO. 005 · FEB 2026`, big regular-weight title, the excerpt, and
   `CATEGORY · 3 MIN · READ ↗` in the accent. The block hides the fewest matching
   posts, never covers the focused post, and sits farthest from it. Leaving restores.
3. **Search is a full-width bar above the quilt, not a tile.** `SEARCH` caps label,
   the input ("a title, a topic, a year…"), a live `2 OF 5` count, a `/` key hint;
   accent border on focus; `/` and ⌘K focus it. Focused-empty → browse panel
   (categories with counts, years, latest post; post tiles stay lit, fillers go faint).
   Typing → matches lit, rest scattered; panel lists up to 4 results with the query
   highlighted, `date · category`, and `MATCHED TAG · HOME OFFICE`. ↑↓ moves the
   active result (accent ring on its tile), Enter opens, Esc clears, second Esc blurs.
   One match → the full card with `MATCHED …`. No match → `Nothing for "x".`, a line on
   what search covers, suggested words/categories as pills. Every query word must
   prefix-match some word; weights title 3 > category 2.5 > tags / month+year 2 >
   summary 1; ties newest first. Index built at build time, filtered client-side.
   Pagefind is the later upgrade if full text is ever wanted.
4. **The illustration style is the new reference image**, replacing the Bauhaus
   "one word on a plate" symbols in the prototype. Landscape tiles; per-post SVGs
   authored by AI through a skill; a centralised language (tokens, frame component,
   motion rules, validator, catalogue, skill). See *The art language*.
5. **Post page** per `Post.dc.html`, reconciled with the committed `PostLayout`.
6. **Build on the design system.** New pieces go into the package with catalogue
   sections and CONVENTIONS updates. One client script with the
   `astro:page-load` / `astro:before-swap` lifecycle.
7. **Repo state.** `master` = `origin/master` (271b859, live) + five unpushed
   commits. `7780716` (the empty-card-header fix) ships first and alone. The white
   minimal index is superseded; the four other commits are kept as the base.
8. **Deploy and tests.** GitHub Actions is blocked (billing); deploy locally
   (`bun run build`, strip gitignored `public/` files from `dist` except
   `fleet-demo`, `wrangler pages deploy dist --project-name=tristantimblin
   --branch=master`, `git lfs push origin master` before `git push`). Tests are
   `bun run test` (Playwright; Chromium runs everything, Firefox runs one spec and
   cannot launch on this Mac).
9. **How work gets done.** Subagents, one commit per unit, Conventional Commits in
   lowercase; `fable` for hard/architectural units, `opus` for well-defined ones;
   every unit verifies with screenshots in both themes at 1440 and 390 (tall
   viewports, `.playwright-mcp/shot-url.mjs` pattern) plus the build and tests; the
   orchestrator reviews between phases.

---

## Key technical decisions

- **Landscape cells, 5 columns on desktop, panel = 3×2.** The reference's tiles are
  ~1.9:1; the cell is `16 / 9` (a token, `--quilt-aspect`). At the 1200px container
  a 5-column cell is ~230×130 — the reference's tile scale — and the 3×2 block is
  ~715×270, which holds the card at `--font-size-7` (32px) titles. (A 4-column grid
  with a 2×2 block was the alternative; rejected to keep the decided 3×2 block.
  Geometry is in *Quilt geometry* below.)
- **Phones are a captioned list, not a hover quilt.** Tiles have no text in the
  art, so a tile a phone cannot hover is unreadable. Under 640px the quilt becomes
  two columns of *captioned* tiles (art, then title and `MMM YYYY · CATEGORY` under
  it), fillers drop, the panel renders as an in-flow block between the search bar and
  the grid (results / browse / nothing), and a tap navigates. No tap-to-reveal.
  Tablet (640–1023) keeps the hover quilt at 3 columns. *Open question 1.*
- **Art stays dark-plated in both themes.** The palette was chosen against
  near-black and white line work is the language; the plate is a fixed dark token
  (`--art-plate`), not the theme's card colour, so a light-theme page shows dark
  windows on bone, the way the instrument references show dark screens on light
  devices. The tokens make "ink on bone" a one-file switch later. *Open question 2.*
- **The art coral is the site accent.** `--art-coral: var(--accent)` — one warm
  colour on the page, so the card's accent meta beside coral art never reads as two
  near-oranges. The sampled reference coral (#ea6a4f) is within a hair of the accent.
- **Art files are `.svg` beside the post** (`src/content/txt/<slug>.svg`), read with
  `import.meta.glob(…, { query: "?raw", import: "default", eager: true })` and
  inlined by the frame (inline is required for token colours and hover motion). The
  collection loader's glob is `**/*.{md,mdx}`, so the SVGs are invisible to it.
  Filler art lives in the package (`packages/design-system/src/art/`), since the
  quilt ships it. All strokes use `vector-effect="non-scaling-stroke"` so a line is
  1px at tile size and 1px in the post hero, as in the reference.
- **Motion is CSS, opted into by attribute.** Art marks one group
  `data-motion="spin|drift|slide|blink|dash"`; the frame's stylesheet owns the
  keyframes (`transform`/`opacity` only, `transform-box: fill-box`, so no inline
  `transform-origin`), paused until `:hover`/`:focus-within`/`[data-art-play]`,
  and timed by a new `--duration-loop` token that the existing reduced-motion block
  zeros — so the still frame is the poster and reduced motion costs nothing extra.
- **Behaviour in the site, contract in the package.** The DS stays presentational
  (no JS ships from it today). `Quilt`, `QuiltCell`, `QuiltPanel` and `SearchBar`
  render markup + CSS with a documented data-attribute/state-class contract
  (`data-quilt`, `data-cell`, `data-state="lit|faint|gone"`, `--scatter-delay`);
  `src/lib/quilt/engine.ts` (pure: scoring, block choice, scatter hash — Node-testable)
  and `src/lib/quilt/index.ts` (DOM wiring, lifecycle) drive it.
- **Search state is URL-addressable.** `/txt?q=projects` pre-fills the query on load;
  the browse pills and the "nothing" suggestions are real links to `?q=…`, so with JS
  off they still land on the quilt. Category URLs become those queries (see next).
- **Categories: keep the routes, drop the page.** `/txt/category/<id>` and
  `/txt/tag/<tag>` keep resolving as the year-grouped `PostIndex` list (they are
  real pages that work with JS off, and tag URLs predate the redesign); both are
  `noindex`. `/txt/categories` and its nav link go; `public/_redirects` sends it to
  `/txt` (301). The post header's category and tag pills link to those routes.
  *Open question 4.*
- **`PostList` / `PostGroup` / `PostRow` stay in the DS.** They render the category
  and tag pages and the phone result list (rule 4: the same list pattern in three
  places). `Prose` and `Blockquote` are unchanged.
- **Post number and reading time are computed at build** in `src/lib/blog.ts`:
  `postNumber` = 1-based chronological index over non-draft posts, zero-padded
  (`005`); `readingStats(body)` = words and `ceil(words / 200)` minutes.
- **The validator is one module, two callers.**
  `packages/design-system/scripts/validate-art.mjs` (a CLI the skill runs on one
  file) and `tests/post-art.spec.ts` (a browserless Playwright test over every art
  file, the `shader-source.spec.ts` pattern).
- **The catalogue gets a second page for art.** `src/pages/design-system/art.astro`
  (`/design-system/art`, noindex) renders every post's art and every filler in both
  themes side by side, via `.maximeheckel-light` / `.maximeheckel-dark` wrapper
  divs (the token classes scope by ancestor), with a motion toggle and each file's
  size/element count. The main catalogue gets the token, frame, quilt, panel and
  search-bar sections.

---

## The art language (the spec the skill is written from)

**What the reference is** (`.playwright-mcp/refs/illustration-style.jpg`, 4×4
tiles on a #202020 page): landscape tiles ~1.9:1 with a thin grey hairline border
and a small radius, interiors a touch darker than the page. **White 1px line work**:
circuit traces with right-angle bends and terminal dots, fine grids, isometric
wireframe boxes and cylinders, concentric rings, converging/fanning flow lines,
dashed paths, tick marks. **Flat solid fills** in five colours — white, lavender,
coral, cyan, green — never gradients, never tints; a few pseudo-isometric solids
with white top faces and coloured or dark sides. **Subjects are systems metaphors**:
nodes, chips, pills/capsules, cursors, checkboxes, scattered dots, stacked cards,
a rolled tape/ribbon, folded planes. **Compositions crop off the tile edges**
(objects run out of frame on one or two sides) and sit off-centre; sparse, with
generous dark space. **No text anywhere in the art.**

### Tokens — `tokens.overrides.css`, an ART block after INSTRUMENT UI

| Token | Value | Use |
| --- | --- | --- |
| `--art-plate` | `oklch(17% 0.008 280)` (≈ #18181f, sampled tile interior) | the tile fill, both themes |
| `--art-edge` | `oklch(34% 0.006 280)` (≈ #3d3d42) | the tile's 1px border, both themes |
| `--art-ink` | `oklch(97% 0 0)` (≈ #f6f6f6) | line work and white fills |
| `--art-ink-2` | `color-mix(in oklab, var(--art-ink) 45%, transparent)` | secondary lines: grids, dashed paths, ghost outlines |
| `--art-lavender` | `#bda3ea` (sampled #b8a0e8/#c0a0e8) | fill |
| `--art-coral` | `var(--accent)` (sampled #ea6a4f; ties to the site accent) | fill |
| `--art-cyan` | `#54b4cb` (sampled #50b0c8/#58b0c8) | fill |
| `--art-green` | `#4a9c63` (sampled #489860/#409860) | fill |
| `--art-radius` | `var(--border-radius-1)` (8px) | the frame's corner |
| `--duration-loop` | `6s` (0s under `prefers-reduced-motion`, in the existing block) | one cycle of an art animation |

Fills may use only `var(--art-*)`, `none` or `currentColor`; strokes only
`var(--art-ink)` / `var(--art-ink-2)` / a fill colour. Both themes resolve the same
values (decision above); the light theme is free to retune `--art-plate`/`--art-edge`
later without touching a file.

### Geometry

- `viewBox="0 0 320 180"` (16:9). A 10-unit grid; sit things on it. Safe area
  inset 16 on every side: nothing *important* lives inside it, but shapes are
  **expected** to run out of frame — at least one element crosses an edge in most
  tiles. The frame clips.
- Strokes: `stroke-width` **1** (default, `.art-line`) or **1.5** (one emphasis
  outline, rare) — always with `vector-effect="non-scaling-stroke"` so the line is
  1px on screen at any render size. `stroke-linecap="round"`, `stroke-linejoin="round"`
  for organic paths; square for circuit traces. Dashes `4 4` or `2 6` (units).
- Isometric solids: true 30° — right axis `(0.866, 0.5)`, left `(-0.866, 0.5)`, up
  `(0, -1)`. Top face `--art-ink`; sides `--art-plate` with an ink outline, or one
  fill colour. Cylinders: an ellipse with ry = 0.5·rx.
- Terminal dots on traces: r 2.5. Scattered dots: r 1.5–3, `--art-ink` or one fill.
- Palette per tile: `--art-ink` plus **at most three** of the four colours; one
  colour dominates.
- Budgets: ≤ 120 elements, ≤ 12 KB, ≤ 3 `<clipPath>`s, depth ≤ 4 groups.

### Motion

- Only on hover, focus, or on the open post (`data-art-play` on the frame, set by
  the post page). One moving idea per tile — a spinning reel, a drifting dot field,
  a sliding tape, a blinking node, a dashed path advancing. `transform` and
  `opacity` only. The still frame is the poster (the art must read with the
  animation at t=0). Loops are seamless (a `spin` ends where it starts; a `drift`
  is a translate that wraps inside a `<clipPath>`; a `slide` translates a repeating
  group by exactly one period). Duration from `--duration-loop` (multiples allowed:
  `--art-speed: 0.5|1|2`). Reduced motion: zero duration → nothing moves.
- Markup: `<g data-motion="spin" data-speed="1">…</g>` — at most one `data-motion`
  per file. The frame's CSS applies `transform-box: fill-box; transform-origin:
  center;` and the keyframes, `animation-play-state: paused` by default.

### A11y

- The art is decorative inside a link: the frame renders `<svg aria-hidden="true"
  focusable="false">`; the **link** carries the post title (`aria-label` or visible
  caption). A frame used standalone (hero, catalogue) takes `label` and renders
  `role="img" aria-label`. Fillers are `aria-hidden` and never focusable.
- Contrast is not a requirement inside decorative art, but `--art-ink` on
  `--art-plate` is ~15:1 anyway.

### File layout

```
src/content/txt/<slug>.mdx        the post
src/content/txt/<slug>.svg        its art (the drawing only: no width/height, no
                                  <style>, no <title>, no xmlns:xlink, no ids that
                                  could collide except clipPath ids prefixed <slug>-)
packages/design-system/src/art/filler-01.svg … filler-12.svg
packages/design-system/src/art/_template.svg   the starting file (grid comment,
                                               safe-area comment, one group)
packages/design-system/src/components/ArtFrame.astro
packages/design-system/src/styles/art-frame.css
packages/design-system/scripts/validate-art.mjs
tests/post-art.spec.ts
.claude/skills/post-art/SKILL.md + references/
```

### Validator rules (`validate-art.mjs`, exit 1 with a list of violations)

1. Root `<svg>` has exactly `viewBox="0 0 320 180"`; no `width`/`height`/`style`.
2. Allowed elements: `svg g path rect circle ellipse line polyline polygon
   clipPath defs use`. Forbidden (fail on sight): `text tspan image
   foreignObject style script filter linearGradient radialGradient pattern mask
   animate animateTransform animateMotion set a title desc`.
3. No `style=` attribute; no `class` other than `art-line`, `art-line--2`; no
   `on*` attributes; no `xlink:`.
4. Every `fill`/`stroke` value is `none`, `currentColor`, or `var(--art-…)` from the
   token list above; no hex, rgb, named colours, or `opacity`/`fill-opacity`
   attributes (use `--art-ink-2` for the one allowed dimming).
5. Every element with a `stroke` other than `none` has `stroke-width` 1 or 1.5 and
   `vector-effect="non-scaling-stroke"`.
6. `data-motion` appears at most once; its value ∈ `spin drift slide blink dash`;
   `data-speed` ∈ `0.5 1 2`.
7. Budgets: ≤ 120 elements, ≤ 12 KB, ≤ 3 `clipPath`, group depth ≤ 4.
8. Every `clipPath` id starts with the file's slug; `use` hrefs point inside the file.
9. At least one colour token is used and no more than three of the four fills.

The spec (`tests/post-art.spec.ts`) runs the same checks over
`src/content/txt/*.svg` and `packages/design-system/src/art/*.svg`, and asserts
every non-draft post has an art file.

---

## Quilt geometry

| Viewport | Columns | Cell (at width) | Gap | Panel block | Mode |
| --- | --- | --- | --- | --- | --- |
| ≥ 1024 (container max 1200) | 5 | ~230×130 at 1200; 16:9 | `--space-3` (12px) | 3×2 ≈ 715×270 | hover quilt |
| 640–1023 | 3 | ~227×128 at 768 | 12px | 3×2 (full width × 2 rows) | hover quilt |
| < 640 | 2 | ~179×101 at 390 | 12px | none — panel is an in-flow block | captioned list |

- The grid is `display: grid; grid-template-columns: repeat(var(--quilt-cols),
  minmax(0, 1fr))`; cells `aspect-ratio: var(--quilt-aspect)`; the panel is
  absolutely positioned over cells via `--panel-col/--panel-row` (grid-area maths in
  CSS: `left = (c-1) * (cell + gap)`, computed with `cqi` against the grid as a
  container, the `widget-grid.css` pattern), so it needs no measured pixels.
- **Rows** = `max(minRows, ceil(posts / cols))` where `minRows = panelRows + 1 = 3`
  in the hover modes (a 3×2 block must be able to avoid any focused post's row).
  Fillers = cells − posts. At 5 posts that is 15 cells and 10 fillers on desktop, 9
  and 4 on tablet.
- **Ordering.** DOM order is newest first (tab order, phone order). In the hover
  modes a post's *slot* comes from a seeded permutation of the grid's cells keyed by
  the grid size (`cols × rows`), indexed by the post's chronological number — so a
  new post takes a fresh slot and existing posts stay where they were until the row
  count changes. Placement is `style="grid-area: r / c"` on the cell (an inline style
  for a real API, like `Grid`'s spans). Fillers take the remaining cells in order,
  cycling the 12 filler files from an offset seeded the same way, so no two adjacent
  cells repeat a filler.
- **Growth.** Posts replace fillers one slot at a time; when posts exceed the cells,
  a row is added (5 more cells, 4 new fillers). At 15 posts the desktop quilt is
  all posts; fillers return with the sixteenth. Fillers are decorative and optional;
  the panel does not need them.
- **The panel block** is chosen as in the prototype: over all `(cs, rs)` with
  `cs ∈ 1..cols−2`, `rs ∈ 1..rows−1`, skip blocks containing the focused post,
  score `cost × 100 − distance` where cost = matching posts inside, distance =
  Manhattan distance from the block's centre to the focused post (or to the bar's
  left end when nothing is focused); lowest wins. Cells inside the block go
  `gone` regardless of their own scatter roll.

---

## Implementation units

Every unit: one commit (Conventional Commits, lowercase, the harness's
`Co-Authored-By` trailer); verify with `bun run build`, `bun run test` (Chromium),
and screenshots in both themes at 1440×1200 and 390×1400 via
`node .playwright-mcp/shot-url.mjs <url> <selector> .playwright-mcp/<unit> <w> <h>`
(read the PNGs, then delete them). Dev server is `bunx astro dev` (never
`bunx --bun`). The orchestrator reviews at each phase boundary.

### Phase 0 — Ship the fix, settle the branch

#### U0.1 Ship `7780716` alone

**Goal:** the empty 52px card header above the homepage carousel is live; fix it
without shipping the unfinished blog.
**Model:** orchestrator (git + deploy; no design work).
**Steps:**
```
git branch blog-base master                 # keep the five commits
git reset --hard origin/master              # master = 271b859
git cherry-pick 7780716
bun run build && bun run test               # chromium; firefox cannot launch here
# strip gitignored public/ files from dist except fleet-demo, then:
wrangler pages deploy dist --project-name=tristantimblin --branch=master
git lfs push origin master && git push
```
**Acceptance:** production homepage shows no empty header band above the video
carousel; `origin/master` = 271b859 + the fix.

#### U0.2 Re-base the four blog commits on the shipped master

**Goal:** keep `31c6021` (PostList/Prose/Blockquote), `89d5c30` (BlogLayout,
PostLayout, categories, `category` enum, SiteHeader `links`/`variant`), `aeb393d`
(newsroom removal), `f93e7cb` (tests) as the foundation — they are sound; only the
*index page* they render is superseded, and that is replaced in Phase 3.
**Model:** orchestrator.
**Steps:** `git cherry-pick 31c6021 89d5c30 aeb393d f93e7cb` onto master (the fix
is already there, so its duplicate is skipped); `bun run build && bun run test`;
`git branch -D blog-base`. Do not push until Phase 5.
**Acceptance:** master builds; `tests/txt.spec.ts` passes as written (it pins the
white index, which Phase 3 rewrites along with the page).

### Phase 1 — The art language foundation

#### U1.1 Art tokens, `ArtFrame`, motion CSS, catalogue section

**Goal:** the frame every artwork renders through, and the tokens it consumes.
**Model:** fable. **Depends on:** U0.2.
**Files:** `packages/design-system/src/tokens/tokens.overrides.css` (ART block +
`--duration-loop` in MOTION and its reduced-motion zero);
`packages/design-system/src/components/ArtFrame.astro`;
`packages/design-system/src/styles/art-frame.css` (+ `@import` in `styles/index.css`);
`packages/design-system/src/art/_template.svg`; `src/pages/design-system.astro`
("Art — tokens and the frame" section); `CONVENTIONS.md` (new "Art" section after
"Reading UI": the tokens table, the frame API, the motion contract, where files live,
"run the validator").
**API:**
```astro
<ArtFrame svg={raw} label="The Mega Desk" />                 role="img"
<ArtFrame svg={raw} decorative />                             aria-hidden (inside a link / a filler)
<ArtFrame svg={raw} label="…" play />                         motion running (the open post)
<ArtFrame svg={raw} label="…" ratio="16 / 9" chrome={false} />   no plate/border (hero variants)
```
`svg` is the raw file string, injected with `set:html` after the frame strips a
leading XML/DOCTYPE line and injects `aria-hidden`/`focusable` on the root; `class`
merges; `...rest` passes through. CSS: `.ds-art` (plate, edge, radius, `overflow:
hidden`, `aspect-ratio`), `.ds-art svg { width: 100%; height: 100%; display: block }`,
`.art-line` / `.art-line--2` stroke widths, `[data-motion=…]` keyframes paused →
running on `.ds-art:hover`, `:focus-within`, `.ds-art--play-true`, and ancestors
`a:hover .ds-art`. Under reduced motion the duration token is 0s.
**Acceptance:** catalogue section shows the template in both themes, the swatches,
the two line weights on the plate, and each of the five `data-motion` kinds running
on hover; `bun run build` green; no colour literal in `art-frame.css`.

#### U1.2 The validator and its spec

**Goal:** the rules above, enforceable from a shell and from the test suite.
**Model:** fable. **Depends on:** U1.1.
**Files:** `packages/design-system/scripts/validate-art.mjs` (exports
`validateArt(source, { slug }) → string[]`; a CLI when run directly:
`bun packages/design-system/scripts/validate-art.mjs <file…>`); `tests/post-art.spec.ts`;
`package.json` script `"validate:art": "bun packages/design-system/scripts/validate-art.mjs"`.
**Approach:** parse with a small tokenising scanner (a tag/attribute walk; the
format is constrained enough that no XML dependency is needed — but if one is, use
`fast-xml-parser` as a devDependency, not a runtime one). Rules 1–9 above, each with
a one-line message naming the offending element and line. The spec globs
`src/content/txt/*.svg` and `packages/design-system/src/art/*.svg`, runs each,
asserts zero violations, and asserts every non-draft `.mdx` has a sibling `.svg`.
Include fixture strings in the spec for a negative case per rule (hex fill, `<text>`,
a gradient, a missing `vector-effect`, two `data-motion`s, over-budget).
**Acceptance:** `_template.svg` passes; each fixture fails on exactly its rule;
`bun run test tests/post-art.spec.ts` green.

#### U1.3 The `post-art` skill

**Goal:** a skill an AI session loads before drawing a post's art, so every
artwork comes out in the language without re-explaining it.
**Model:** opus (the spec is written; this is packaging it). **Depends on:** U1.2.
**Files:** `.claude/skills/post-art/SKILL.md` (frontmatter `name`, `description`
with triggers: "post art", "artwork for a post", "quilt tile", "filler tile");
`references/language.md` (the spec above, verbatim, with the sampled swatches);
`references/motifs.md` (a vocabulary of drawn snippets with their SVG: iso box,
cylinder, chip, pill, node-and-trace, cursor, checkbox, concentric rings, fan of
flow lines, dashed path, dot field, stacked cards, tape reel — each ≤ 15 lines);
`references/template.svg` (a copy of `_template.svg`); the skill's own README is
not needed (procedural-clouds has one; it is optional).
**SKILL.md contents:** (1) read `language.md` first; (2) *how to think about the
picture*: read the post, name its one system metaphor in a sentence (what moves,
what is stacked, what connects), pick the dominant colour and the crop, sketch on
the 10-unit grid, draw with ≤ 3 colours, decide the one motion or none; (3) the
file template and where it goes (`src/content/txt/<slug>.svg`; fillers in the
package); (4) a checklist that ends with `bun run validate:art <file>`, then a
screenshot of `/design-system/art#<slug>` in both themes at 1440 and 390 and a
look at it inside the quilt at `/txt`; (5) what NOT to do (text, gradients,
literal colours, centred symmetric compositions, more than one motion, a plate
drawn inside the file).
**Acceptance:** the skill appears in the session's skill list; a dry run on one
post (U2.1) needs no correction to the skill beyond wording.

### Phase 2 — The artworks (through the skill)

Each unit: load `/post-art`, draw, validate, screenshot, commit. **Model:** opus.
**Depends on:** U1.3. Units U2.1–U2.5 may run in parallel (each touches only its
own `.svg`; the shared catalogue page is additive and automatic — `art.astro` globs
the files). Every art unit is also a test of the skill: report anything the skill
made hard, and the orchestrator folds it back in a small `docs(skill)` commit.

| Unit | Post | Direction (one metaphor; the skill decides the rest) |
| --- | --- | --- |
| U2.1 | `asserting-on-agent-behavior` (Aptitude) | a trace of tool calls: nodes on a circuit path with check marks; one node lit coral for a failed assertion; motion `blink` on the node under test |
| U2.2 | `mega-desk` | an 8-ft slab as an isometric plank running off both edges, white top face, two leg cylinders; dimension ticks; no motion or a slow `slide` of the tick rule |
| U2.3 | `no-honey-we-have-a-dashboard-at-home` | stacked window panes (cards) — three identical dashboard grids vs one cyan editor pane cropped large; motion `drift` of a cursor |
| U2.4 | `why-i-joined-fisker` | steering/brake/acceleration as three flow lines fanning from a car-shaped node into a pulse; green dots as signal; motion `dash` along the traces |
| U2.5 | `tahoe-mountain-hair` | mineral water: concentric rings on a cylinder of water, lavender dots settling; a folded-plane mountain cropped top-left; motion `drift` of the dots |
| U2.6 | fillers 01–12 (`packages/design-system/src/art/`) | abstract only — grids with pips, ring sets, fan lines, dashed corridors, dot fields, iso stacks; no motion; each uses a different dominant colour so the quilt reads varied |
| U2.7 | `src/pages/design-system/art.astro` | the art catalogue: every post's art and every filler, each in both themes side by side, a `play` toggle, file bytes and element count, anchor per slug; `noindex`; linked from the main catalogue's Art section |

**Acceptance per art unit:** validator clean; reads as the post's idea at 230px
wide and at 720px; at least one element crops an edge; motion (if any) is
seamless and paused at rest; screenshots in both themes.

### Phase 3 — The quilt and search

#### U3.1 DS components: `Quilt`, `QuiltCell`, `QuiltPanel`, `SearchBar`

**Goal:** the markup and CSS contract the engine drives, in the package with
catalogue sections.
**Model:** fable. **Depends on:** U1.1.
**Files:** `packages/design-system/src/components/{Quilt,QuiltCell,QuiltPanel,SearchBar}.astro`;
`styles/{quilt,quilt-panel,search-bar}.css` (+ imports); `src/pages/design-system.astro`
(three sections, with static states: rest, a pinned hover with the card, a pinned
results list, browse, nothing); `CONVENTIONS.md` ("Quilt" under Reading UI: the
components, the state contract, the geometry table).
**API:**
```astro
<Quilt cols={5} rows={3} aria-label="Posts">                 data-quilt, --quilt-cols/--quilt-rows
  <QuiltCell col={3} row={1} href="/txt/mega-desk" label="The Mega Desk"
             no="003" state="lit">                            a post: <a> with aria-label, data-cell="post"
    <ArtFrame svg={raw} decorative />
    <Fragment slot="caption">…</Fragment>                    shown only on phones
  </QuiltCell>
  <QuiltCell col={1} row={1} filler>…</QuiltCell>             data-cell="filler", aria-hidden
  <QuiltPanel col={3} row={2} mode="card|browse|results|none|hidden" />
</Quilt>
<SearchBar id="quilt-search" label="Search" placeholder="a title, a topic, a year…"
           count="5 POSTS" hint="/" />
```
- `QuiltCell` states: `data-state="lit|faint|gone"`, `--scatter-delay`, `data-active`
  (the accent ring: `outline: var(--focus-ring)` inset via `box-shadow`). Transitions
  `opacity`/`filter` over `--duration-settle` with `--ease-reveal`. Fillers get
  `data-cell="filler"`.
- `QuiltPanel` renders all four faces (`Faces`/`Face` is the right primitive: every
  face is rendered, `hidden` = `aria-hidden`) and the engine swaps `hidden`. Card
  face: `Mono` kicker, `Heading as="p" size={7}`-class title in the UI face,
  `Body` blurb, `Mono tone="accent"` meta, `Mono` why. Browse face: `Mono` label,
  `Pill as="a"` rows for categories (with a `Mono variant="text"` count) and years,
  the latest post as an `Anchor`, a `Mono` key hint. Results face: an `<ol>` of
  `<a>` rows (title with `<mark>` highlights, `Mono` meta, `Mono` why), active row
  = accent left bar + `--wash-1`. Nothing face: the sentence, the coverage line,
  `Pill` suggestions. Phone: the panel is `position: static` and full width.
- `SearchBar`: `Mono` label, native `<input type="search" role="combobox"
  aria-autocomplete="list" aria-expanded aria-controls>` in the UI face at
  `--font-size-5`, a `Mono` live count (`aria-live="polite"`), a `Pill
  variant="outline"` key hint (hidden on touch). Focus → `border-color: var(--accent)`.
**Acceptance:** the catalogue shows every state statically in both themes; no
component sets a colour or length that has a token; keyboard focus on a tile shows
the focus ring; the panel's CSS-computed placement lands on the right cells at 1440,
768 and 390 (catalogue demo at each).

#### U3.2 The engine (pure) and its spec

**Goal:** the search, block choice and scatter maths as pure functions, tested
without a browser.
**Model:** fable. **Depends on:** none (parallel with U3.1).
**Files:** `src/lib/quilt/engine.ts`; `tests/quilt-engine.spec.ts`.
**API:**
```ts
export interface IndexedPost { id: string; no: number; title: string; excerpt: string;
  category?: string; tags: string[]; year: string; month: string /* "feb" */;
  monthLong: string; minutes: number; href: string; col: number; row: number }
export function tokenize(q: string): string[]
export function search(posts: IndexedPost[], q: string): { tokens: string[];
  hits: Array<{ i: number; score: number; why: string | null }> } | null
export function highlight(title: string, tokens: string[]): Array<{ text: string; hl: boolean }>
export function chooseBlock(opts: { cols; rows; block: [3, 2]; posts; keep: Set<number>;
  focus: number | null }): { col: number; row: number } | null
export function scatter(opts: { cellIndex; seed; }): { gone: boolean; delay: number } // delay 0..240
export function layout(opts: { cols; postCount; minRows: 3 }): { rows; slots: number[]; fillerOrder: number[] }
export function mode(state): "rest" | "hover" | "browse" | "results" | "single" | "none"
```
Scoring exactly as decided (prefix match per token across fields; weights 3 /
2.5 / 2 / 2 / 1; the "why" = the highest-weighted non-title hit; ties newest
first). Seeded hash: mulberry32 over `(seed, cellIndex)` so a post's scatter is
identical across loads.
**Test scenarios:** every decided rule as a case — a title hit outranks a tag hit;
`"home"` matches the desk post by tag `home-office` with why `TAG · HOME OFFICE`;
`"feb 2026"` hits the Aptitude post by month+year; a token with no match anywhere
drops the post; ties order newest first; `chooseBlock` never returns a block
containing the focused post and prefers zero-cost blocks farthest away; `layout`
yields 15 cells / 10 fillers for 5 posts at 5 cols and adds a row at 16; `scatter`
is deterministic and its delay ≤ 240.
**Acceptance:** spec green in Chromium project (it never opens a page).

#### U3.3 The `/txt` page on the quilt

**Goal:** the live page: the search bar, the quilt, the index, the client wiring,
phones.
**Model:** fable. **Depends on:** U2.x (at least two artworks + fillers), U3.1, U3.2.
**Files:** `src/pages/txt/index.astro` (rewritten, thin); `src/layouts/BlogLayout.astro`
(a `width="measure" | "wide"` prop — wide uses `--container-max`, and the compact
header row: h1 "Writing" at `size={4}`, no lede); `src/styles/blog.css`;
`src/lib/blog.ts` (`postNumber`, `readingStats`, `monthOf`, `artFor` via the raw
glob, `blogNav` loses "Categories"); `src/lib/quilt/index.ts` (DOM wiring);
`src/components/txt/PostIndex.astro` unchanged (category/tag pages).
**Approach:**
- The page computes `IndexedPost[]` at build (`layout()` gives slots), renders
  `SearchBar`, `Quilt` with cells and fillers, `QuiltPanel`, and embeds the index as
  `<script type="application/json" data-quilt-index>`. Phone captions come from the
  `caption` slot.
- `src/lib/quilt/index.ts`: `wire()` on `astro:page-load` with a
  `dataset.quiltWired` guard (the `index.astro`/`SiteFooter` pattern); reads the
  JSON; owns state `{ query, focused, hovered, active }`; applies `data-state`,
  `--scatter-delay`, `data-active`, the panel's face and `--panel-col/--panel-row`;
  handles `pointerenter`/`focusin` on cells, `pointerleave` on the grid, `input`,
  `keydown` (↑↓ Enter Esc, `/` and ⌘K on `document` unless focus is in an editable
  element), `?q=` on load (and `history.replaceState` to keep the URL in step,
  debounced). Teardown on `astro:before-swap` removes the document listeners.
  Hover and focus are the same path; `focusin` on a cell sets hover so keyboard
  users get the card, and the card's text is also the link's accessible name so
  nothing is announced twice (the panel is `aria-hidden` in hover mode; in
  results mode the list is the live, navigable thing and the tiles are decorated).
- Phone (`matchMedia("(max-width: 639px)")`): the same state machine; the panel is
  in flow; tiles never scatter to `gone` (only to `faint`) so nothing shifts; no
  `pointerenter` handling.
**Acceptance:** every decided behaviour in §3 above works at 1440, 768 and 390;
`/txt?q=desk` loads filtered; with JS off the page shows the full quilt and every
tile is a working link; no console errors; LCP element is a tile (no reveal
targets on the page — inline SVG has no asset arrival).

#### U3.4 Categories become queries; redirects

**Goal:** retire `/txt/categories`, keep every old URL answering.
**Model:** opus. **Depends on:** U3.3.
**Files:** delete `src/pages/txt/categories.astro`; `public/_redirects`
(`/txt/categories /txt 301`); `src/pages/txt/category/[category].astro` and
`src/pages/txt/tag/[tag].astro` (add `noindex` to the category page; both keep
`PostIndex`; their headers gain a `Pill as="a" href="/txt?q=<label>"` "search this
in the quilt" link); `src/lib/blog.ts` (`blogNav`); `src/layouts/PostLayout.astro`
pills point at the routes.
**Acceptance:** `curl -I` on the deployed preview returns 301 for
`/txt/categories`; `/txt/category/projects` and `/txt/tag/diy` return 200 with the
list; the sitemap no longer lists `/txt/categories`.

#### U3.5 Tests for the quilt

**Goal:** pin the interaction contract.
**Model:** opus. **Depends on:** U3.3, U3.4.
**Files:** `tests/txt.spec.ts` (rewritten); `tests/fonts.spec.ts` (retarget the
Semibold check from `.ds-post-row__title` on `/txt` to a `.ds-prose h2` on
`/txt/mega-desk`, since the quilt sets titles regular); `tests/reveal.spec.ts`
(test 8's `.ds-post-row__link` → `[data-cell="post"] a`; the zero-targets assertion
stands); `tests/fleet-demo.spec.ts` is untouched (its POST URL is stable).
**Scenarios:**
1. Every non-draft post is linked exactly once on `/txt`; fillers are `aria-hidden`
   and carry no link.
2. Hover a post: the other cells transition to `faint` or `gone` with delays in
   0–240 ms; the panel's card shows that post's title and `NO. 003 · APR 2025`; the
   panel block does not overlap the hovered cell; moving out restores every cell to
   `lit` and hides the panel. Hover twice → identical per-cell states (determinism).
3. Keyboard: Tab to a tile → same card; `/` focuses the input; ⌘K focuses it;
   typing `desk` → count `1 OF 5`, the desk tile lit, all others not; the card shows
   `MATCHED TAG · STANDING DESK` (or the title-highlight variant); `home` → 2 hits,
   the results list shows `<mark>` on the query, ↓ moves `data-active` to the second
   tile, Enter navigates to it; Esc clears, Esc again blurs.
4. `recipes` → the nothing face with pills; clicking a pill sets the query and the
   URL `?q=`.
5. `/txt?q=2025` pre-fills and filters on load.
6. Scripting off: the page has every post link; `/txt/category/programming` lists
   its two posts.
7. Phone (390): captions visible, no `gone` cells, the panel is in flow under the
   bar, no horizontal overflow.
8. Reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`): the scatter
   still changes state but computed transition durations are `0s`; art animations do
   not run.
9. A11y: the input is a `combobox` with `aria-expanded` tracking the panel; the
   count region is `aria-live`; every tile link has an accessible name equal to the
   post title; `aria-activedescendant` follows ↑↓.

### Phase 4 — The post page

#### U4.1 `PostLayout` on the instrument UI

**Goal:** the reading page per `Post.dc.html`, keeping the sound parts of the
committed layout.
**Model:** fable (a scroll-driven ruler, headings rail, and a bespoke hero grid).
**Depends on:** U1.1, U2.x, U3.3 (for `postNumber`/`readingStats`).
**Files:** `src/layouts/PostLayout.astro`; `src/pages/txt/[slug].astro` (passes
`headings` from `render(post)`, `no`, `stats`, `art`, `prev`/`next`);
`src/styles/blog.css` (`.post__*` moves here if shared); `src/lib/blog.ts`
(`neighbours(posts, id)`).
**Keep:** `ArticleLayout` wrapping, `Prose`, `Blockquote`, the mdx map, `SiteHeader
variant="flow"`, the 44rem reading measure for prose. **Rework:** the header.
**Drop:** the photo hero bleed (`image` stays the social card only).
**Composition (top to bottom):**
1. A strip: `Mono as="a" href="/txt"` `← TXT` left, `Mono` `005 / 005` right; under
   it `TickRuler playhead={0}` as the reading-progress ruler (`--ticks-height:
   var(--space-4)`); a scoped `<script>` updates `--at` on the playhead from scroll
   (rAF-throttled, `astro:page-load` wired, guarded). Lit segment = read share.
2. The hero grid `grid-template-columns: minmax(0, 22rem) minmax(0, 1fr)` at ≥ 1024
   (stacked below): `ArtFrame svg label={title} play` left; right a column of
   `Mono` kicker `TXT · 005 · 02 FEB 2026`, `Heading as="h1" size={8}` (regular
   weight via `.blog`), `Body` excerpt, a row of `Stat size="sm"` pairs (`3 min /
   read`, `582 / words`) and `Pill variant="outline" as="a"` tags at the right.
3. `Hairline`.
4. The body grid, same columns: a contents rail (`Mono` `CONTENTS`, then one `Mono
   as="a"` per h2 `01 — TITLE`, current one `tone="primary"` via an
   IntersectionObserver in the same script, sticky at ≥ 1024) beside `Prose`.
   `Prose`'s h2 gets the `01` index via CSS counters, matching the rail.
5. `Hairline`, then prev/next: two `<a>` cards with the neighbour's `ArtFrame` at
   7rem wide, `Mono` `← PREVIOUS` / `NEXT →`, the title, `Mono` `JUN 2025 · 2 MIN`;
   the missing side prints `LATEST POST — NOTHING NEWER` / `FIRST POST`.
**Acceptance:** `/txt/mega-desk` matches the artboard's structure at 1440 in both
themes; at 390 the hero stacks (art full width, then text), the rail becomes a
collapsed list above the prose, nothing overflows; the ruler's playhead reaches 1
at the bottom; the art animates only on this page and on hover elsewhere; Lighthouse
a11y has no new failures (one h1, landmarks, link names).

#### U4.2 Post-page tests

**Model:** opus. **Depends on:** U4.1.
**Files:** `tests/txt.spec.ts` (the post block): date `datetime` and kicker text;
`005 / 005` numbering for the newest post; stats present; the ruler's `--at` grows
with scroll and reaches ≥ 0.98 at the bottom; the contents rail links every h2 and
marks the current one; prev/next hrefs are the chronological neighbours; the hero
art has `role="img"` with the title; phone overflow 0.

### Phase 5 — Ship

#### U5.1 Full verification and deploy

**Model:** orchestrator. **Depends on:** everything above.
`bun run build` (the root build, so `public/fleet-demo` is present), `bun run
test`, screenshots of `/txt` (rest, hover, results, browse, nothing), a post, and
`/design-system/art` at 1440 and 390 in both themes; then the deploy steps from
Decided §8; `git lfs push origin master` before `git push`.

#### U5.2 (optional) Social cards from the art

**Model:** opus. A build step `scripts/og-from-art.mjs` that renders each
`src/content/txt/<slug>.svg` on the plate to `public/og/txt/<slug>.png` (1200×630:
the art at 16:9 inside the card, title-free) using `@resvg/resvg-js` with the
`--art-*` tokens substituted by their hex values; `[slug].astro` passes it as
`image` when the frontmatter has none. `public/og/txt/` is gitignored and built
in `bun run build` like `fleet-demo`. *Open question 6.*

---

## Sequencing and parallelism

```
U0.1 → U0.2 → U1.1 → U1.2 → U1.3 → [U2.1 … U2.6 in parallel] → U2.7
                 └──────────── U3.1 ─┐
U3.2 (anytime after U0.2) ───────────┴→ U3.3 → U3.4 → U3.5
                                    U4.1 (after U2.x + U3.3) → U4.2 → U5.1 → U5.2
```
Review gates: after Phase 1 (is the language right? check the template in the
quilt geometry before ten fillers are drawn), after U2.1 (does the skill produce
the language unaided?), after U3.3 (does the quilt feel like the prototype?), before
U5.1.

---

## Scope boundaries

**In:** everything above. **Out / deferred:** the homepage (any "Writing" widget
or tile), Pagefind or full-text search, a light-theme ink-on-bone art variant,
per-post themed layouts (`layout` frontmatter stays reserved), image optimisation
of post photos, RSS enclosures for art, and migrating the DS's remaining
`.wx-stat*` legacy classes.

---

## Risks and open questions (each with a recommendation)

1. **Phones.** Recommendation: the captioned two-column list with the panel in
   flow and plain taps (above). Alternative: tap-to-reveal the card, second tap
   opens — rejected because tiles carry no text and a two-step tap on a link is a
   known trap. Decide before U3.1 (it sets the phone CSS).
2. **Light theme for the art.** Recommendation: dark plate in both themes
   (`--art-plate` fixed). Alternative: `--art-plate: var(--card-background)` and
   `--art-ink: var(--text-primary)` on `.maximeheckel-light`, giving ink line work on
   bone with the same fills — cheap to try later since every file is token-only; the
   fills' contrast on bone (cyan, green) would need re-sampling. Decide before U2.x
   only if the alternative is preferred; otherwise it can wait.
3. **How many fillers.** Recommendation: 12 files; the desktop grid needs 10 at
   five posts, and two spares avoid repeats. Fewer looks repetitive; more is art
   budget with no visible return until the blog shrinks the count anyway.
4. **The categories pages.** Recommendation: retire `/txt/categories` (301 to
   `/txt`), keep `/txt/category/<id>` and `/txt/tag/<tag>` as noindex list routes.
   Alternative: 301 category routes to `/txt?q=<id>` — loses the JS-off list and
   the "real route" property the source comments argue for, for little gain.
5. **Homepage entry point.** Recommendation: none beyond the header's `Writing`
   link this round; a homepage widget was explicitly rejected. If a nudge is wanted
   later, a single `Pill as="a" variant="accent"` in the hero's meta row is the
   smallest gesture.
6. **OG / social cards from the art.** Recommendation: do U5.2 but as its own
   follow-up after the language settles (a re-drawn tile would otherwise re-render
   the card silently). Twitter's `summary` card is already the site's default, so
   an art card is an upgrade, not a fix.
7. **Panel height on the 3×2 landscape block.** At ~270px the card holds a two-line
   32px title and a three-line blurb; longer excerpts must clamp (`-webkit-line-clamp:
   3`). If a fourth result row is wanted in the list face, rows must be single-line
   (title + meta on one row); the plan caps visible results at 3 + "and N more" if
   the full-row layout is kept. The implementer of U3.1 picks after measuring.
8. **Scatter `filter: grayscale(1)` cost.** Fifteen inline SVGs filtered at once is
   fine on desktop; on low-end tablets it may jank. Mitigation in U3.1: the faint
   state can be `opacity` only (the plate already dims the colour), keeping
   `grayscale` behind a `@media (hover: hover) and (min-width: 1024px)` gate.
9. **`vector-effect="non-scaling-stroke"` and `transform-box: fill-box` support.**
   Both are universal in current engines; Firefox's `transform-box` on SVG groups is
   fine since 55. No fallback planned.
10. **`Faces`/`Face` reuse for the panel.** Both render every face and key
    cross-fades on `aria-hidden` — that is exactly the panel's need. If its
    `fill`/stack sizing fights the absolutely-positioned panel, U3.1 may render the
    faces directly with the same attribute contract rather than fork `Faces`.
11. **Tests that pin the white index** (`txt.spec.ts`, `fonts.spec.ts`'s Semibold
    check, `reveal.spec.ts` test 8) break at U3.3 and are repaired in U3.5. Run the
    full suite only at unit boundaries where it is expected green, and name the
    known-red specs in the commit body between U3.3 and U3.5.
12. **Firefox cannot launch on this Mac**, so `scroll-fallback.spec.ts` stays
    unverified locally; nothing here touches it.

---

## Sources

- Prototypes: `.playwright-mcp/blog-canvas/project/QuiltSearch.dc.html` (the
  reference implementation: modes, scoring, block choice, scatter, faces),
  `QuiltHover.dc.html`, `Post.dc.html`; the retired symbol language in
  `Language.dc.html` / `Symbol.dc.html` (what the new language replaces).
- Reference image: `.playwright-mcp/refs/illustration-style.jpg`; colour samples
  taken with PIL (page #202020, tile #18181f, white #f8f8f8, lavender #b8a0e8,
  coral #e86850, cyan #50b0c8, green #489860, hairline ≈ #404040).
- Repo: `AGENTS.md`; `packages/design-system/CONVENTIONS.md` (gate, instrument UI,
  reading UI, authoring); `tokens.overrides.css` (motion tokens, reduced-motion
  block, instrument tokens); `src/lib/blog.ts`; `src/content.config.ts`;
  `src/layouts/{Layout,BlogLayout,PostLayout,ArticleLayout}.astro`;
  `src/pages/txt/*`; `src/components/txt/PostIndex.astro`; `tests/*.spec.ts`
  (`shader-source.spec.ts` for the browserless pattern; `txt`, `fonts`, `reveal`
  for the assertions that change); `playwright.config.ts` (root build in
  `webServer`); `.playwright-mcp/{shot,shot-url}.mjs`; `.claude/skills/procedural-clouds/`
  (skill layout); memory: subagent execution model, page chrome belongs in layouts.
