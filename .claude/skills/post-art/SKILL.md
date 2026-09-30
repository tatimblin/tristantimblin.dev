---
name: post-art
description: >
  Draw the illustration for a blog post, or a quilt filler tile, in this site's
  art language: white 1px line work (circuit traces, grids, isometric
  wireframes, cylinders, concentric rings, flow lines, dashed paths) and flat
  lavender, coral, cyan and green fills on a near-black landscape plate (the
  plate follows the theme: bone, with dark ink, on the light page), cropped
  off the edges, with no text. It writes one hand-authored SVG
  (src/content/txt/<slug>.svg, or packages/design-system/src/art/filler-NN.svg)
  that passes `bun run validate:art` the first time, with an optional single
  motion. Use it whenever you make or change art for a post or the /txt quilt.
  Triggers: "post art", "artwork for a post", "art for <post>", "quilt tile",
  "filler tile", "draw the post's svg", "post illustration", "validate:art".
  It also covers the micrographics — the small 48×32 signal-panel marks
  (glyphs, their recipes, the parametric generators, the keycap tile): read
  references/glyphs.md for those. Triggers: "glyph", "micrographic", "tile",
  "generator", "glyph recipe", "glyphs:bake", "validate:glyph".
---

# Post art

Every post on `/txt` has its own drawing, and the quilt pads its grid with
fillers. All of them are in one language, taken from the reference sheet
`.playwright-mcp/refs/illustration-style.jpg`. An art file carries **only the
drawing**:

- the **tokens** name every colour;
- the **frame** (`ArtFrame`) draws the plate, the edge and the corner, and owns
  the motion — except on the open post, where the art is a **mark**
  (`variant="mark"`): no plate, no edge, the line work in the page's own
  ink, small in the fourth column beside the title. A drawing has to read
  without its plate too;
- the **validator** holds every rule.

You draw on the dark palette, but **the plate follows the theme**: on the
light page it is bone and `--art-ink` is dark, so the same file renders as
ink on bone. White line work and white faces become dark, and the fills go a
step deeper. Don't rely on a white face being white or on a cut being dark.
The drawing has to hold in both, so always check both columns.

Your job is one small, sparse, off-centre SVG that reads as the post's idea at
230px wide.

**Drawing a glyph instead?** A micrographic (a 48×32 mark for a tile, a
label or a readout; a waveform, gauge, fan, ring, pip grid) is not post art:
it has its own grid, profile, kit and bake. Read
**`references/glyphs.md`** and follow it rather than the steps below. Use a
generator before drawing any curve.

## 1. Read first

1. **`references/language.md`**: the spec, including the tokens, geometry,
   motion kinds and file rules. Do not draw from memory of it.
2. **The reference image**, `.playwright-mcp/refs/illustration-style.jpg`. Open
   it and look, because the language is the look, not only the rules. The
   folder is gitignored, so a fresh checkout lacks it; then the shipped art on
   `/design-system/art` is the reference.
3. **`references/motifs.md`**: seventeen valid snippets to copy and adapt: iso
   box, cylinder, chip, pill, node-and-trace, cursor, checkbox, failed
   checkbox, concentric rings, fan of flow lines, dashed path, dot field,
   stacked cards, tape reel, grid with pips, ribbon, and folded planes.
4. **The post** (`src/content/txt/<slug>.mdx`), for a post's art. Read the
   whole post, not only the title.

## 2. Think about the picture before you draw

1. **Name the one system metaphor in a sentence.** Say what moves, what is
   stacked and what connects. For example, "a trace of tool calls, one node
   failing" or "a slab too long for the frame". Draw the post's *idea* as a
   system, not a scene or an illustration of objects in it. If you need a
   caption to explain it, choose a simpler metaphor.
2. **Pick the dominant colour**, then at most two supporting colours. Ink is
   always there. Two colours total is often best. Across posts and fillers,
   vary the dominant colour so the quilt doesn't read as one colour. For a
   set of fillers, rotate the dominant colour through all four.
3. **Pick the crop.** Decide which one or two edges the subject runs off, and
   where the dark space is. The weight sits off-centre, for example a third
   in, or bleeding off a corner. Symmetric, centred compositions are wrong
   here.
4. **Sketch on the 10-unit grid.** Write down the key coordinates (the main
   solid, the trace path, the terminal points) before you write markup.
   Isometric edges use (±0.866, 0.5) steps: an iso edge has slope ±0.577
   (tan 30°), **not** 0.5, so place a point by a parameter along the axis
   vector, `(x0 + 0.866·t, y0 + 0.5·t)`, rather than eyeballing it. In a
   320×180 frame a long iso subject can only run off **top and right** or
   **left and bottom**, never left and right both; choose the crop to fit.
5. **Draw with 3 to 6 motifs**, not 15. Sparse is the language: one hero
   element, one or two supporting ones and some texture (dots, a dim grid, a
   dashed path).
6. **Decide the one motion, or none.** Choose from spin, drift, slide, blink
   and dash (see the motion table in `language.md`). It should be the post's
   verb: signal moving, a reel turning, a node under test. Fillers have no
   motion. The still frame must read as complete, because it is the poster.
7. **Mind the traps the validator can't see** (paint order, seams, line ends,
   contrast): see "Drawing traps" in `language.md`. The one that bites most:
   later elements paint over earlier ones, **the motion group included**. If
   dots or nodes must sit above moving lines, draw a second static group
   after the motion group.

### Fillers

A filler is a post's art with the idea taken out: structure, not a story.
It is **quieter** than post art, which means fewer and smaller fills, more
`--art-ink-2` line work, no `art-line--2` emphasis stroke, and no motion.
Across a set, rotate the dominant colour through the four and let the
structure (grid, rings, iso, fan, folded planes) carry the variety. Judge a
set together on a contact sheet (§5).

## 3. The file

- **A post:** `cp packages/design-system/src/art/_template.svg src/content/txt/<slug>.svg`.
  The slug is the `.mdx` basename.
- **A filler:** copy the same template to
  `packages/design-system/src/art/filler-NN.svg`.

The template (also at `references/template.svg`, which may lag the package's
copy) opens with a comment holding the rules. Keep it while you draw, and
delete it if the file nears 12 KB. Replace the example drawing inside the `<g>`
with yours.

The skeleton:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
  <g>
    <!-- static drawing: every shape says fill; every stroked shape says
         class="art-line" vector-effect="non-scaling-stroke" on itself -->
    <path d="M -10 60 H 70 V 100 H 130" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
    <circle cx="130" cy="100" r="2.5" fill="var(--art-ink)" />
  </g>
  <g data-motion="blink">          <!-- optional, at most one, no transform= on it -->
    <circle cx="130" cy="100" r="6" fill="var(--art-coral)" />
  </g>
</svg>
```

Comments are fine and are stripped on render. Don't leave stray text between
tags, because the validator reads it as text.

## 4. Checklist: pass the first time

Go through this before you run the validator. Each item is a rule the validator
fails on, or a trap it cannot see.

- [ ] **The root** is exactly
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">` (an
      optional `preserveAspectRatio` is allowed). It has no `width`, `height`,
      `style` or `xmlns:xlink`. There is no nested `<svg>`, and no `<symbol>`,
      `<marker>`, `<title>` or `<desc>`.
- [ ] **Every shape states its `fill`**: `none` or a token (a `<g>`'s fill
      counts). An outline with no fill renders **black-filled**; the validator
      fails it.
- [ ] **Every stroked shape** carries `vector-effect="non-scaling-stroke"` **on
      itself**, even when `stroke` is set on a parent `<g>`.
- [ ] **Paints are exact strings**, one of `none`, `currentColor`,
      `var(--art-ink)`, `var(--art-ink-2)`, `var(--art-lavender)`,
      `var(--art-coral)`, `var(--art-cyan)` or `var(--art-green)`, with no
      spaces inside `var(…)`. There is no hex, rgb or named colour.
- [ ] **No `opacity`, `fill-opacity`, `stroke-opacity` or `color`.** Dim with
      `var(--art-ink-2)`.
- [ ] **Never** `--art-plate`, `--art-edge` or `--art-radius`, and never a
      background or plate rect. Dark details are evenodd cuts, and hidden back
      edges are simply not drawn.
- [ ] **Line weight** comes from `class="art-line"` (1) or
      `class="art-line--2"` (1.5, once, for emphasis). A literal `stroke-width`
      must be exactly `1` or `1.5` and must not disagree with the class.
      **Thick lines are filled shapes**, never a wide stroke.
- [ ] **Dashes** are exactly `stroke-dasharray="4 4"` or `"2 6"`.
- [ ] **Motion.** There is at most one `<g data-motion="spin|drift|slide|blink|dash">`,
      and it is not empty. `data-speed="0.5|1|2"` goes only on that group.
      There is no `transform=` on that group.
  - [ ] `dash`: every stroked shape inside is dashed, and nothing inside sets
        `stroke-dashoffset`.
  - [ ] `slide`: the group moves exactly 40 units left per loop, so it repeats
        every 40 (or 10 or 20) and runs from x ≤ 0 to x ≥ 360, one period past
        the right edge.
  - [ ] `spin`: it rotates about the group's fill-box centre, so the bounding
        box is centred on the pivot, and something asymmetric shows the turn.
  - [ ] `drift`: it eases out (6, −8) and back. Keep it to small, loose things.
  - [ ] `blink`: a small group, one shape or a shape *and its mark* (a
        failed node and its cross).
  - [ ] The still frame reads as complete on its own.
- [ ] **Ids** go only on a `<clipPath>`, or on things inside `<defs>` that a
      `<use href="#…">` points at. Every id is prefixed `<slug>-`, where the
      slug is the file's basename. Use `clip-path="url(#<slug>-…)"` and no
      `xlink:href`.
- [ ] **Budget.** At most 120 elements (merge line work into multi-subpath
      paths), at most 12 KB including comments, at most 3 clipPaths, and `<g>`
      at most 4 deep.
- [ ] **Palette.** At least one token, at most three of
      lavender/coral/cyan/green, and one of them dominant.
- [ ] **The language.** No text, and at least one element crosses an edge. The
      composition is off-centre and sparse.

Then run it:

```sh
bun run validate:art src/content/txt/<slug>.svg      # or packages/design-system/src/art/filler-NN.svg
```

It prints `ok` or one line per violation, `<rule>: <element> line N: what`.
The rule is one of `markup`, `root`, `element`, `attribute`, `paint`, `stroke`,
`motion`, `budget`, `ids` or `palette`. Fix each one and re-run until it
passes. `bunx playwright test tests/post-art.spec.ts` runs the same checks over
every shipped file.

## 5. Look at it

A validator pass is not a finished drawing. Look at it at tile size and hero
size, in both themes, still and moving. Screenshot, then **read the PNG**.

- **A quick look, no server**: from the repo root,
  ```sh
  S=.claude/skills/post-art/scripts/preview.mjs
  bun $S --shot /tmp/<slug>.png src/content/txt/<slug>.svg
  ```
  renders the file with the real tokens and `art-frame.css` at 230px and
  720px on the dark and light pages, and writes a still PNG 1440 wide. It
  drives headless Chromium through the `playwright` library already in the
  repo, so it works when the Playwright MCP browser is locked by another
  session (likely, when several artists draw in parallel). Use this route.
  - **`--motion`** also writes `/tmp/<slug>.motion.png`, a mid-motion frame,
    and prints the motion group's play-state, opacity and transform (and
    dash offset) at rest and playing, ending in `paused at rest: yes` and
    `moves when playing: yes`. Both must say yes.
  - **`--sheet`** lays every file out at 230px, four across, on the dark page
    then the light page: the way to judge a set of fillers side by side.
    `bun $S --sheet --shot /tmp/fillers.png packages/design-system/src/art/filler-*.svg`
  - Without `--shot` it writes `/tmp/post-art-preview/<name>.html` and prints
    the path; `--serve` serves it on `PREVIEW_PORT` (default 4399) with a
    play/pause button, re-reading the files on every reload.

  Delete your PNGs when you are done.
- **The art catalogue**, preferred once you are close:
  `/design-system/art#<slug>` (`src/pages/design-system/art.astro`) shows
  every file through the real `ArtFrame` in both themes, with its bytes,
  element count and motion, and a "play all" toggle. Run `bunx astro dev`
  (never `bunx --bun`), then screenshot the entry at 1440 and 390 viewport
  widths.
- **In the quilt** at `/txt`. The tile should
  read at 230px next to its neighbours, and the motion should run on hover.
- **On the post** at `/txt/<slug>`, where the art is the MARK beside the
  title: ~270px wide, no plate, the page's ink, playing. With no plate
  behind it, a cut shows the page and a "white" face is the title's ink;
  check it still reads as the drawing, on both pages.

What to check:

- **At 230px** you can name the idea in one glance.
- **At 720px** it isn't empty, and nothing looks accidental.
- **Something crops an edge.**
- **The plate shows through** where you meant it to — and as a mark, with no
  plate at all, the drawing still holds.
- **The light column reads as the same drawing**, inverted: no line lost, no
  fill sinking into the bone plate, and the dark faces reading as faces.
- **The motion** loops without a jump and is paused at rest.
- **It looks like it belongs** on the reference sheet.

## 6. What not to do

- **No text.** No letters, digits, labels or logos, not even drawn as paths.
  A symbol is not text: a check, a cross (✕) or an arrow drawn as line work
  is fine.
- **No gradients, blurs, shadows, patterns, masks or opacity.** Flat fills only.
- **No literal colours.** Every colour is a token.
- **No plate inside the file.** No background rect, and no `--art-plate` used to
  hide something. Cut holes with evenodd, and draw only the visible edges.
- **No centred, symmetric composition** with everything inside the safe area
  and nothing cropped.
- **No more than one motion**, and no `<animate>`, `<style>` or `transform=`
  on the motion group.
- **No clutter.** Leave generous dark space. If the file approaches 120
  elements, the drawing is too busy, not the budget too small.
- **No realism.** A car is a node, water is a cylinder and rings, a desk is an
  iso slab. Draw systems, not illustrations.
- **Don't edit the tokens, the frame or the validator** to make a drawing pass.
  If the language cannot say something, report it instead of working around it.

## Committing

Commit one artwork per commit, touching only your file(s), as
`feat(art): <slug> — <the metaphor in a few words>`, lowercase (e.g.
`feat(art): mega-desk — an 8-ft slab too long for the frame`; a filler set is
`feat(art): <n> quilt filler tiles`). When other agents commit in the same tree,
use `git commit -- <file>` and retry on `index.lock`. Report anything this
skill made hard, so it can be folded back in.
