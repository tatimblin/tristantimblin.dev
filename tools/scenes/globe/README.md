# globe

The L4 data route: land from Natural Earth through a d3-geo orthographic
projection, on the 400×400 panel, with a tracking console's chrome drawn by
the art kit. `bun run scenes:bake` writes
`packages/design-system/src/scenes/globe.svg`; `bun run scenes:check` fails
when this directory or its output has drifted.

## Credits

- **Land** — [Natural Earth](https://www.naturalearthdata.com/) 1:110m
  physical vectors, **public domain** (Natural Earth places all of its data in
  the public domain; no attribution is required, and it is given anyway). It
  reaches the bake as [`world-atlas`](https://github.com/topojson/world-atlas)
  `land-110m.json` (TopoJSON by Mike Bostock, ISC licence), a root
  devDependency read at bake time and never shipped.
- **Projection** — [`d3-geo`](https://github.com/d3/d3-geo) (ISC), with
  [`topojson-client`](https://github.com/topojson/topojson-client) (ISC) to
  unpack the topology.

The credit line in the baked file's header — *Natural Earth (public domain),
via world-atlas 110m* — is what `Scene` shows under the drawing.

## The view

Rotated `[58, -18]`: the Atlantic in the middle, the Americas to the left,
Europe and West Africa to the right, tilted 18° so the north pole sits inside
the limb. The marker is New York (`[-74, 40.7]`). Scale 120 on a 400 panel puts
the disc at 60% of the width, leaving the ring, the orbit and the readouts
room. Coordinates are rounded to a tenth of a unit: the land is one `path`
and most of the file's bytes.
