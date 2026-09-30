/**
 * Tahoe Mountain Hair — the post's art, as a baked scene: THE GRAPHIC
 * ALONE, in simple shapes. The post chases the hair a trip to Tahoe gave —
 * snowmelt off granite, carrying minerals into hard water — so the plate is
 * that water cycle drawn as three plain things and one loop, filling it:
 *
 * the MOUNTAIN is the bold `tri-bands` shape — a solid ink cap (the snow)
 * over cyan bands (the melt) — bleeding off the left edge; the LAKE is one
 * long cyan bar continuing its lowest band along the ground and off the right; the MINERALS
 * are small coral hexes, a pair on the flank and three in the lake; and the
 * water is a few cyan pips on a dotted loop that rises off the lake
 * (vapour), runs over the top and falls onto the peak (snow). No words: a
 * teaser, not a sheet.
 *
 * The motion is `steps`, five beats round the cycle — vapour, snow, melt,
 * minerals, lake: each beat's now-mark is the drop (a ring and a cyan pip)
 * at that stage. The still is the last beat: the drop in the lake.
 *
 *   bun run scenes:bake      → src/content/txt/tahoe-mountain-hair.svg
 *
 * Drawn from the kit and the tri-bands recipe: no credit.
 */

import triBands from "@whois/design-system/glyphs/recipes/tri-bands";
import type { Point } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The mountain: tri-bands at scale, its tile centre at M ------------------

const SCALE = 5.2;
/** The ground, where the mountain stands and the lake lies. */
const BASE = 156;
const M: Point = [68, BASE - 12 * SCALE];
/** The recipe's triangle on its 48×32 tile: apex at 4, base at 28, equilateral. */
const APEX: Point = [M[0], M[1] - 12 * SCALE];
const HALF = (24 / Math.sqrt(3)) * SCALE;
/** The lowest band's depth on the plate: the lake is that band carried on. */
const BAND = 1.75 * SCALE;

/** A point on the right flank, `t` from the apex (0) to the foot (1), `off` out from it. */
const flank = (t: number, off = 0): Point => {
	const [dx, dy] = [HALF, BASE - APEX[1]];
	const len = Math.hypot(dx, dy);
	return [APEX[0] + dx * t + (dy / len) * off, APEX[1] + dy * t - (dx / len) * off];
};

// --- The lake and the loop ----------------------------------------------------

const LAKE = { x0: M[0] + HALF + 8, x1: 324 };
/** The loop: up off the lake, across the top, down onto the peak. */
const RISE = 240;
const TOP = 13;
const LOOP: Point[] = [[RISE, BASE - BAND - 4], [RISE, TOP], [APEX[0], TOP], [APEX[0], APEX[1] - 7]];

/** The five stages round the cycle — vapour, snow, melt, minerals, lake: where the drop is. */
const STAGES: Point[] = [[RISE, 100], [APEX[0], TOP + 11], flank(0.58, 10), flank(0.82, 12), [LAKE.x0 + 34, BASE - BAND / 2]];

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const hair = { weight: "hair" } as const;
		const out: string[] = [];

		// The loop, dotted, with an arrow on each leg; the ground a dim hair under it all.
		out.push(
			k.wire(LOOP, { radius: 14, paint: "dim", ...hair, dash: "dotted" }),
			k.arrowhead(RISE, 74, 0, 3, { paint: "dim", ...hair }),
			k.arrowhead(160, TOP, 270, 3, { paint: "dim", ...hair }),
			k.arrowhead(APEX[0], APEX[1] - 7, 180, 3, { paint: "dim", ...hair }),
			k.line(-4, BASE + 0.5, 324, BASE + 0.5, { paint: "dim", ...hair }),
		);
		// The water on its way: a few cyan pips on the loop.
		for (const [x, y] of [[RISE, 124], [RISE, 36], [202, TOP], [114, TOP]] as Point[]) out.push(k.dot(x, y, 1.6, { paint: "blue" }));

		// The mountain: the bold shape, snow over melt.
		out.push(part(k, triBands, { at: M, scale: SCALE }));
		// The lake: the lowest band carried on along the ground.
		out.push(k.rect(LAKE.x0, BASE - BAND, LAKE.x1 - LAKE.x0, BAND, { paint: "none", fill: "blue" }));
		// The minerals: coral hexes on the flank, and dissolved in the lake.
		const mineral = ([x, y]: Point) => k.hex(x, y, 2.5, { paint: "none", fill: "red" });
		out.push(...[flank(0.74, 5), flank(0.9, 5)].map(mineral));
		out.push(...[LAKE.x0 + 12, LAKE.x0 + 64, LAKE.x0 + 104].map((x) => mineral([x, BASE - BAND / 2])));

		// --- the motion: a beat per stage, the drop there ---
		const beats = STAGES.map(([x, y], i) => [
			k.group([k.ring(x, y, 4.6, { paint: "ink", ...hair, fill: "none" }), k.dot(x, y, 2, { paint: i === 4 ? "ink" : "blue" })], { mark: "now" }),
		]);

		return [...out, k.steps(beats)];
	},
});
