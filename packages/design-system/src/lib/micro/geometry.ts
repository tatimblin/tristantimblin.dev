/**
 * The kit's arithmetic: numbers as a file writes them, and the polar
 * helpers every arc, tick and dial is placed with. Angles everywhere in the
 * kit are degrees on a dial — 0 is up, 90 is right, clockwise — so a needle
 * at 45 points to the top-right.
 */

/** A point on the drawing: `[x, y]`. */
export type Point = readonly [number, number];

/** A number as a file writes it: at most two decimals, no trailing zeros, no `-0`. */
export function round(v: number): number {
	const r = Math.round(v * 100) / 100;
	return r === 0 ? 0 : r;
}

/**
 * Snap to the half-unit grid, so a hairline drawn at 1× lands between two
 * device pixels and stays crisp. Available, not forced: a primitive rounds
 * to two decimals and leaves the snap to a recipe that wants it.
 */
export function snap(v: number): number {
	return Math.round(v * 2) / 2;
}

const RAD = Math.PI / 180;

/** The point `r` from `(cx, cy)` at `deg` on the dial (0 up, clockwise). */
export function polar(cx: number, cy: number, r: number, deg: number): Point {
	const t = deg * RAD;
	return [round(cx + r * Math.sin(t)), round(cy - r * Math.cos(t))];
}

/**
 * The angles of `n` marks from `a0` to `a1`, both included — a dial's
 * ticks. Over a full turn (a span that is a multiple of 360) the end is the
 * start, so the marks are spread without doubling it.
 */
export function spread(a0: number, a1: number, n: number): number[] {
	if (n <= 0) return [];
	if (n === 1) return [a0];
	const span = a1 - a0;
	const step = span % 360 === 0 && span !== 0 ? span / n : span / (n - 1);
	return Array.from({ length: n }, (_, i) => a0 + step * i);
}

/** `n` points evenly along the arc of radius `r` from `a0` to `a1` (see `spread`). */
export function onArc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Point[] {
	return spread(a0, a1, n).map((a) => polar(cx, cy, r, a));
}

/** `x,y x,y …`: points as a `points` attribute. */
export function pointsAttr(points: readonly Point[]): string {
	return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

/** `x y`: a point inside a path's `d`. */
export function xy([x, y]: Point): string {
	return `${round(x)} ${round(y)}`;
}

/** Whether `p` and `q` are the same point to a hundredth. */
export function same(p: Point, q: Point): boolean {
	return round(p[0]) === round(q[0]) && round(p[1]) === round(q[1]);
}
