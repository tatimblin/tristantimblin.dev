/**
 * Hidden lines for a scene drawn as line work. A solid in front has no
 * plate colour to hide what stands behind it (the plate follows the
 * theme, and a scene may not paint it), so what it covers is CUT instead:
 * the lines behind are split into segments and the parts inside the
 * front solid's silhouette dropped. A slab's, a box's or a prism's
 * silhouette is convex — the convex hull of its projected corners — so
 * the cut is Cyrus–Beck against that polygon. A silhouette that is not
 * convex — a mountain range, a notched outline — is cut by
 * `clipOutsidePolygon`, which takes any simple polygon.
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

/** How near a point must be to an edge to count as on it: a hundredth, the kit's rounding. */
const ON = 0.01;

/** Whether `p` lies on the segment `a`–`b`, to a hundredth. */
function onEdge(p: Point, a: Point, b: Point): boolean {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
	return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) <= ON;
}

/**
 * Whether `p` is inside the simple polygon `poly` — any shape, convex or
 * not, either winding (a ray cast: an odd number of edges crossed). A
 * point on the outline, to a hundredth, counts as inside: the outline
 * is the solid's, and what lies along it is hidden with it.
 */
export function insidePolygon(p: Point, poly: readonly Point[]): boolean {
	if (poly.length < 3) return false;
	let odd = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [a, b] = [poly[j], poly[i]];
		if (onEdge(p, a, b)) return true;
		if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) odd = !odd;
	}
	return odd;
}

/** The parts of one segment outside the simple polygon `poly`, in order along it. */
function outsideAny(seg: Segment, poly: readonly Point[]): Segment[] {
	const [a, b] = seg;
	const d: Point = [b[0] - a[0], b[1] - a[1]];
	// Every place the segment crosses or touches an edge; parallel edges add none (the midpoints below decide them).
	const ts = [0, 1];
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [p, q] = [poly[j], poly[i]];
		const e: Point = [q[0] - p[0], q[1] - p[1]];
		const den = d[0] * e[1] - d[1] * e[0];
		if (Math.abs(den) < 1e-12) continue;
		const w: Point = [p[0] - a[0], p[1] - a[1]];
		const t = (w[0] * e[1] - w[1] * e[0]) / den;
		const u = (w[0] * d[1] - w[1] * d[0]) / den;
		if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
	}
	ts.sort((x, y) => x - y);
	const at = (t: number): Point => [a[0] + d[0] * t, a[1] + d[1] * t];
	// Keep each piece whose middle is outside, joining neighbours kept either side of a mere touch.
	const kept: Array<[number, number]> = [];
	for (let i = 0; i + 1 < ts.length; i++) {
		const [t0, t1] = [ts[i], ts[i + 1]];
		if (t1 - t0 < EPS || insidePolygon(at((t0 + t1) / 2), poly)) continue;
		const last = kept[kept.length - 1];
		if (last && last[1] === t0) last[1] = t1;
		else kept.push([t0, t1]);
	}
	return kept.map(([t0, t1]): Segment => (t0 === 0 && t1 === 1 ? seg : [t0 === 0 ? a : at(t0), t1 === 1 ? b : at(t1)]));
}

/**
 * What of `segs` shows outside the simple polygon `poly` — convex or not:
 * a mountain's ridge, a notched board, an L-shaped slab. Each segment is
 * cut everywhere it crosses the outline and the pieces inside dropped, so
 * one that dips behind a range and out again comes back in as many pieces
 * as it shows. What runs along the outline is hidden with the solid (as
 * `clipOutside` hides it). The polygon may run either way round; one of
 * fewer than three corners hides nothing. On a convex polygon it cuts as
 * `clipOutside` does — that one is the cheaper for a hull.
 */
export function clipOutsidePolygon(segs: readonly Segment[], poly: readonly Point[]): Segment[] {
	if (poly.length < 3) return [...segs];
	return segs.flatMap((s) => outsideAny(s, poly));
}

/** An open line through `points` as its segments: `points[i]` to `points[i + 1]` (`edges` closes it). */
export function chain(points: readonly Point[]): Segment[] {
	return points.slice(1).map((q, i) => [points[i], q] as const);
}

/** Segments as one path's `d`: a move and a line each, rounded as the kit rounds. Empty for none. */
export function segmentsD(segs: readonly Segment[]): string {
	return segs.map(([a, b]) => `M ${round(a[0])} ${round(a[1])} L ${round(b[0])} ${round(b[1])}`).join(" ");
}
