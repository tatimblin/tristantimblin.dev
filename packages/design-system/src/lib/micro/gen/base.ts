/**
 * The generator base — what every L2 generator (a parametric mark:
 * params → a drawing) is built from, and the contract its component host
 * (components/GlyphSvg.astro) renders. A generator is a pure function
 *
 *   (params) => Drawing            // { viewBox, children }
 *
 * that draws with `kit("glyph")` and clamps every parameter into a range
 * it documents, so its output passes the glyph profile for ANY input —
 * the same params always give the same string (a seed, never Math.random),
 * and the whole is inside the glyph budget (≤ 40 elements, ≤ 3 KB on a
 * 48×32): one `path` with many points rather than many elements, points
 * rounded to two decimals, sub-pixel points dropped (`simplify`).
 *
 * To add one: a file beside this one exporting `name(…): Drawing` (its
 * params typed and their ranges in the doc comment), re-exported from
 * ./index.ts and lib/micro's index; a `<Name>` component in
 * src/components that maps its props to the function and hands the result
 * to `<GlyphSvg>`; a sweep of its params in gen.test.ts.
 */

import { kit, type Kit } from "../kit";
import { type Point, round, xy } from "../geometry";
import type { Paint } from "../paint";

/** What a generator returns and the host inlines: the viewBox and the kit's element strings. */
export interface Drawing {
	viewBox: string;
	children: readonly string[];
}

/** The paint a generator's main line takes — a colour, the text's ink, or its dimming (never `none`). */
export type GenPaint = Exclude<Paint, "none">;

/** An accent's paint: a second colour, or none. */
export type AccentPaint = GenPaint | "none";

/** The glyph kit every generator draws with. */
export const K: Kit = kit("glyph");

/** The default viewBox (the profile's 48×32) and the drawing's safe area inside it. */
export const VIEWBOX = "0 0 48 32";
export const SAFE = Object.freeze({ x0: 4, x1: 44, y0: 4, y1: 28, cx: 24, cy: 16 });

/** A drawing on the default viewBox. */
export const drawing = (children: readonly string[], viewBox = VIEWBOX): Drawing => ({ viewBox, children });

/** A drawing as a whole file (what the host inlines and the tests validate). */
export const toSvg = (d: Drawing): string => K.svg({ viewBox: d.viewBox, children: d.children });

/** `v` held to `[lo, hi]`; a non-number (or NaN) becomes `fallback`. */
export function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
	const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
	return Math.min(hi, Math.max(lo, n));
}

/** `clamp`, then to the nearest integer. */
export const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => Math.round(clamp(v, lo, hi, fallback));

/** A paint name from a prop, or `fallback` when it is not one the generators take. */
export function paintOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
	return (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback;
}

export const GEN_PAINTS: readonly GenPaint[] = Object.freeze(["ink", "dim", "blue", "red", "green", "lavender"]);
export const ACCENT_PAINTS: readonly AccentPaint[] = Object.freeze([...GEN_PAINTS, "none"]);

/**
 * A deterministic random source from an integer seed (mulberry32, as the
 * reference sheet's): each call is the next number in [0, 1).
 */
export function rng(seed: number): () => number {
	let s = Math.trunc(clamp(seed, -2147483648, 2147483647, 0)) | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The `d` of a polyline through `points`: `M x y L x y …`, every number rounded. */
export function lineD(points: readonly Point[]): string {
	return points.map((p, i) => `${i ? "L" : "M"} ${xy(p)}`).join(" ");
}

/**
 * The `d` of a smooth curve through `points` (Catmull-Rom, as cubics), the
 * ends' tangents taken from their one neighbour. `closed` runs it on from
 * the last point back to the first and shuts it (`Z`), every point's
 * tangent from both its neighbours round the loop — a lake's shore, a
 * forest's edge — so the join has no corner.
 */
export function smoothD(points: readonly Point[], closed = false): string {
	const n = points.length;
	if (n < 3) return closed && n ? `${lineD(points)} Z` : lineD(points);
	const at = (i: number): Point => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
	let d = `M ${xy(points[0])}`;
	for (let i = 0; i < (closed ? n : n - 1); i++) {
		const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
		const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C ${xy(c1)} ${xy(c2)} ${xy(p2)}`;
	}
	return closed ? `${d} Z` : d;
}

/**
 * Fewer points, the same line: Ramer–Douglas–Peucker, dropping every
 * point within `tolerance` viewBox units of the chord its neighbours
 * make (0.05 by default — a twentieth of a unit, under a device pixel at
 * any size a glyph is drawn).
 */
export function simplify(points: readonly Point[], tolerance = 0.05): Point[] {
	if (points.length < 3) return [...points];
	const keep = new Array<boolean>(points.length).fill(false);
	keep[0] = keep[points.length - 1] = true;
	const stack: Array<[number, number]> = [[0, points.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop()!;
		let far = -1;
		let dmax = tolerance;
		for (let i = a + 1; i < b; i++) {
			const d = segmentDistance(points[i], points[a], points[b]);
			if (d > dmax) [far, dmax] = [i, d];
		}
		if (far >= 0) {
			keep[far] = true;
			stack.push([a, far], [far, b]);
		}
	}
	return points.filter((_, i) => keep[i]);
}

/** The distance from `p` to the segment `a`–`b`. */
function segmentDistance(p: Point, a: Point, b: Point): number {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
	return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** A point rounded to what the file writes. */
export const rp = ([x, y]: Point): Point => [round(x), round(y)];
