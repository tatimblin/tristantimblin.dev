# Motifs — the vocabulary, drawn

Small drawings in the language to copy and adapt. Each one is valid on its own:
wrapped in `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">` it
passes the validator (`bun packages/design-system/scripts/check-art-motifs.mjs`
checks every block in this file). Most sit in a `<g transform="translate(x y)">`
with local coordinates from the origin, so moving one is changing two numbers;
keep the translate on multiples of 10 and it stays on the grid.

Adapting them:

- **Keep every attribute string intact.** The long tail on each stroked shape
  (`fill="none" stroke="…" class="art-line" vector-effect="non-scaling-stroke"`)
  is the part the validator checks; change coordinates and the colour token,
  not the tail.
- **Colours are swappable** among `var(--art-lavender|coral|cyan|green)`, but a
  file carries the ink plus at most three of them. Pick the tile's colours
  first, then recolour the motifs you use.
- **Motion lives on one group per file.** Only the tape reel carries a
  `data-motion`; if you use it, that is the file's one motion. The
  **Motion** section of `language.md` says how to add one to the others.
- **Mind the budget.** One `<path>` with many subpaths (`M … M …`) is one
  element: the grid, the fan and the ticks are drawn that way on purpose.
- **Watch the `<g>` depth.** The wrapper is one level; a motion group inside it
  is two. Stay at 4 or under.

---

### Iso box

A solid object, a block of state, a desk, a server. True 30°: a 40-unit edge
is (±34.6, 20). Top face ink, one side a colour, the other the plate with an ink
outline. For a wireframe box, make all three faces `fill="none"` with the ink
stroke. Run a long one off an edge by stretching one axis.

```svg
<g transform="translate(200 60)">
  <path d="M 0 0 L 34.6 20 L 0 40 L -34.6 20 Z" fill="var(--art-ink)" />
  <path d="M 34.6 20 V 60 L 0 80 V 40 Z" fill="var(--art-lavender)" />
  <path d="M -34.6 20 L 0 40 V 80 L -34.6 60 Z" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
</g>
```

### Cylinder

A store, a container, a jar of water, a database. Every ellipse has ry = rx / 2.
The bottom is a solid ink ellipse and the top an outline. The dotted arc is a
level line, and a coloured ball floats inside.

```svg
<g transform="translate(240 60)">
  <path d="M -30 0 V 70 M 30 0 V 70" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
  <ellipse cx="0" cy="70" rx="30" ry="15" fill="var(--art-ink)" />
  <path d="M -30 35 A 30 15 0 0 0 30 35" fill="none" stroke="var(--art-ink-2)" stroke-dasharray="2 6" stroke-linecap="round" class="art-line" vector-effect="non-scaling-stroke" />
  <ellipse cx="0" cy="0" rx="30" ry="15" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
  <circle cx="0" cy="22" r="9" fill="var(--art-lavender)" />
</g>
```

### Chip

A component, a processor, a unit of work. The dark hole is the **plate showing
through**, cut with `fill-rule="evenodd"` (outer square, inner circle, one
path). That is how any dark detail on a fill is drawn. The pins are one path.

```svg
<g transform="translate(60 50)">
  <path d="M 0 0 H 40 V 40 H 0 Z M 20 12 A 8 8 0 1 0 20 28 A 8 8 0 1 0 20 12 Z" fill="var(--art-cyan)" fill-rule="evenodd" />
  <path d="M 8 -8 V 0 M 20 -8 V 0 M 32 -8 V 0 M 8 40 V 48 M 20 40 V 48 M 32 40 V 48 M -8 8 H 0 M -8 20 H 0 M -8 32 H 0 M 40 8 H 48 M 40 20 H 48 M 40 32 H 48" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
</g>
```

### Pill

A token, a message, a capsule in flight, a toggle. Height 10 with `rx` 5. The
top one is a solid pill with an ink cap, the bottom an outline with an ink end.
Put several on flow lines (see the fan) to show things moving.

```svg
<g transform="translate(40 60)">
  <rect x="0" y="0" width="40" height="10" rx="5" fill="var(--art-green)" />
  <circle cx="35" cy="5" r="3" fill="var(--art-ink)" />
  <rect x="10" y="30" width="40" height="10" rx="5" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
  <rect x="10" y="30" width="14" height="10" rx="5" fill="var(--art-ink)" />
</g>
```

### Node and trace

A call, a pipeline, a signal path. Circuit traces bend at right angles with
square caps, run in from the edge, and end on an r 2.5 terminal dot. A branch
may round its corner with an arc (`A 10 10 0 0 1 …`), as in the dim one here.
A node is a small filled square sitting on the trace.

```svg
<path d="M -10 50 H 70 V 110 H 150" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
<path d="M 70 80 H 110 A 10 10 0 0 1 120 90 V 190" fill="none" stroke="var(--art-ink-2)" class="art-line" vector-effect="non-scaling-stroke" />
<rect x="64" y="44" width="12" height="12" fill="var(--art-coral)" />
<circle cx="70" cy="80" r="2.5" fill="var(--art-ink)" />
<circle cx="150" cy="110" r="2.5" fill="var(--art-ink)" />
```

### Cursor

A person's hand in the system: choosing, pointing, an agent acting. The tip
is the translate point. The solid one is the actor and the outlined one a ghost
or earlier position. Set one at the end of a pill, as in the reference.

```svg
<g transform="translate(150 80)">
  <path d="M 0 0 V 16 L 4 12.5 L 7 19 L 9.5 18 L 6.5 11.5 H 12 Z" fill="var(--art-ink)" />
  <path d="M 30 10 V 26 L 34 22.5 L 37 29 L 39.5 28 L 36.5 21.5 H 42 Z" fill="none" stroke="var(--art-ink-2)" stroke-linejoin="round" class="art-line" vector-effect="non-scaling-stroke" />
</g>
```

### Checkbox

A pass, a done step, an assertion. An ink check sits on an outline box or on a
coloured one. A dark check on a white box needs the evenodd cut (see the chip),
so prefer the coloured box. The check takes round caps and joins.

```svg
<g transform="translate(100 70)">
  <rect x="0" y="0" width="14" height="14" rx="2" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
  <path d="M 3.5 7 L 6 9.5 L 10.5 4.5" fill="none" stroke="var(--art-ink)" stroke-linecap="round" stroke-linejoin="round" class="art-line" vector-effect="non-scaling-stroke" />
  <rect x="30" y="0" width="14" height="14" rx="2" fill="var(--art-green)" />
  <path d="M 33.5 7 L 36 9.5 L 40.5 4.5" fill="none" stroke="var(--art-ink)" stroke-linecap="round" stroke-linejoin="round" class="art-line" vector-effect="non-scaling-stroke" />
</g>
```

### Concentric rings

Focus, a source, radiation, a ripple, a target. Put the centre near a corner
so the rings cross the edges. The rings are in dim ink and the centre is a
colour. For a tunnel, step the centres along x instead of sharing one.

```svg
<circle cx="290" cy="30" r="16" fill="none" stroke="var(--art-ink-2)" class="art-line" vector-effect="non-scaling-stroke" />
<circle cx="290" cy="30" r="30" fill="none" stroke="var(--art-ink-2)" class="art-line" vector-effect="non-scaling-stroke" />
<circle cx="290" cy="30" r="44" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
<circle cx="290" cy="30" r="58" fill="none" stroke="var(--art-ink-2)" class="art-line" vector-effect="non-scaling-stroke" />
<circle cx="290" cy="30" r="6" fill="var(--art-coral)" />
```

### Fan of flow lines

Many into one: convergence, aggregation, a funnel, inputs meeting at a point.
All five lines are one path running in from the left edge, and the pills ride
them. Reverse the x coordinates and it fans out instead: one into many.

```svg
<path d="M -10 30 C 150 30 190 90 280 90 M -10 60 C 150 60 190 90 280 90 M -10 90 H 280 M -10 120 C 150 120 190 90 280 90 M -10 150 C 150 150 190 90 280 90" fill="none" stroke="var(--art-ink)" stroke-linecap="round" class="art-line" vector-effect="non-scaling-stroke" />
<circle cx="286" cy="90" r="6" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
<rect x="40" y="25" width="24" height="10" rx="5" fill="var(--art-cyan)" />
<rect x="80" y="115" width="24" height="10" rx="5" fill="var(--art-green)" />
```

### Dashed path

A route, a plan, something not yet taken, a wireless link. Use `4 4` for a
dashed line and `2 6` with round caps for a dotted one, both in dim ink. This
is the natural home for `data-motion="dash"` (wrap the dashed shapes in the
group and set no `stroke-dashoffset`).

```svg
<path d="M 40 150 C 90 150 90 60 150 60 S 230 20 330 40" fill="none" stroke="var(--art-ink-2)" stroke-dasharray="4 4" stroke-linecap="round" class="art-line" vector-effect="non-scaling-stroke" />
<path d="M 150 60 V 190" fill="none" stroke="var(--art-ink-2)" stroke-dasharray="2 6" stroke-linecap="round" class="art-line" vector-effect="non-scaling-stroke" />
<circle cx="40" cy="150" r="2.5" fill="var(--art-ink)" />
<circle cx="150" cy="60" r="2.5" fill="var(--art-ink)" />
```

### Dot field

Particles, data, sediment, signal, noise. Scatter them unevenly: dots r 1.5 to
3 and 6-unit squares, mostly one colour with some ink. Let one cross an edge.
This is the natural home for `data-motion="drift"`.

```svg
<circle cx="200" cy="30" r="3" fill="var(--art-cyan)" />
<circle cx="236" cy="62" r="1.5" fill="var(--art-ink)" />
<rect x="258" y="24" width="6" height="6" fill="var(--art-cyan)" />
<circle cx="290" cy="80" r="2" fill="var(--art-ink)" />
<rect x="222" y="104" width="6" height="6" fill="var(--art-green)" />
<circle cx="270" cy="130" r="2.5" fill="var(--art-cyan)" />
<circle cx="321" cy="46" r="3" fill="var(--art-cyan)" />
<circle cx="190" cy="140" r="1.5" fill="var(--art-ink)" />
```

### Stacked cards

Windows, versions, a pile of dashboards, layers. You cannot paint the plate to
hide a back card, so **draw only its visible edges**. Each back card is an
open path around the corner it shows. The front card is the fill, and its
content is ink lines.

```svg
<g transform="translate(120 70)">
  <path d="M 16 -8 V -16 H 86 V 34 H 78" fill="none" stroke="var(--art-ink-2)" class="art-line" vector-effect="non-scaling-stroke" />
  <path d="M 8 0 V -8 H 78 V 42 H 70" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
  <rect x="0" y="0" width="70" height="50" fill="var(--art-lavender)" />
  <path d="M 8 12 H 40 M 8 22 H 56 M 8 32 H 30" fill="none" stroke="var(--art-ink)" stroke-linecap="round" class="art-line" vector-effect="non-scaling-stroke" />
</g>
```

### Tape reel

Recording, a log, time passing, memory. The wound tape is an evenodd ring, and
the tape runs off to the right as a **filled band** (a thick line is a shape,
never a wide stroke). The reel spins: the group's box is centred on the hub,
so it turns about its own centre, and the spokes and the pin show that it is
turning.

```svg
<g transform="translate(90 80)">
  <circle cx="0" cy="0" r="44" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
  <path d="M 0 28 H 250 V 34 H 0 Z" fill="var(--art-coral)" />
  <g data-motion="spin" data-speed="0.5">
    <path d="M 0 -34 A 34 34 0 1 0 0 34 A 34 34 0 1 0 0 -34 Z M 0 -14 A 14 14 0 1 1 0 14 A 14 14 0 1 1 0 -14 Z" fill="var(--art-coral)" fill-rule="evenodd" />
    <path d="M 0 -14 V 14 M -12.1 -7 L 12.1 7 M -12.1 7 L 12.1 -7" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
    <circle cx="0" cy="-24" r="2.5" fill="var(--art-ink)" />
    <circle cx="0" cy="0" r="4" fill="var(--art-ink)" />
  </g>
</g>
```

### Grid with pips

A board, a schedule, a matrix, a test grid. The fine grid is one dim path, and
filled pips, a ring or a checkbox sit in the cells. Crop it off an edge. The
reference has several of these.

```svg
<g transform="translate(180 20)">
  <path d="M 0 0 H 160 M 0 20 H 160 M 0 40 H 160 M 0 60 H 160 M 0 80 H 160 M 0 0 V 80 M 20 0 V 80 M 40 0 V 80 M 60 0 V 80 M 80 0 V 80 M 100 0 V 80 M 120 0 V 80 M 140 0 V 80" fill="none" stroke="var(--art-ink-2)" class="art-line" vector-effect="non-scaling-stroke" />
  <circle cx="30" cy="10" r="4" fill="var(--art-coral)" />
  <circle cx="70" cy="50" r="4" fill="var(--art-lavender)" />
  <circle cx="110" cy="30" r="4" fill="var(--art-ink)" />
  <circle cx="50" cy="70" r="4" fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke" />
</g>
```

### Ribbon

A long run, a road, a loop, a timeline that doubles back. Draw it as a filled
U: the outer edge, a semicircle, the inner edge back and a closing Z. The ink
centre line is optional. For a thicker band, move the inner edge in.

```svg
<path d="M -10 40 H 200 A 50 50 0 0 1 200 140 H -10 V 120 H 200 A 30 30 0 0 0 200 60 H -10 Z" fill="var(--art-lavender)" />
<path d="M -10 50 H 200 A 40 40 0 0 1 200 130 H -10" fill="none" stroke="var(--art-ink)" stroke-dasharray="4 4" class="art-line" vector-effect="non-scaling-stroke" />
```
