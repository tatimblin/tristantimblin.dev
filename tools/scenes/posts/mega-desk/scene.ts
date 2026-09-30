/**
 * The Mega Desk — the post's art, as a baked scene: A MODULE SHEET.
 * One strong element and a column of tight modules on the type
 * specimen's grid (`src/art/specimen.ts`), in the ink with two accents.
 *
 * THE DESK (the left two cells): the 8-ft top in iso line work, joystick
 * quality — the slab's three faces outlined, the glue-up's plank seams
 * dim on its top, two dual-motor legs (a foot, a telescoping column), and
 * the leg cable slung between them with its CORAL middle: the Etsy
 * extension that made it reach. The footprint is dashed on the floor and
 * the span dimensioned along the front, "8 FT". A title over a rule names
 * the sheet; a leader off the top names the wood.
 *
 * THE COLUMN (the right cell): SPAN 96 IN as the big thin numeral, the
 * loft in plan (168 × 54, the desk along the 8-ft wall), the legs (dual
 * motor, the cable's extension), and the mode — [ STANDING ], always —
 * with its GREEN live dot.
 *
 * The motion is `steps`: the desk rises sitting to standing, a beat per
 * height. Each beat's now-mark is the desk at that height with its state
 * ([ SITTING ] → [ RISING ] → [ STANDING ]); a pip of the height meter
 * lands per beat. The still frame is the last beat: standing, always.
 *
 * HIDDEN LINES: the slab is line work, so what stands under it — legs,
 * feet, the cable — is drawn as segments cut outside the slab's
 * silhouette at that height (`convexHull` + `clipOutside`).
 *
 *   bun run scenes:bake      → src/content/txt/mega-desk.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { chain, clipOutside, convexHull, edges, grid, iso, type Kit, type Point, type Segment, segmentsD, type ShapeOpts, span } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The sheet's grid: three columns, the desk across two -------------------

const cells = grid(3, 1, 12, 16);
const DESK = span(cells[0], cells[1]);
const COL = cells[2];

// --- The desk, in world units: x along the 8 ft, y its depth, z up ----------

/** Where the far corner of the floor lands on the plate. */
const O: Point = [DESK.x + 30, 90];
const S = (x: number, y: number, z: number): Point => iso(x, y, z, O);

/** The top: L long, D deep, T thick. */
const [L, D, T] = [104, 26, 3];
/** The heights the desk passes through, sitting to standing: one beat each. */
const HEIGHTS = [26, 32, 38, 44];
const STATES = ["sitting", "rising", "rising", "standing"];
/** The legs, by their x (4 wide), and the depth their column stands at. */
const LEGS = [8, L - 12];
const [LW, LY] = [4, D / 2 - 2];
/** The lower stage's height; the upper, a unit in, runs from it to the slab. */
const STAGE = 14;

/** The three visible faces of a box — its +x end, its +y side and its top — as segments. */
const boxEdges = (x: number, y: number, w: number, d: number, z0: number, z1: number): Segment[] => [
	...edges([S(x + w, y, z0), S(x + w, y + d, z0), S(x + w, y + d, z1), S(x + w, y, z1)]),
	...edges([S(x, y + d, z0), S(x + w, y + d, z0), S(x + w, y + d, z1), S(x, y + d, z1)]),
	...edges([S(x, y, z1), S(x + w, y, z1), S(x + w, y + d, z1), S(x, y + d, z1)]),
];

/** The leg cable, slung from leg to leg under the top: the ink runs off each leg, the coral extension between. */
function cable(H: number): { ends: Segment[]; ext: Segment[]; joins: Point[] } {
	const [a, b] = [LEGS[0] + LW, LEGS[1]];
	const z = H - T - 2;
	const sag = (t: number) => z - Math.min(20, z - 3) * Math.sin(Math.PI * t);
	const pts = Array.from({ length: 17 }, (_, i) => {
		const t = i / 16;
		return S(a + (b - a) * t, LY + LW / 2, sag(t));
	});
	return { ends: [...chain(pts.slice(0, 5)), ...chain(pts.slice(12))], ext: chain(pts.slice(4, 13)), joins: [pts[4], pts[12]] };
}

/** The desk at height H: what stands under it cut outside the slab's silhouette, then the slab. */
function desk(k: Kit, H: number): string[] {
	const z0 = H - T;
	const silhouette = convexHull([0, L].flatMap((x) => [0, D].flatMap((y) => [z0, H].map((z) => S(x, y, z)))));
	const hidden = (segs: Segment[], o: ShapeOpts): string[] => {
		const d = segmentsD(clipOutside(segs, silhouette));
		return d ? [k.path(d, o)] : [];
	};

	const out: string[] = [];
	// The legs: a foot across the depth, then two stages, the upper a unit in.
	for (const lx of LEGS) {
		out.push(...hidden(boxEdges(lx - 1, 1, LW + 2, D - 2, 0, 2), { paint: "ink", weight: "hair" }));
		out.push(...hidden([...boxEdges(lx, LY, LW, LW, 2, STAGE), ...boxEdges(lx + 0.75, LY + 0.75, LW - 1.5, LW - 1.5, STAGE, z0)], { paint: "ink", weight: "hair" }));
	}
	// The cable, and its extension in coral, a join at each end of it.
	const c = cable(H);
	out.push(...hidden(c.ends, { paint: "ink", weight: "hair" }), ...hidden(c.ext, { paint: "red", weight: "line" }));
	for (const [x, y] of c.joins) out.push(k.dot(x, y, 1, { paint: "red" }));

	// The slab: its three faces outlined, the top heavier, and the glue-up's seams.
	out.push(
		k.polygon([S(0, 0, H), S(L, 0, H), S(L, D, H), S(0, D, H)], { paint: "ink", weight: "line" }),
		k.polygon([S(0, D, z0), S(L, D, z0), S(L, D, H), S(0, D, H)], { paint: "ink", weight: "hair" }),
		k.polygon([S(L, 0, z0), S(L, D, z0), S(L, D, H), S(L, 0, H)], { paint: "ink", weight: "hair" }),
		k.path(segmentsD([D / 3, (2 * D) / 3].map((y): Segment => [S(2, y, H), S(L - 2, y, H)])), { paint: "dim", weight: "hair" }),
	);
	// The wood's leader, off the top to its tag.
	const top = S(L * 0.72, D * 0.3, H);
	out.push(k.guide([top, [top[0], TAG[1] - 1.5], [TAG[0] - 3, TAG[1] - 1.5]]));
	return out;
}

/** Where the wood's tag sits; its leader rides the top up with each beat. */
const TAG: Point = [DESK.x + DESK.w - 58, 51];

// --- The sheet -----------------------------------------------------------------

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const out: string[] = [];
		const { x } = DESK;

		// The title over its rule, the sheet's name.
		out.push(k.text(x, 22.5, "MEGA_DESK", { role: "title" }), k.rule(x, x + 70, 27), k.text(x, 34, "LOFT // 2 SEATS", { role: "caption" }));

		// The floor: the footprint dashed, the span dimensioned along the front with end ticks, "8 FT" under it.
		const fy = D + 9;
		out.push(
			k.path(segmentsD(edges([S(0, 0, 0), S(L, 0, 0), S(L, D, 0), S(0, D, 0)])), { paint: "dim", weight: "hair", dash: "dash" }),
			k.path(segmentsD([[S(0, fy, 0), S(L, fy, 0)], ...[0, L].map((x0): Segment => [S(x0, fy - 3, 0), S(x0, fy + 3, 0)])]), { paint: "ink", weight: "hair" }),
		);
		const mid = S(L / 2, fy + 6, 0);
		out.push(k.text(mid[0] - 4, mid[1] + 4, "8 FT", { role: "caption", paint: "ink" }));

		// The wood: a leader off the top's far end to its name and where it came from.
		out.push(
			k.text(TAG[0], TAG[1], "BURNT ASH", { size: 3.5 }),
			k.text(TAG[0], TAG[1] + 5, "MACBEATH HARDWOOD", { role: "caption" }),
		);

		// Registration: a dim + in the gutter at each section's rule.
		out.push(...[64, 128].map((y) => k.plus(COL.x - 6, y, 4, { paint: "dim", weight: "hair" })));

		// --- the column -------------------------------------------------------
		const cx = COL.x;
		const cr = COL.x + COL.w;
		// SPAN: the big thin numeral.
		out.push(k.readout(cx, 48, { value: "96", size: 32, label: "span", caption: "in" }), k.text(cx, 56, "8 FT // ONE TOP", { role: "caption" }));

		// LOFT: the room in plan, 168 × 54, the desk along the 8-ft wall.
		out.push(k.section(cx, 64, COL.w, "Loft"));
		const [px, py, sc] = [cr - 168 * 0.2, 74, 0.2];
		out.push(
			k.rect(px, py, 168 * sc, 54 * sc, { paint: "ink", weight: "hair" }),
			k.rect(px + 36 * sc, py, 96 * sc, 24 * sc * 0.5, { paint: "none", fill: "ink" }),
			k.text(cx, py + 4.5, "168 × 54", { size: 3.5 }),
			k.text(cx, py + 9.5, "IN // PLAN", { role: "caption" }),
		);

		// LEGS: dual motor, the cable run and its extension.
		out.push(
			k.section(cx, 96, COL.w, "Legs"),
			k.text(cx, 111, "DUAL MOTOR", { size: 3.5 }),
			k.text(cx, 116, "EXT: ETSY // CUSTOM", { role: "caption" }),
			k.line(cr - 14, 109.5, cr - 4, 109.5, { paint: "red", weight: "line" }),
			k.dot(cr - 14, 109.5, 1, { paint: "red" }),
			k.dot(cr - 4, 109.5, 1, { paint: "red" }),
		);

		// MODE: the meter, a pip per height, and the state under it.
		out.push(k.section(cx, 128, COL.w, "Mode"));
		const pip = (i: number, lit: boolean) => k.rect(cx + i * 7, 140, 5, 2, { paint: "none", fill: lit ? "ink" : "dim" });
		for (let i = 0; i < HEIGHTS.length; i++) out.push(pip(i, false));
		out.push(k.text(cr, 151, "(ALWAYS)", { role: "caption", anchor: "end" }));

		// The rise: a beat per height — the desk and its state, current while it is; a pip of the meter lit per beat.
		const beats = HEIGHTS.map((H, i) => [
			k.group(
				[
					...desk(k, H),
					k.bracketLabel(cx, 151, STATES[i], { size: 3.5 }),
					...(i === HEIGHTS.length - 1 ? [k.dot(cx + 34, 149.8, 1.4, { paint: "green" })] : []),
				],
				{ mark: "now" },
			),
			pip(i, true),
		]);

		return [...out, k.steps(beats)];
	},
});
