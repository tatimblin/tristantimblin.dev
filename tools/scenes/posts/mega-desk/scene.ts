/**
 * The Mega Desk — the post's art, as a baked scene: THE GRAPHIC ALONE.
 * A teaser, not a sheet: one strong element filling the plate, in the ink
 * with one accent.
 *
 * THE DESK: the 8-ft top in iso line work, joystick quality — the slab's
 * three faces outlined, the glue-up's plank seams dim on its top, two
 * dual-motor legs (a foot, a telescoping column), and the leg cable slung
 * between them with its CORAL middle: the Etsy extension that made it
 * reach. The footprint is dashed on the floor and the span dimensioned
 * along the front, "8 FT"; the height is dimensioned up the far end.
 *
 * The motion is `steps`: the desk rises sitting to standing, a beat per
 * height. Each beat's now-mark is the desk at that height with its height
 * line. The still frame is the last beat: standing, always.
 *
 * HIDDEN LINES: the slab is line work, so what stands under it — legs,
 * feet, the cable — is drawn as segments cut outside the slab's
 * silhouette at that height (`convexHull` + `clipOutside`).
 *
 *   bun run scenes:bake      → src/content/txt/mega-desk.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { chain, clipOutside, convexHull, edges, iso, type Kit, type Point, type Segment, segmentsD, type ShapeOpts } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The desk, in world units: x along the 8 ft, y its depth, z up ----------

/** The drawing's scale on the plate, and where the far corner of the floor lands. */
const G = 1.4;
const O: Point = [120, 71];
const S = (x: number, y: number, z: number): Point => iso(x * G, y * G, z * G, O);

/** The top: L long, D deep, T thick. */
const [L, D, T] = [104, 26, 3];
/** The heights the desk passes through, sitting to standing: one beat each. */
const HEIGHTS = [26, 32, 38, 44];
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
	for (const [x, y] of c.joins) out.push(k.dot(x, y, 1.4, { paint: "red" }));

	// The slab: its three faces outlined, the top heavier, and the glue-up's seams.
	out.push(
		k.polygon([S(0, 0, H), S(L, 0, H), S(L, D, H), S(0, D, H)], { paint: "ink", weight: "line" }),
		k.polygon([S(0, D, z0), S(L, D, z0), S(L, D, H), S(0, D, H)], { paint: "ink", weight: "hair" }),
		k.polygon([S(L, 0, z0), S(L, D, z0), S(L, D, H), S(L, 0, H)], { paint: "ink", weight: "hair" }),
		k.path(segmentsD([D / 3, (2 * D) / 3].map((y): Segment => [S(2, y, H), S(L - 2, y, H)])), { paint: "dim", weight: "hair" }),
	);
	// The height, dimensioned up past the far end: a dim line floor to top, a tick at each end.
	const hx = L + 8;
	out.push(k.path(segmentsD([[S(hx, 0, 0), S(hx, 0, H)], ...[0, H].map((z): Segment => [S(hx - 2.5, 0, z), S(hx + 2.5, 0, z)])]), { paint: "dim", weight: "hair" }));
	return out;
}

// --- The plate -----------------------------------------------------------------

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const out: string[] = [];

		// The floor: the footprint dashed, the span dimensioned along the front with end ticks, "8 FT" under it.
		const fy = D + 9;
		out.push(
			k.path(segmentsD(edges([S(0, 0, 0), S(L, 0, 0), S(L, D, 0), S(0, D, 0)])), { paint: "dim", weight: "hair", dash: "dash" }),
			k.path(segmentsD([[S(0, fy, 0), S(L, fy, 0)], ...[0, L].map((x0): Segment => [S(x0, fy - 3, 0), S(x0, fy + 3, 0)])]), { paint: "ink", weight: "hair" }),
		);
		const mid = S(L / 2, fy + 5, 0);
		out.push(k.text(mid[0] - 6, mid[1] + 5, "8 FT", { size: 6, paint: "ink" }));

		// The rise: a beat per height — the desk there, current while it is.
		const beats = HEIGHTS.map((H) => [k.group(desk(k, H), { mark: "now" })]);

		return [...out, k.steps(beats)];
	},
});
