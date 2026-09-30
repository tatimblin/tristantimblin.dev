/**
 * Hidden lines for a scene drawn as line work. A solid in front has no
 * plate colour to hide what stands behind it (the plate follows the
 * theme, and a scene may not paint it), so what it covers is CUT instead:
 * the lines behind are split into segments and the parts inside the
 * front solid's silhouette dropped. A slab's, a box's or a prism's
 * silhouette is convex — the convex hull of its projected corners — so
 * the cut is Cyrus–Beck against that polygon.
 *
 *   const top = convexHull(corners.map(([x, y, z]) => iso(x, y, z, at)));
 *   k.path(segmentsD(clipOutside(edges(footprint), top)), { dash: "dash" });
 *
 * Pure geometry on screen points; `segmentsD` is the one place a number
 * is written, rounded as the kit rounds.
 */

import { type Point, round } from "./geometry";

/** A straight piece of line on the screen: from, to. */
export type Segment = readonly [Point, Point];

/** The z of `(a − o) × (b − o)`: positive when o → a → b turns one way, negative the other, 0 on a line. */
const turn = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * The convex hull of `points` (Andrew's monotone chain): its corners in
 * order round the outline, no point repeated, collinear points dropped.
 * Fewer than three distinct points come back as they are, deduplicated.
 */
export function convexHull(points: readonly Point[]): Point[] {
	const q = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((p, i, s) => i === 0 || p[0] !== s[i - 1][0] || p[1] !== s[i - 1][1]);
	if (q.length < 3) return q;
	const chain = (pts: readonly Point[]): Point[] => {
		const out: Point[] = [];
		for (const p of pts) {
			while (out.length > 1 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
			out.push(p);
		}
		return out;
	};
	const lo = chain(q);
	const hi = chain([...q].reverse());
	return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/** A closed outline as its edges: `points[i]` to `points[i + 1]`, and the last back to the first. */
export function edges(points: readonly Point[]): Segment[] {
	return points.map((p, i) => [p, points[(i + 1) % points.length]] as const);
}

/** A piece shorter than this share of its segment is dropped: a hair at a corner is noise. */
const EPS = 0.001;

/** The parts of one segment outside the convex polygon `poly`: none, one or two. */
function outside(seg: Segment, poly: readonly Point[], sign: number): Segment[] {
	const [a, b] = seg;
	const d: Point = [b[0] - a[0], b[1] - a[1]];
	let t0 = 0;
	let t1 = 1;
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i];
		const q = poly[(i + 1) % poly.length];
		// The edge's outward normal, whichever way round the polygon runs.
		const n: Point = [sign * (q[1] - p[1]), sign * (p[0] - q[0])];
		const num = n[0] * (a[0] - p[0]) + n[1] * (a[1] - p[1]);
		const den = n[0] * d[0] + n[1] * d[1];
		if (den === 0) {
			// Parallel to this edge: wholly outside its half-plane, or no cut from it.
			if (num > 0) return [seg];
			continue;
		}
		const t = -num / den;
		if (den < 0) t0 = Math.max(t0, t);
		else t1 = Math.min(t1, t);
		if (t0 >= t1) return [seg];
	}
	const at = (t: number): Point => [a[0] + d[0] * t, a[1] + d[1] * t];
	const out: Segment[] = [];
	if (t0 > EPS) out.push([a, at(t0)]);
	if (t1 < 1 - EPS) out.push([at(t1), b]);
	return out;
}

/**
 * What of `segs` shows outside the convex polygon `poly` (a silhouette,
 * from `convexHull`): each segment cut where it crosses the outline and
 * the part inside dropped — a segment wholly inside is gone, one wholly
 * outside comes back as it was, one passing through comes back in two.
 * The polygon may run either way round. A polygon of fewer than three
 * corners hides nothing.
 */
export function clipOutside(segs: readonly Segment[], poly: readonly Point[]): Segment[] {
	if (poly.length < 3) return [...segs];
	// The signed area says which way round it runs, so the normals point out.
	let area = 0;
	for (let i = 0; i < poly.length; i++) area += turn([0, 0], poly[i], poly[(i + 1) % poly.length]);
	const sign = area > 0 ? 1 : -1;
	return segs.flatMap((s) => outside(s, poly, sign));
}

/** Segments as one path's `d`: a move and a line each, rounded as the kit rounds. Empty for none. */
export function segmentsD(segs: readonly Segment[]): string {
	return segs.map(([a, b]) => `M ${round(a[0])} ${round(a[1])} L ${round(b[0])} ${round(b[1])}`).join(" ");
}
