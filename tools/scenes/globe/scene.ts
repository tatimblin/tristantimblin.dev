/**
 * The globe — the L4 data route's proof: Natural Earth land (world-atlas,
 * 1:110m) through a d3-geo orthographic projection, rotated to the
 * Atlantic, on the 400×400 panel, with the frame chrome of a tracking
 * console drawn by the kit — corner crosses, brackets, a dashed range
 * ring, a dot-dash orbit that spins, a reticle, a ticked ruler and a
 * blinking marker on New York — all through `kit("scene")`. The readouts (MHZ, the EARTH 001 tag, the
 * stacked numerals) are HTML over the frame, placed by the page with
 * SceneLabel; nothing here is text.
 *
 *   bun run scenes:bake      → packages/design-system/src/scenes/globe.svg
 *
 * Credits and the data's licence are in README.md beside this file.
 */

import { createRequire } from "node:module";
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { scene } from "@whois/design-system/scenes/recipe";

const require = createRequire(import.meta.url);

/** The panel, and the disc on it: centred, at 60% of the width. */
const S = 400;
const C = S / 2;
const R = 120;

/** Where the marker sits: New York. */
const MARKER: [number, number] = [-74, 40.7];

/**
 * A path `d` as the file writes it: every number to a tenth (a coastline
 * at 400 units needs no more, and it is most of the file's bytes), no
 * trailing `.0`, no `-0`. Deterministic: d3-geo is, and the rounding is.
 */
const tidy = (d: string): string =>
	d.replace(/-?\d+(?:\.\d+)?/g, (n) => {
		const s = (+n).toFixed(1).replace(/\.0$/, "");
		return s === "-0" ? "0" : s;
	});

export default scene({
	viewBox: "0 0 400 400",
	credit: "Natural Earth (public domain), via world-atlas 110m",
	draw(k) {
		const topo = require("world-atlas/land-110m.json") as Topology<{ land: GeometryCollection }>;
		const land = feature(topo, topo.objects.land);
		const proj = geoOrthographic().scale(R).translate([C, C]).rotate([58, -18]).precision(0.6);
		const path = geoPath(proj);
		const [mx, my] = proj(MARKER)!;

		const chrome = { paint: "green", weight: "line" } as const;
		const guide = { paint: "dim", weight: "hair", dash: "dotted" } as const;

		return [
			// The console's guides: a dotted square inset 40, the crosshair out to the range ring, a dashed rule.
			k.path("M 40 0 V 400 M 360 0 V 400 M 0 40 H 400 M 0 360 H 400", guide),
			k.path("M 0 200 H 67 M 333 200 H 400 M 200 0 V 67 M 200 333 V 400", guide),
			k.line(290, 14, 290, 386, { paint: "dim", weight: "hair", dash: "dash" }),
			// The Earth: an ocean wash, the graticule, the land, the limb.
			k.ring(C, C, R, { paint: "none", fill: k.wash("blue", 22) }),
			k.path(tidy(path(geoGraticule10())!), { paint: "dim", weight: "hair" }),
			k.path(tidy(path(land)!), { paint: "ink", weight: "hair", fill: k.wash("green", 14) }),
			k.ring(C, C, R, { paint: "ink", weight: "hair" }),
			// The range ring, and the orbit: a satellite's trace and, opposite it, a short second one — a spinning
			// group turns about its own box, so the pair keeps the box centred on the disc.
			k.ring(C, C, 133, { paint: "dim", weight: "hair", dash: "long" }),
			k.group(
				[
					k.arc(C, C, 144, -170, -70, { paint: "red", weight: "line", dash: "dotdash" }),
					k.arc(C, C, 144, 10, 30, { paint: "red", weight: "line", dash: "dotdash" }),
				],
				{ motion: "spin", speed: 0.5 },
			),
			// The reticle on the centre, and the marker.
			k.ring(C, C, 18, chrome),
			k.plus(C, C, 12, chrome),
			k.path("M 176 200 H 181 M 219 200 H 224", chrome),
			k.group([k.dot(mx, my, 4, { paint: "red" })], { motion: "blink" }),
			// The frame chrome: corner crosses, brackets, the side ticks.
			...[26, 374].flatMap((y) => [26, 374].map((x) => k.plus(x, y, 14, chrome))),
			k.path("M 62 128 H 52 V 292 H 62", chrome),
			k.path("M 338 128 H 348 V 292 H 338", chrome),
			k.path("M 40 200 H 56 M 344 200 H 360", chrome),
			// The ruler: a washed band, minor ticks every 8, majors every 40.
			k.rect(80, 356, 240, 18, { paint: "none", fill: k.wash("green", 22) }),
			k.ticksLinear(80, 364, 320, 364, 31, 4, { paint: "green", weight: "hair" }),
			k.ticksLinear(80, 364, 320, 364, 7, 8, { paint: "green", weight: "hair" }),
		];
	},
});
