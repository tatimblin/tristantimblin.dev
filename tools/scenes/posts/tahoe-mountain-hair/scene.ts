/**
 * Tahoe Mountain Hair — the post's art, as a baked scene: A MODULE SHEET
 * in simple shapes. The post chases the hair a trip to Tahoe gave —
 * snowmelt off granite, carrying minerals into hard water — and rebuilds it
 * against San Francisco's soft water, so the plate is that water cycle drawn
 * as three plain things and one loop:
 *
 * THE CYCLE (the left two cells): the MOUNTAIN is the bold `tri-bands`
 * shape — a solid ink cap (the snow) over cyan bands (the melt) — bleeding
 * off the left edge; the LAKE is one long cyan bar continuing its lowest
 * band along the ground; the MINERALS are small coral hexes, a pair on the
 * flank and three in the lake; and the water is a few cyan pips on a dotted
 * loop that rises off the lake (vapour), runs over the top and falls onto
 * the peak (snow). The five stages are numbered where they happen.
 *
 * THE COLUMN (the right cell): BOND MASK 30 MIN as the big thin numeral
 * with the ACV ratio under it; WATER — San Francisco and Tahoe as two bar
 * meters, soft (one bar, ink) and hard (five, coral), with their air; the
 * weekly wash's five steps; and the bracketed state the routine is for.
 *
 * The motion is `steps`, five beats round the cycle — vapour, snow, melt,
 * minerals, lake: each beat's now-mark is the drop (a ring and a cyan pip)
 * at that stage with its label lit, and a bar of Tahoe's hardness meter
 * lands per beat. The still is the last beat: the drop in the lake, the
 * meter full — hard water.
 *
 *   bun run scenes:bake      → src/content/txt/tahoe-mountain-hair.svg
 *
 * Drawn from the kit and the tri-bands recipe: no credit.
 */

import triBands from "@whois/design-system/glyphs/recipes/tri-bands";
import { grid, type Point, span } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The sheet's grid: three columns, the cycle across two -------------------

const cells = grid(3, 1, 12, 16);
const CYCLE = span(cells[0], cells[1]);
const COL = cells[2];

// --- The mountain: tri-bands at scale, its tile centre at M ------------------

const SCALE = 3.9;
const M: Point = [42, 113.2];
/** The recipe's triangle on its 48×32 tile: apex at 4, base at 28, equilateral. */
const APEX: Point = [M[0], M[1] - 12 * SCALE];
const BASE = M[1] + 12 * SCALE;
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

const LAKE = { x0: M[0] + HALF + 6, x1: CYCLE.x + CYCLE.w - 6 };
/** The loop: up off the lake, across the top, down onto the peak. */
const RISE = 166;
const TOP = 48;
const LOOP: Point[] = [[RISE, BASE - BAND - 3], [RISE, TOP], [APEX[0], TOP], [APEX[0], APEX[1] - 5]];

/** The five stages round the cycle: where the drop is, and where its label sits. */
const STAGES: { name: string; at: Point; label: Point; anchor?: "end" }[] = [
	{ name: "Vapour", at: [RISE, 96], label: [RISE + 7, 97.3] },
	{ name: "Snow", at: [APEX[0], TOP + 8], label: [APEX[0] + 7, TOP + 9.3] },
	{ name: "Melt", at: flank(0.58, 7), label: [flank(0.58, 7)[0] + 7, flank(0.58, 7)[1] + 1.3] },
	{ name: "Minerals", at: flank(0.82, 9), label: [flank(0.82, 9)[0] + 7, flank(0.82, 9)[1] + 1.3] },
	{ name: "Lake", at: [LAKE.x0 + 24, BASE - BAND / 2], label: [LAKE.x0 + 24, BASE + 8.5] },
];

/** The weekly wash, as the post numbers it. */
const WASH = ["Clarify", "ACV rinse", "Bond mask", "Define", "Dry"] as const;

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const hair = { weight: "hair" } as const;
		const out: string[] = [];
		const num = (i: number) => String(i + 1).padStart(2, "0");

		// --- the title over its rule ----------------------------------------------
		out.push(
			k.text(CYCLE.x, 22.5, "MOUNTAIN_HAIR", { role: "title" }),
			k.rule(CYCLE.x, CYCLE.x + 78, 27),
			k.text(CYCLE.x, 34, "WATER CYCLE // TAHOE", { role: "caption" }),
		);

		// --- the cycle --------------------------------------------------------------
		// The loop, dotted, with an arrow on each leg; the ground a dim hair under it all.
		out.push(
			k.wire(LOOP, { radius: 10, paint: "dim", ...hair, dash: "dotted" }),
			k.arrowhead(RISE, 74, 0, 2.5, { paint: "dim", ...hair }),
			k.arrowhead(102, TOP, 270, 2.5, { paint: "dim", ...hair }),
			k.arrowhead(APEX[0], APEX[1] - 5, 180, 2.5, { paint: "dim", ...hair }),
			k.line(-4, BASE + 0.5, CYCLE.x + CYCLE.w, BASE + 0.5, { paint: "dim", ...hair }),
		);
		// The water on its way: a few cyan pips on the loop.
		for (const [x, y] of [[RISE, 126], [RISE, 60], [126, TOP], [76, TOP]] as Point[]) out.push(k.dot(x, y, 1.2, { paint: "blue" }));

		// The mountain: the bold shape, snow over melt.
		out.push(part(k, triBands, { at: M, scale: SCALE }));
		// The lake: the lowest band carried on along the ground.
		out.push(k.rect(LAKE.x0, BASE - BAND, LAKE.x1 - LAKE.x0, BAND, { paint: "none", fill: "blue" }));
		// The minerals: coral hexes on the flank, and dissolved in the lake.
		const mineral = ([x, y]: Point) => k.hex(x, y, 1.9, { paint: "none", fill: "red" });
		out.push(...[flank(0.74, 4), flank(0.9, 4)].map(mineral));
		out.push(...[LAKE.x0 + 10, LAKE.x0 + 46, LAKE.x0 + 76].map((x) => mineral([x, BASE - BAND / 2])));
		// The stages, numbered where they happen (dim until their beat lights them).
		STAGES.forEach((s, i) => {
			out.push(k.text(s.label[0], s.label[1], `${num(i)} ${s.name.toUpperCase()}`, { role: "caption", anchor: i === 4 ? "middle" : undefined }));
		});
		out.push(k.text(LAKE.x1, BASE + 8.5, "6225 FT", { role: "caption", anchor: "end" }));

		// --- the column ---------------------------------------------------------------
		const cx = COL.x;
		const cr = COL.x + COL.w;
		out.push(...[64, 112].map((y) => k.plus(cx - 6, y, 4, { paint: "dim", ...hair })));

		// BOND MASK: the big thin numeral, the rinse's ratio under it.
		out.push(
			k.readout(cx, 48, { value: "30", size: 32, label: "bond mask", caption: "min" }),
			k.text(cx, 56, "ACV 1 TBSP : 1 CUP", { role: "caption" }),
		);

		// WATER: the two cities as meters, soft and hard, with their air.
		const bar = (x: number, y: number, fill: "ink" | "dim" | "red") => k.rect(x, y, 5, 2, { paint: "none", fill });
		out.push(k.section(cx, 64, COL.w, "Water"));
		const SF = 79;
		const TAHOE = 95;
		out.push(
			k.text(cx, SF, "SAN FRANCISCO", { size: 3.5 }),
			k.text(cr, SF, "SOFT // HUMID", { role: "caption", anchor: "end" }),
			...[0, 1, 2, 3, 4].map((i) => bar(cx + i * 7, SF + 3, i === 0 ? "ink" : "dim")),
			k.text(cx, TAHOE, "TAHOE", { size: 3.5 }),
			k.text(cr, TAHOE, "HARD // DRY", { role: "caption", anchor: "end", paint: "ink" }),
			...[0, 1, 2, 3, 4].map((i) => bar(cx + i * 7, TAHOE + 3, "dim")),
		);

		// WEEKLY WASH: the five steps, two columns.
		out.push(k.section(cx, 112, COL.w, "Weekly wash // 05"));
		WASH.forEach((step, i) => {
			const [col, row] = i < 3 ? [0, i] : [1, i - 3];
			const [sx, sy] = [cx + col * 48, 127 + row * 6];
			out.push(k.text(sx, sy, num(i), { role: "caption" }), k.text(sx + 8, sy, step.toUpperCase(), { size: 3.5 }));
		});
		out.push(k.bracketLabel(cx, 155, "cuticle sealed", { size: 3.5 }), k.text(cr, 155, "(WEEKLY)", { role: "caption", anchor: "end" }));

		// --- the motion: a beat per stage, the drop there and a bar of hardness landing ---
		const beats = STAGES.map((s, i) => {
			const [x, y] = s.at;
			const inLake = i === 4;
			return [
				k.group(
					[
						k.ring(x, y, 3.6, { paint: "ink", ...hair, fill: "none" }),
						k.dot(x, y, 1.5, { paint: inLake ? "ink" : "blue" }),
						k.text(s.label[0], s.label[1], `${num(i)} ${s.name.toUpperCase()}`, { role: "caption", paint: "ink", anchor: inLake ? "middle" : undefined }),
					],
					{ mark: "now" },
				),
				bar(cx + i * 7, TAHOE + 3, "red"),
			];
		});

		return [...out, k.steps(beats)];
	},
});
