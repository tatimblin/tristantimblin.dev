# Glyphs — drawing a micrographic

A glyph is a small signal-panel mark: a hairline drawing on a **48×32** grid,
inlined beside text (`<Glyph name>`) or set in a keycap (`<GlyphTile>`). It is
not post art. It has its own validator profile, its own kit and a bake step,
and it never sits on a plate. The full spec is the "Micrographics" section of
`packages/design-system/CONVENTIONS.md`. This file is the working copy for
drawing one.

Look at every existing mark first, on **`/design-system/glyphs`** (run
`bunx astro dev`, not `--bun`). It shows all of them, grouped by family, in
both themes (use the switch at the top).

## 0. Decide what you are making

Work down this list and stop at the first match:

1. **A generator already draws it.** A waveform, an envelope, a filter
   curve, an automation line, a gauge, a dial, a ladder, digits, a selector
   ring, a split or merge fan, linked or concentric rings, or a pip / x grid
   is a generator's props, not a new file. **Use a generator before drawing
   any curve.** Hand-plotting a sine or a biquad is where drift and bad
   coordinates creep in.
2. **The kit can say it** (rings, ticks, arcs, wires, arrows, shapes, stars,
   coils, iso solids): write a **recipe**, `src/glyphs/recipes/<name>.ts`,
   and bake it.
3. **It is organic and the kit would fight it** (a pointing hand, a gear knob
   with a letter, a padlock's shackle): draw it **by hand**,
   `src/glyphs/<name>.svg`, with no header.
4. **It is several marks plus text** (a signal chain, a labelled readout):
   that is an L3 module. Compose tiles in the page with DS components
   (`GlyphTile` with its `label` and `readout` slots, `Stat
   variant="numeral"`, `Chip`) and don't draw a glyph. Text never goes
   inside the SVG.

## 1. The grid and the profile (the validator enforces all of it)

- `viewBox="0 0 48 32"`. The wide ones are `0 0 96 32` (a keycap bank, a long
  readout) and `0 0 96 64`. No `width`, `height`, `style`, `class`, ids,
  `clipPath`, `defs`, `use` or text.
- Keep the drawing in the **safe area, x 4–44 × y 4–28**, centred on
  (24, 16). The tile shows about 78% of its width, so a mark that fills the
  safe area reads.
- Every stroked shape has `vector-effect="non-scaling-stroke"` and
  `stroke-width` **1** (hair: guides, ticks, ghosts) or **1.5** (line: the
  default). Every fill is stated.
- **Paint**: line work is `currentColor` (the text's ink), dimmed only as
  `var(--glyph-dim)` and never `--art-ink`. Colour comes from `var(--art-cyan
  | --art-coral | --art-green | --art-lavender)`, **at most two** per glyph.
  One colour carries the mark and the second is an accent: a node, a hot
  pip, a terminal.
- **Dashes**, in screen px: `0.01 3.99` (round-capped dots, the dotted
  guide), `2 2`, `4 4`.
- **Budget**: ≤ 40 elements / 3 KB (80 / 6 KB wide), groups ≤ 3 deep.
- **Motion**: at most one `<g data-motion="spin | drift | slide | blink |
  dash">`, the art's contract. It runs on hover and `play`, so the still
  frame must read on its own. A spinning group has to be centrally
  symmetric, because it turns about its own box.
- The house style: filled dots as terminals, dim dotted guides, one idea per
  mark, sparse. Look at `ring-in`, `junction`, `send` and `target` before
  you start.

You never type these attributes in a recipe. The kit writes them.

## 2. A recipe

```ts
// src/glyphs/recipes/send.ts — an aux send: a blue ring with a dot at its
// heart, and a green dashed tail that crawls outward (the one motion).
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(14, 16, 7, { paint: "blue" }),
	k.dot(14, 16, 1.5, { paint: "blue" }),
	k.group(k.line(24, 16, 44, 16, { paint: "green", dash: "long" }), { motion: "dash" }),
]);

// Wide (recipes/keycaps.ts): export default recipe({ viewBox: "0 0 96 32", draw: (k) => [ … ] });
```

`k` is `kit("glyph")`. The bake writes the file under `<!-- baked from
recipes/<name>.ts — edit the recipe -->`. Always edit the recipe, never
the baked file.

### Kit cheat sheet (`packages/design-system/src/lib/micro/kit.ts`)

Arguments go position first, then size, then an options object. Angles are
in degrees on a dial: 0 is up, and they run clockwise. Output is rounded to
two decimals.

Options: `StrokeOpts { paint, weight: "hair" | "line", dash: "dotted" |
"dash" | "long", cap: "round" | "butt" | "square" }`. `ShapeOpts` adds
`fill`, and `paint: "none"` with a fill gives a flat shape. The paints are
`ink | dim | blue | red | green | lavender | none` (blue is `--art-cyan` and
red is `--art-coral`).

| Call | Draws |
| --- | --- |
| `dot(x, y, r?, {paint})` | a filled dot (a terminal) |
| `pip(x, y, r = 2, o)` | a hollow pip |
| `terminal(x, y, size?, o)` | a square terminal |
| `line(x1, y1, x2, y2, o)` | a line |
| `polyline(points, o)` / `path(d, o)` | an open polyline / any path |
| `guide(points, o)` | a dim, hair, dotted guide |
| `wire(points, {radius = 3, start, end})` | an orthogonal wire with rounded elbows, ending in `none | dot | terminal` |
| `leader(from, to, o)` | a callout line ending in a dot |
| `arc(cx, cy, r, a0, a1, o)` | an arc between two dial angles |
| `ring(cx, cy, r, o)` | a circle |
| `band(cx, cy, r0, r1, a0, a1, {paint, cap})` | a filled thick arc (a thick line is a shape, never a wide stroke) |
| `chevron(x, y, angle, size = 3, o)` / `arrowhead(…)` | an open chevron / an arrowhead |
| `plus(x, y, size, o)` / `cross(…)` / `check(…)` | the marks |
| `ticksRadial(cx, cy, r0, r1, n, a0, a1, o)` | n ticks across a sweep |
| `ticksLinear(x0, y0, x1, y1, n, size, {centred})` | n ticks along a line |
| `needle(cx, cy, r, angle, {hub})` | a needle from a pivot dot |
| `polygon(points, o)` / `tri(cx, cy, r, {angle})` / `hex(cx, cy, r, o)` | closed shapes |
| `rect(x, y, w, h, o)` / `roundRect(x, y, w, h, r, o)` / `pill(x, y, w, h, o)` / `keycap(x, y, w, h, {r})` | boxes |
| `bracket(x, y, size, "tl" \| "tr" \| "bl" \| "br", o)` | a corner bracket |
| `star(cx, cy, n, inner, outer, o)` | a spiky ring (distortion) |
| `coil(x, y, length, turns, r, o)` | a spring |
| `isoBox(x, y, w, d, h, o)` / `isoCylinder(x, y, r, h, o)` / `isoPlane(x, y, w, d, {grid})` / `vanishingGrid(vx, vy, w, h, rows, cols, o)` | iso solids at a true 30°, with visible faces only |
| `group(children, {motion, speed, transform})` | a group, the one motion |
| helpers: `polar(cx, cy, r, angle)`, `onArc`, `spread`, `snap`, `round`, `iso(x, y, z)` | geometry, from `lib/micro` |

## 3. Hand-drawn

This is a plain SVG with the profile's attributes typed out. Copy them from
`toggle.svg`, `hand.svg`, `knob.svg`, `lock.svg` or `battery.svg`. Leave out
the header: the bake identifies its own output by it and never touches a
file without one. A recipe and a hand-drawn file with the same name is an
error.

## 4. Register, check, look

1. Add the name to `GLYPH_NAMES` in `packages/design-system/src/glyphs/names.ts`.
2. If it is not a control (F), give it a family in the `FAMILY` table at the
   top of `src/pages/design-system/glyphs.astro`: **A** waves, **B** curves,
   **C** instruments, **D** routing, **E** fields, **F** controls, **H** iso
   parts.
3. Run the commands:
   - `bun run glyphs:bake` bakes the recipes (validating each; a violation
     writes nothing).
   - `bun run validate:glyph packages/design-system/src/glyphs/<name>.svg`
     checks a hand-drawn file.
   - `bun run glyphs:check` exits 1 on a stale or orphaned baked file.
   - `bun run test:unit` runs the registry test (names ↔ files, the profile
     on every file, an in-memory re-bake), the kit and the generator sweeps.
4. Look at it on `/design-system/glyphs#glyph-<name>` in **both** themes,
   inline beside text as well as in the tile. It has to read at 32px tall.
   The Playwright spec `tests/glyphs.spec.ts` checks that it gets a tile.

## 5. A new generator (rarely)

Write one only when a family of marks differs by numbers. The function goes
in `lib/micro/gen/<family>.ts` and returns a `Drawing`. Clamp every param
(`clamp`, `clampInt`, `paintOf`) so that any input validates. Draw one path
of many points rather than many elements, and keep it deterministic (use
`rng(seed)`). Re-export it from `gen/index.ts` and `lib/micro`, and add a
component of a few lines on `GlyphSvg` (`data-gen`, plus `meterAria` if it
is a meter). Sweep it in `gen/*.test.ts`, add its variants to the sheet's
`spread` table, and add it to `GENERATORS` in `tests/glyphs.spec.ts`. The
checklist is in CONVENTIONS.

## 6. The menu

**Glyph files** (`<Glyph name>`). R is a recipe, H is hand-drawn.

| Fam. | Glyphs |
| --- | --- |
| D routing | `crossfade` R · `junction` R (the dot-line-dot between tiles) · `leader` R · `loop` R · `ring-in` R · `ring-out` R · `send` R · `wire` R |
| E fields | `distort` R (spiky star ring) · `dot-rain` R · `halo` R · `orbit` R · `registration` R · `reticle` R · `target` R |
| F controls | `amp` H (holds a readout) · `bracket` R · `checkbox` R · `compass` H · `cross` R · `crossbox` R · `dot` R · `gate` R · `hand` H · `hex` R · `keycaps` R (wide) · `knob` H · `lock` H · `pan` H · `plus` R · `spark` R · `speaker` H · `toggle` H |
| H iso parts | `battery` H |

**Generators**, with their props (ranges and defaults are in each
component's header and the CONVENTIONS table):

| Fam. | Component | Variants |
| --- | --- | --- |
| A | `<Wave shape cycles amp seed paint>` | sine · saw · square · triangle · noise · burst |
| B | `<Envelope a d s h r paint>` | ADSR (default) · AR (`d={0} s={1}`) · AD (`s={0}`) |
| B | `<Filter type cutoff q paint accent>` | lp · hp · bp (a resonant peak, centre in red) · notch |
| B | `<Curve points nodes smooth dotted paint accent>` | a dotted automation line with green nodes · a smooth solid curve |
| C | `<Gauge value sweep paint track>` | a 270° arc meter · 180° (π) |
| C | `<Dial value ticks sweep paint>` | the FREQ needle dial |
| C | `<Ladder value \| lit steps axis paint>` | a vertical or horizontal level ladder |
| C | `<Segments value paint>` | 7-segment digits, 1–4 on 48×32 and 5–8 wide |
| C | `<Selector n active colours paint accent spin>` | the dot-ring selector (P.DEST), optionally spinning |
| D | `<Fan n dir dotted paint accent>` | split 1→n · merge n→1 · dotted spread |
| E | `<Rings n mode fade dotted paint accent>` | the unison chain · a concentric stack or halo |
| E | `<Matrix rows cols on hot mark cursor paint accent>` | a pip matrix with a hot pip · an x/o grid with a square cursor · wide past six columns |

A labelled `Gauge`, `Dial` or `Ladder` is `role="meter"` with
`aria-valuenow` as a percentage. Every host takes `size` (6 | 8 | 10 | 12),
`label`, `play` and `class`.

**The backlog**, to pull as the site needs it (plan inventory): transient
in an envelope, sine + lock, noise → square (sample and hold), phase-cross;
notch or shelf with a dotted ceiling, ramp, bezier with green handles,
waveshaper x³, phase invert; clock in a dotted ring, ladder + switch lever,
segmented colour bar, scale with a pointer, dotted progress, dot-circle
loader (spin), skyline bars; toggle lever between contacts; RGB trio overlap,
pendulum; stacked cards; the rest of the iso parts (shell, PCB with chips,
spring, rotary disc, speaker cone, screw, joystick, handset). Before adding
any of these, check whether it is a generator's props or a kit recipe.
