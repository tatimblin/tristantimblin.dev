# tahoe-mountain-hair

The post art for *Tahoe Mountain Hair*: the water cycle in two touching
circular map insets — the lake basin (the lake with its island, pier and
boat, pines, a town and a hamlet, fields, trails) and the granite (a range
before a dimmer one, strata, a tarn, scree, crystals, a hut) — the creek
crossing between them, under a row of seven phase discs about the sun. It
moves in `steps`, five beats: evaporate, condense, snow, melt with its
minerals, collect — each lighting its phase disc and ringing it while it is
current.

`scene.ts` is the source; `bun run scenes:bake` writes
`src/content/txt/tahoe-mountain-hair.svg`. Drawn from nothing but the kit
(the range behind is cut at the front range's ridge with
`clipOutsidePolygon`, the shores and forests are `smoothD(points, true)`,
all from `lib/micro`): no external data, no credit.
