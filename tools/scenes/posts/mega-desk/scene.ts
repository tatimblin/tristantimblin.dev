/**
 * The Mega Desk — the post's art, as a baked scene: the DRAFTING SHEET.
 * The post builds an 8-ft desk for a loft, so the panel is the drawing of
 * it on dotted graph paper. The burnt-ash top in iso — three glued-up
 * boards (their seams coral), its front and end edges solid coral — on two
 * blue dual-motor legs, each a two-stage telescoping column on a foot bar;
 * the filing cabinet holding up the middle; the footprint dashed on the
 * floor and the 96-in span ticked beside it like a dimension line; the
 * motor cord a U from leg to leg, too short, broken in the middle with its
 * coral connector waiting at the gap. Top right, the loft in plan (168 ×
 * 54, the desk hatched along the 8-ft wall, two chairs as blue dots, the
 * door's swing, dimension ticks); bottom right, the leg controller (up and
 * down, three preset pips, the third lit, its cord off the crop) and a
 * height ladder.
 *
 * The motion is `steps`: the desk RISES from sitting to standing, a beat
 * per height. Each beat's now-mark holds the desk at that height — legs,
 * slab, the height dimension with its ticks and dashed witness line, and
 * the up-chevron lit while it travels — and a ladder bar lands per beat;
 * the still frame is the last beat, standing, the ladder full.
 *
 * HIDDEN LINES: the slab is line work on the plate, so nothing can paint
 * over what stands under it. Instead everything below it — the footprint,
 * the cabinet, the legs and their feet — is drawn as segments cut outside
 * the slab's silhouette at that height (`convexHull` + `clipOutside`), so
 * the top reads opaque.
 *
 *   bun run scenes:bake      → src/content/txt/mega-desk.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { clipOutside, convexHull, edges, iso, type Kit, type Point, round, type Segment, segmentsD, type ShapeOpts } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** A point as a path writes it. */
const xy = (p: Point): string => `${round(p[0])} ${round(p[1])}`;

// --- The desk, in world inches / 0.75: x along the 8 ft, y its depth, z up --

/** Where the far corner of the floor lands on the plate. */
const O: Point = [62, 64];
const S = (x: number, y: number, z: number): Point => iso(x, y, z, O);

/** The top: L long, D deep, T thick. */
const [L, D, T] = [128, 42, 4];
/** The heights the desk passes through, sitting to standing: one beat each. */
const HEIGHTS = [32, 40, 48, 56];
/** The ladder has a rung per beat and two more, the last beat lighting them all. */
const RUNGS = 6;

/** The filing cabinet under the middle: x, y, w, d, h. */
const CABINET = [54, 10, 18, 22, 26] as const;
/** The legs, by their x: 6 wide, standing near the back. */
const LEGS = [6, 116];
/** The legs' lower stage stops here; the upper stage, one inch in, runs to the slab. */
const STAGE = 22;

/** The three visible faces of a box — its +x end, its +y side and its top — as the segments of their outlines. */
const boxEdges = (x: number, y: number, w: number, d: number, z0: number, z1: number): Segment[] => [
	...edges([S(x + w, y, z0), S(x + w, y + d, z0), S(x + w, y + d, z1), S(x + w, y, z1)]),
	...edges([S(x, y + d, z0), S(x + w, y + d, z0), S(x + w, y + d, z1), S(x, y + d, z1)]),
	...edges([S(x, y, z1), S(x + w, y, z1), S(x + w, y + d, z1), S(x, y + d, z1)]),
];

/** The desk at height H: what stands under it cut outside the slab's silhouette, then the slab, then its height measured. */
function desk(k: Kit, H: number): string[] {
	const z0 = H - T;
	const silhouette = convexHull([0, L].flatMap((x) => [0, D].flatMap((y) => [z0, H].map((z) => S(x, y, z)))));
	const hidden = (segs: Segment[], o: ShapeOpts): string[] => {
		const d = segmentsD(clipOutside(segs, silhouette));
		return d ? [k.path(d, o)] : [];
	};
	const seg = (a: Point, b: Point): Segment => [a, b];

	// The footprint on the floor, dashed.
	const out = hidden(edges([S(0, 0, 0), S(L, 0, 0), S(L, D, 0), S(0, D, 0)]), { paint: "dim", weight: "hair", dash: "dash" });

	// The filing cabinet, and two drawer pulls.
	const [cx, cy, cw, cd, ch] = CABINET;
	const pulls = [10, 19].map((z) => seg(S(cx + 3, cy + cd, z), S(cx + cw - 3, cy + cd, z)));
	out.push(...hidden([...boxEdges(cx, cy, cw, cd, 0, ch), ...pulls], { paint: "ink", weight: "hair" }));

	// The legs: a foot bar across the depth, then two stages, the upper an inch in.
	for (const lx of LEGS) {
		const [a, b, c] = [lx, lx + 6, D - 8];
		out.push(...hidden(edges([S(a, -3, 0), S(b, -3, 0), S(b, D + 3, 0), S(a, D + 3, 0)]), { paint: "blue", weight: "hair" }));
		for (const [za, zb, inset] of [[0, STAGE, 0], [STAGE, z0, 1]] as const) {
			out.push(...hidden(boxEdges(a + inset, c + inset, b - a - 2 * inset, 6 - 2 * inset, za, zb), { paint: "blue", weight: "line" }));
		}
	}

	// The slab: the top outlined, the front and end edges solid coral, the glue seams of three boards.
	out.push(
		k.polygon([S(0, 0, H), S(L, 0, H), S(L, D, H), S(0, D, H)], { paint: "ink", weight: "line" }),
		k.polygon([S(0, D, z0), S(L, D, z0), S(L, D, H), S(0, D, H)], { paint: "none", fill: "red" }),
		k.polygon([S(L, 0, z0), S(L, D, z0), S(L, D, H), S(L, 0, H)], { paint: "none", fill: "red" }),
		k.path(segmentsD([14, 28].map((y) => seg(S(0, y, H), S(L, y, H)))), { paint: "red", weight: "hair" }),
	);

	// The height, measured off the right end: floor to top, end ticks, a small tick every 8, a dashed witness line from the corner.
	const [hb, ht] = [S(L + 12, D, 0), S(L + 12, D, H)];
	const small: Segment[] = [];
	for (let z = 8; z < H; z += 8) small.push(seg(S(L + 10.5, D, z), S(L + 13.5, D, z)));
	out.push(
		k.path(segmentsD([seg(hb, ht), ...[0, H].map((z) => seg(S(L + 8, D, z), S(L + 16, D, z)))]), { paint: "ink", weight: "hair" }),
		k.path(segmentsD(small), { paint: "dim", weight: "hair" }),
		k.path(segmentsD([seg(S(L, D, H), ht)]), { paint: "dim", weight: "hair", dash: "dash" }),
	);
	return out;
}

// --- The loft, in plan: 168 × 54 at 0.66, top right --------------------------

const [PX, PY, SC] = [196, 20, 0.66];
const plan = (x: number, y: number): Point => [PX + x * SC, PY + y * SC];

function loft(k: Kit): string[] {
	const [rx, ry] = plan(0, 0);
	const [rw, rh] = [168 * SC, 54 * SC];
	// The desk along the 8-ft wall, 96 × 24, hatched at 45°.
	const [dx, dy] = plan(36, 0);
	const [dw, dh] = [96 * SC, 24 * SC];
	const hatch: Segment[] = [];
	for (let x = dx + 3; x < dx + dw + dh; x += 4) {
		hatch.push([[Math.min(x, dx + dw), dy + Math.max(0, x - dx - dw)], [Math.max(dx, x - dh), dy + Math.min(dh, x - dx)]]);
	}
	const door = plan(150, 54);
	return [
		k.rect(rx, ry, rw, rh, { paint: "ink", weight: "line" }),
		k.rect(dx, dy, dw, dh, { paint: "red", weight: "hair" }),
		k.path(segmentsD(hatch), { paint: "red", weight: "hair" }),
		// The door's swing, and the two chairs.
		k.arc(door[0], door[1], 14 * SC * 1.6, 270, 360, { paint: "dim", weight: "hair" }),
		k.dot(...plan(66, 36), 2.2, { paint: "blue" }),
		k.dot(...plan(102, 36), 2.2, { paint: "blue" }),
		// The 168 along the top, the 54 down the side.
		k.ticksLinear(rx, ry - 5, rx + rw, ry - 5, 8, 2, { paint: "dim", weight: "hair" }),
		k.ticksLinear(rx + rw + 5, ry, rx + rw + 5, ry + rh, 4, 2, { paint: "dim", weight: "hair" }),
	];
}

// --- The sheet ----------------------------------------------------------------

/** The ladder's rung `i`, from the bottom. */
const RUNG = (i: number): [number, number, number, number] => [286, 156 - i * 9, 306, 156 - i * 9];
/** The controller's up-chevron. */
const UP: Point = [228, 119];

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		// Graph paper: a dot every 20, one path of round-capped zero-length strokes.
		const dots: string[] = [];
		for (let x = 10; x < 320; x += 20) for (let y = 10; y < 180; y += 20) dots.push(`M ${x} ${y} h 0`);

		// The span on the floor, 96 in end to end, ticked like a drawing's dimension line: end ticks, and eighths.
		const span: Segment[] = [[S(0, D + 14, 0), S(L, D + 14, 0)], ...[0, L].map((x): Segment => [S(x, D + 10, 0), S(x, D + 18, 0)])];
		const eighths: Segment[] = Array.from({ length: 7 }, (_, i): Segment => [S((L * (i + 1)) / 8, D + 12.5, 0), S((L * (i + 1)) / 8, D + 15.5, 0)]);

		// The motor cord: a U from leg to leg, too short — broken in the middle, its connector at the gap.
		const [a, a1, g0, g1, b1, b] = [S(9, D - 5, 16), S(9, D + 6, 2), S(52, D + 6, 0), S(66, D + 6, 0), S(119, D + 6, 2), S(119, D - 5, 16)];
		const cord = [
			k.path(`M ${xy(a)} C ${xy([a1[0], a1[1] + 6])} ${xy([a1[0] + 12, g0[1]])} ${xy(g0)}`, { paint: "ink", weight: "line" }),
			k.path(`M ${xy(g1)} C ${xy([b1[0] - 14, g1[1] + 2])} ${xy([b1[0], b1[1] + 8])} ${xy(b)}`, { paint: "ink", weight: "line" }),
			k.rect(g0[0] - 2, g0[1] - 3, 7, 5, { paint: "none", fill: "red" }),
			k.dot(g1[0], g1[1], 1.8, { paint: "ink" }),
		];

		// The leg controller: a keycap with up and down, three preset pips (the third lit), its cord off the crop.
		const controller = [
			k.roundRect(214, 110, 52, 26, 4, { paint: "ink", weight: "line" }),
			k.chevron(UP[0], UP[1], 0, 4, { paint: "dim" }),
			k.chevron(228, 128, 180, 4, { paint: "dim" }),
			...[242, 250, 258].map((x, i) => k.pip(x, 123, 1.8, { paint: i === 2 ? "blue" : "dim", weight: "hair" })),
			k.wire([[240, 136], [240, 190]], { paint: "dim", weight: "hair" }),
		];

		const still = [
			k.path(dots.join(" "), { paint: "dim", weight: "line" }),
			k.path(segmentsD(span), { paint: "ink", weight: "hair" }),
			k.path(segmentsD(eighths), { paint: "dim", weight: "hair" }),
			...loft(k),
			...cord,
			...controller,
			// The ladder, unlit: the beats light it.
			...Array.from({ length: RUNGS }, (_, i) => k.line(...RUNG(i), { paint: "dim", weight: "hair" })),
		];

		// The rise: a beat per height, the desk held there while its beat is current; a rung lit per beat, the last lighting the rest.
		const lit = (i: number) => k.line(...RUNG(i), { paint: "blue", weight: "line" });
		const last = HEIGHTS.length - 1;
		const beats = HEIGHTS.map((H, i) => [
			k.group([...desk(k, H), ...(i > 0 && i < last ? [k.chevron(UP[0], UP[1], 0, 4, { paint: "blue", weight: "line" })] : [])], { mark: "now" }),
			lit(i),
			...(i === last ? Array.from({ length: RUNGS - HEIGHTS.length }, (_, j) => lit(HEIGHTS.length + j)) : []),
		]);

		return [...still, k.steps(beats)];
	},
});
