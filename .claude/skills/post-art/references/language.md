# The art language

This is the spec every post's art and every quilt filler is drawn in. It comes
from the plan's "The art language" section, corrected to what was built. Where
the two disagree, the build wins: the tokens (`tokens.overrides.css`, ART block),
the frame (`ArtFrame.astro`, `art-frame.css`) and the validator
(`packages/design-system/scripts/validate-art.mjs`). The CONVENTIONS "Art"
section in `packages/design-system/CONVENTIONS.md` is the short form.

## What the reference is

The reference is `.playwright-mcp/refs/illustration-style.jpg`: a 4×4 sheet of
tiles on a #202020 page. **Look at it before drawing.**

- **The tiles.** Landscape, about 1.9:1, with a thin grey hairline border and a
  small radius. The inside is a touch darker than the page.
- **The line work** is white and 1px: circuit traces with right-angle bends and
  terminal dots, fine grids, isometric wireframe boxes and cylinders,
  concentric rings, converging and fanning flow lines, dashed paths and tick
  marks.
- **The fills** are flat and solid, in five colours: white, lavender, coral,
  cyan (a cornflower blue, since the signal-neon retune) and green. There are
  no gradients and no tints. A few pseudo-isometric
  solids have white top faces and coloured or dark sides.
- **The subjects are systems metaphors**: nodes, chips, pills or capsules,
  cursors, checkboxes, scattered dots, stacked cards, a rolled tape or ribbon,
  and folded planes.
- **The compositions crop off the tile edges.** Objects run out of frame on one
  or two sides and sit off-centre. The tiles are sparse, with generous dark
  space.
- **The tile sheet has no text.** The later references (a HUD module
  sheet, a synth panel, a car infographic) do: tiny tracked caps labels,
  IDs and codes in brackets, big thin numerals with small caps captions.
  The language takes that lettering in four voices (see *Type*), sparingly.

Some tiles on the sheet, as a vocabulary:

- nodes on a rounded circuit with white iso slabs;
- a pill-shaped hub with lines fanning out to four chips;
- grids of pips linked by traces;
- a zigzag of folded planes;
- coins pouring from a funnel;
- a tunnel of rings ending in a dot-filled disc;
- a chip lifted off a wireframe cube;
- scattered iso cards;
- a box pierced by a square light;
- two dot-filled discs casting white shadows;
- three wireframe cylinders, each with a ball;
- a grid with dashed routes;
- pills with cursors converging to a point;
- a folded ribbon with discs;
- a scatter of squares on traces;
- two fat U-shaped ribbons.

## Tokens

The tokens live in `tokens.overrides.css`, in the ART block on the theme
classes. **The plate follows the theme.** The table gives the dark values:
plate, line, lavender and coral sampled from the sheet, cyan and green retuned
since toward signal neon (a cornflower blue, a bright signal green). The light theme overrides them in the block after:

- `--art-plate` is `--gray-300`, bone a step below the page;
- `--art-edge` is `--gray-500`;
- `--art-ink` is `--gray-1200`, a near-black, and `--art-ink-2` is the same
  45% mix of it;
- lavender, cyan and green are the same hues, darker and a touch more
  saturated, each near 3.5:1 on the bone (green drops a little chroma instead,
  to stay in sRGB at that depth);
- coral stays the accent.

So a light page shows the same drawing as ink on bone. **`--art-ink` is dark on
a light page:** a "white" face is a dark face there, and a cut to the plate
is light, not dark. Draw with contrast between ink, plate and fill, not with
"white" and "black", and it holds in both.

| Token | Value (dark) | Use | In a file? |
| --- | --- | --- | --- |
| `--art-plate` | `oklch(17% 0.008 280)` (≈ #18181f) | the tile fill | **never**: the frame draws it |
| `--art-edge` | `oklch(34% 0.006 280)` (≈ #3d3d42) | the tile's 1px border | **never** |
| `--art-radius` | `var(--border-radius-1)` (8px) | the frame's corner | **never** |
| `--art-ink` | `oklch(97% 0 0)` (≈ #f6f6f6) | line work and white fills | yes |
| `--art-ink-2` | the ink at 45% (`color-mix`) | secondary lines: grids, dashed paths, ghost outlines. The one dimming | yes |
| `--art-lavender` | `#bda3ea` (sampled #b8a0e8 / #c0a0e8) | fill | yes |
| `--art-coral` | `var(--accent)` (sampled #ea6a4f; it IS the site accent, an orange-red) | fill | yes |
| `--art-cyan` | `#5b8def` (signal neon, a cornflower blue; not sampled) | fill | yes |
| `--art-green` | `#5ee27f` (signal neon, a bright signal green; not sampled) | fill | yes |
| `--duration-loop` | `6s`, and `0s` under reduced motion | one cycle of an art animation | no: the frame's CSS |

**Paints.** A `fill` or `stroke` value is exactly one of these eight strings:

```
none   currentColor   var(--art-ink)   var(--art-ink-2)
var(--art-lavender)   var(--art-coral)   var(--art-cyan)   var(--art-green)
```

There are no spaces inside `var(…)` and no fallbacks. Hex, rgb and named
colours are all out. `currentColor` is the ink (the frame sets `color`), but
prefer to name the token. There is no `opacity`, `fill-opacity`,
`stroke-opacity` or `color` attribute: `var(--art-ink-2)` is the only dimming.

**Palette per file.** A file uses `--art-ink` plus **at most three** of the four
colours, and one colour dominates. Two colours is usually better than three.

**The plate is not a paint.** A dark detail on a fill (a chip's hole, a check
on a white box) is the plate **showing through**. On the light page that
detail is light and the box is dark, which still reads. Cut it with
`fill-rule="evenodd"`: draw the outer shape and the hole as subpaths of one
path. A back object hidden behind a front one is drawn as **only its visible
edges**. You never paint something plate-coloured to hide something else.

## Geometry

- **The canvas.** Use `viewBox="0 0 320 180"` (16:9) on a 10-unit grid, and sit
  points on multiples of 10 (isometric edges land off the grid, and that is
  fine). The safe area is inset 16 on every side (x 16..304, y 16..164).
  Nothing that must be read lives outside it, but shapes are **expected** to run
  out of frame: at least one element crosses an edge in every tile. The frame
  clips. It also renders the file with `preserveAspectRatio="xMidYMid slice"`,
  so a hero with another ratio crops the top and bottom, or the sides.
- **Strokes.** A stroke is 1 unit (`class="art-line"`, the inherited default)
  or 1.5 (`class="art-line--2"`, one emphasis outline, rarely). A literal
  `stroke-width` must be exactly `1` or `1.5` and must agree with the class.
  Every stroked shape carries `vector-effect="non-scaling-stroke"` **on
  itself**. It is not inherited from a `<g>`, and it is what makes the line 1px
  on screen at any size.
  - Use `stroke-linecap="round"` and `stroke-linejoin="round"` for organic
    paths, and the square default for circuit traces.
  - Dashes are exactly `4 4` or `2 6`. A dotted line is `2 6` with round caps.
- **Thick lines are shapes.** A ribbon, a band of tape or a fat pipe is a filled
  path between two parallel edges. A wide stroke is not allowed (1 or 1.5 only).
- **Isometric solids** are true 30°. The right axis is `(0.866, 0.5)`, the left
  `(-0.866, 0.5)` and up `(0, -1)`, so a 40-unit edge is `(±34.6, 20)`. The top
  face is `--art-ink`. The sides are one fill colour, or `fill="none"` with an
  ink outline (the plate).
  - An iso edge has slope **±0.577** (tan 30°), not 0.5. Place a point by a
    parameter `t` along the axis vector: `(x0 + 0.866·t, y0 + 0.5·t)`.
  - In 320×180 a long iso subject can only run off **top and right** or
    **left and bottom**. It can never run off left and right both: the
    frame is too short for the rise.
- **Cylinders.** Every ellipse has ry = rx / 2.
- **Dots.** Terminal dots on traces are r 2.5. Scattered dots are r 1.5 to 3,
  in `--art-ink` or one fill. Window-chrome dots (the three on a title bar)
  are circles of r ≥ 1.5; short dashes there read as text.
- **Budgets.**
  - At most **120 elements**. One `<path>` with many subpaths is one element,
    so draw grids, ticks and fans that way.
  - At most **20 KB** of source, comments included (12 before type). The template's comment is
    about 2 KB, so delete it if you get close.
  - At most **3 `<clipPath>`s**.
  - `<g>` nesting at most **4 deep**.

## Drawing traps

The validator passes all of these; your eye has to catch them.

- **Paint order.** Later elements paint over earlier ones, and the motion
  group is no exception. If dots or nodes must sit above moving lines, draw
  a second static group *after* the motion group.
- **Seams and cuts show what is behind.** An evenodd hole, or a gap between
  two faces, reveals anything drawn under it. Start hidden geometry exactly
  where it becomes visible, not at its true origin behind the face.
- **Line ends.** A line that ends exactly on the edge of a filled shape reads
  as a collision. Stop it short, with a clear gap, or run it under the shape.
- **Contrast.** Ink on ink disappears (a cursor on an ink row, a white dot on
  a white face). Put the mark on a colour, or cut it to the plate with an
  evenodd hole.
- **Words are type, never paths.** A check, a cross (✕), an arrow: line
  work. Letters and digits go in as `<text>` in a voice, never drawn as
  outlines; logos not at all.
- **Word widths are estimates.** The file cannot measure a font; the kit's
  `advance()` guesses from the measured cuts (figures 0.575 em, capitals
  0.72). Leave a margin after a word before the next mark, and look at it
  in the browser, where the real face sets it.
- **Outlines overlap honestly.** Overlapping *unfilled* shapes may let their
  back edges show through each other, as on the reference; that is a
  wireframe, not a mistake. Only filled solids hide what is behind them.

## Motion

- **When it plays.** Art moves only on hover, on focus, inside a hovered or
  focused link (the quilt's cells), or with `data-art-play` on the frame (the
  open post's mark). At rest it is paused.
- **The still frame is the poster.** The art must read as complete with the
  animation at t = 0. Under reduced motion `--duration-loop` is 0s, and the
  still frame is all anyone sees. (For `steps` the still frame is the
  FINISHED sequence — every beat lit, the last beat's now-mark, no ripple.)
- **The markup.** Put `<g data-motion="spin|drift|slide|blink|dash|steps">…</g>` around
  what moves, with an optional `data-speed="0.5|1|2"`. The speed goes only on
  that group; 0.5 is slower and 2 is faster.
  - A file has **at most one** `data-motion`, on a `<g>`, and the group must
    not be empty.
  - The frame owns the keyframes: `transform-box: fill-box; transform-origin:
    center`, linear timing and infinite loops.
  - **Do not put a `transform` attribute on the motion group itself.** The CSS
    animation's transform replaces it, and the group jumps. Position its
    children, or wrap it in a translated `<g>`.

| Kind | What the frame does | How to draw for it |
| --- | --- | --- |
| `spin` | `rotate(1turn)` per loop, about the group's **fill-box centre** | Make the group's bounding box centred on the pivot: a full circle as its outermost shape does it. Put something asymmetric inside (spokes, a pin dot) or the spin is invisible. |
| `drift` | `translate(6, -8)` units, out and back (alternate, ease-in-out), half a loop each way | A small move. Use it for a dot field, a cursor, a floating ball. It needs no clipPath, because the move is small and the frame clips. |
| `slide` | `translateX(-40)` units per loop, linear | The group must **repeat every 40 units** (10 and 20 divide it) and run from x ≤ 0 to at least x = 360, one period past the right edge, so the loop is seamless. Use it for tick rules, tape and conveyor rows. |
| `blink` | opacity dips to 0.3 and back on a hard step, four per loop | Use it for a node under test or a status light. Keep the group small: one filled shape, or a shape and its mark (a failed node and its cross). |
| `dash` | `stroke-dashoffset` advances by −8 (one period of `4 4` or `2 6`), six per loop | **Every** stroked shape in the group must be dashed (on itself or through the group). Nothing inside sets `stroke-dashoffset`. Use it for signal moving along a trace. |
| `steps` | a SEQUENCE: the group says `data-beats="N"` (2–8) and holds exactly `<g data-beat="0">` … `<g data-beat="N−1">`, in order; the host lands one beat a slot (a sixth of the loop) off one clock — unlanded beats faint (0.09), landed ones stay — after a half-slot HOLD of the finished walk, which is also the still frame; the loop is N + 2 slots | Draw the walk as its beats: what appears at each step. Inside a beat, `data-ripple` on a shape that scales out (0.3× → 2.1×, about its own box) and fades as the beat lands — a landing's ring, no `transform` on it; `data-now` on what shows only while the beat is current — a pointer is one copy per beat. A beat may hold a `<g transform>` (a footprint placed and turned). The last beat is the finished picture: draw it as where the drawing reads (the failure, the result), since a paused tile and a reduced-motion page show it. Use it for a walk, a trace of calls, a build-up. |

## Accessibility

The frame handles this, not the file. Art inside a link is `aria-hidden`, and
the link carries the post title. A standalone frame takes `label` and renders
`role="img"`. The file has no `<title>` or `<desc>`.

## Files

```
src/content/txt/<slug>.svg                  a post's art, beside <slug>.mdx
packages/design-system/src/art/filler-NN.svg   quilt fillers (abstract, no motion)
packages/design-system/src/art/_template.svg   the starting file
tools/scenes/posts/<slug>/scene.ts          a post's art as a BAKED SCENE source, when the
                                            picture needs the scene profile (SKILL.md, "A rich
                                            panel?"); it bakes to the same <slug>.svg under a
                                            header, which the validator reads
```

**Fillers** are quieter than post art: fewer and smaller fills, more
`--art-ink-2` line work, no `art-line--2` emphasis stroke, and no motion.
Across the set the dominant colour rotates through the four, and structure
carries the variety.

**The root** is exactly
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">`, with an
optional `preserveAspectRatio`. It has no `width`, `height`, `style` or
`xmlns:xlink`.

**Elements** are limited to `svg` (the root only), `g`, `path`, `rect`, `circle`,
`ellipse`, `line`, `polyline`, `polygon`, `clipPath`, `defs`, `use`, and the
type elements `text` and `tspan` (see *Type*). These fail on sight:

- `title`, `desc`;
- embedded content: `image`, `foreignObject`, `a`;
- styling and scripting: `style`, `script`;
- effects: `filter`, `linearGradient`, `radialGradient`, `pattern`, `mask`;
- animation: `animate`, `animateTransform`, `animateMotion`, `set`.

`symbol`, `marker` and a nested `svg` fail as not allowed.

**Attributes.**

- There is no `style=` and no `on*`.
- The only classes are `art-line` and `art-line--2`.
- There is no `xlink:`. A `<use>` takes `href="#…"`.

**Type.** Words on a plate are `<text>` (runs as `<tspan>` directly inside
it) in one of four VOICES — a class whose CSS in `art-frame.css` sets the
face, weight and tracking by role, so a file never names a font:

| Class | For | Face | font-size steps |
| --- | --- | --- | --- |
| `art-label` | IDs, codes, file names, a section head, `[ ACTIVE ]` | the label voice (Mondwest Regular), tracked caps | 3.5 · 4.5 · 6 |
| `art-caption` | the line under a readout, a log line (paint it `--art-ink-2`) | the same, less tracking | 3.5 · 4.5 |
| `art-title` | a module's heading: ONLINE, EPOCH | Mondwest Bold | 6 · 9 · 14 |
| `art-numeral` | the big thin figure: 007, 45 | Mondwest Thin | 9 · 14 · 22 · 32 |

The scale is 3.5 4.5 6 9 14 22 32 in viewBox units (3.5 ≈ 8px on a 720px
hero, texture in a 230px tile; 32 ≈ a 72px numeral). A `<text>` carries
exactly: `class` (one voice), `x`, `y` (the baseline), `font-size`, `fill`
(a token, never `none`), and optionally `text-anchor` (start / middle /
end) and `transform="rotate(-90 x y)"` or `rotate(90 x y)`. A `<tspan>` may
carry `class`, `x`, `y`, `dx`, `dy`, `font-size`, `fill`. Nothing else —
no `font-family`, `font-weight`, `letter-spacing`, `style`, `stroke`,
baseline attributes; the validator's `type` rule fails each. Write the
words in caps (there is no CSS case change, so `0x7B8A` keeps its x) and an
ampersand as `&amp;`. The voice: a HUD module sheet — small, tracked,
precise, IDs rather than prose; a numeral is the loudest word on a plate.
With the kit, `k.text()`, `k.section()`, `k.bracketLabel()`,
`k.readout()`, `grid()` and `ids(seed)` write it (`glyphs.md`, cheat sheet).
The worked example is the type specimen, `/design-system/glyphs#type-modules`.

**Ids** go only on a `<clipPath>` or on something inside `<defs>` that a `<use>`
points at. Every id is prefixed `<slug>-`, where the slug is the file's
basename; a filler's slug is `filler-NN`. Apply a clip with
`clip-path="url(#<slug>-…)"`. Every reference must resolve inside the file.

**Fill.** Every shape states its `fill` explicitly, as `none` or a token (on
itself or a parent `<g>`). A shape with no `fill` — an outline included —
renders with SVG's default **black fill**, invisible on the plate and covering
what is behind it; the validator fails it. `<line>` is exempt: it cannot fill.

## Proposals from Phase 2

Asked for by the Phase 2 artists. These are changes to the motion contract in
the DS frame (`art-frame.css`) and the validator, and are *not yet in the
frame*: don't draw for them.

- **Drift direction.** `drift` always goes (6, −8). Artists want a direction
  choice, e.g. downward for "settling" (asked twice).
- **Blink fully off.** `blink` dims only to 0.3; a caret wants to go fully off.
- **Iso slide.** `slide` moves only along x; a slide along an iso axis would
  let a conveyor or tape run on an iso plane.
