# phone

The L4 constructed route: the exploded phone of a synth panel's screen, on
the 320×180 plate. No data and no dependency — the drawing is the family-H
iso part recipes (`theme/design-system/src/glyphs/recipes/`: `handset`,
`iso-shell`, `rotary`, `pcb`, `battery`, `joystick`, `cone`, `spring`,
`screw`) run again with the scene kit, each placed by `part()`
(`theme/design-system/src/scenes/parts.ts`), plus a dashed explosion axis
and four wires drawn with the kit. `bun run scenes:bake` writes
`theme/design-system/src/scenes/phone.svg`; `bun run scenes:check` fails
when this directory, a recipe or the kit has drifted.

## Credits

None needed: nothing here is from a licensed source. The parts are this
repo's own recipes and the rest is the kit, so the recipe gives no `credit`
and `Scene` shows none.

## The composition

- **The stack** rides one z axis at x 160, centre-right, at scale 0.62:
  the handset, the top shell, the rotary disc, the board and the bottom
  shell, top to bottom. Every part shares the kit's true-30° projection,
  so their edges stay parallel whatever the offset.
- **The side parts** sit off the axis — the joystick and the cell to the
  left, the driver, the spring and two screws to the right — keeping the
  outer thirds nearly clear: those are the HTML readouts' (TONE, PHONIC,
  BAUD), placed by the page with `SceneLabel`.
- **The palette** is the ink plus green, red and blue: the H parts use all
  four colours between them and a scene may use three, so the shells and
  the handset are recoloured from lavender to the ink (`recolour`) — the
  case reads as the drawing's line work and the internals carry the colour.
- **The weight**: `part()` gives a recipe's unmarked strokes the glyph's
  `line` (1.5), so an outline stays heavier than its hairline detail.
- **The motion**: the explosion axis is a `dash` group at speed 0.5 — its
  dashes march down the stack under the pointer.

## Freshness

The header's hash covers this directory only. The recipes live in the
package, so a change to one of them (or to the kit) is invisible to the
registry test's hash — `bun run scenes:check`, which re-bakes, is the gate
for that. Run it after editing an H recipe.
