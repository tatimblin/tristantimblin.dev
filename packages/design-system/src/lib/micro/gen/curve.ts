/**
 * `curve` — an automation curve (family B): a line through the points
 * given, with a node dot at each, as the reference's "dotted line with
 * green nodes" — a dim dotted guide with green dots unless said.
 *
 *   curve()                                        the reference's five points
 *   curve([[6, 24], [16, 9], [25, 22], [34, 7], [42, 17]])
 *   curve(pts, { smooth: true })                   a Catmull-Rom curve through them
 *   curve(pts, { dotted: false, paint: "blue", accent: "none" })   a solid blue polyline, no nodes
 *
 * Points are in viewBox units (48×32), each held to the safe area (4–44,
 * 4–28); two to twelve of them (fewer falls back to the reference, more
 * are cut). `dotted` (true unless said) draws the line as a hair-weight
 * dotted guide, and its default paint is then `dim`; a solid line's
 * default is the ink. `accent` paints the nodes, green unless said;
 * `nodes: false` or `accent: "none"` leaves them out.
 */

import { type Point, round } from "../geometry";
import { ACCENT_PAINTS, type AccentPaint, type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, drawing, lineD, paintOf, smoothD } from "./base";

export interface CurveOpts {
	/** a node dot at each point; true unless said */
	nodes?: boolean;
	/** a Catmull-Rom curve through the points rather than a polyline */
	smooth?: boolean;
	/** the line as a hair-weight dotted guide; true unless said */
	dotted?: boolean;
	/** the line: `dim` when dotted, `ink` when solid, unless said */
	paint?: GenPaint;
	/** the nodes; green unless said */
	accent?: AccentPaint;
}

export const CURVE_DEFAULT_POINTS: readonly Point[] = Object.freeze([[6, 24], [16, 9], [25, 22], [34, 7], [42, 17]]);
export const CURVE_MAX_POINTS = 12;
const NODE_R = 2;

export function curve(points: readonly Point[] = CURVE_DEFAULT_POINTS, o: CurveOpts = {}): Drawing {
	const { nodes = true, smooth = false, dotted = true } = o;
	const paint = paintOf(o.paint, GEN_PAINTS, dotted ? "dim" : "ink");
	const accent = paintOf(o.accent, ACCENT_PAINTS, "green");
	const given = Array.isArray(points) ? points.filter((p) => Array.isArray(p) && p.length === 2) : [];
	const pts: Point[] = (given.length >= 2 ? given : CURVE_DEFAULT_POINTS)
		.slice(0, CURVE_MAX_POINTS)
		.map(([x, y]) => [round(clamp(x, SAFE.x0, SAFE.x1, SAFE.cx)), round(clamp(y, SAFE.y0, SAFE.y1, SAFE.cy))]);
	const d = smooth ? smoothD(pts) : lineD(pts);
	const children = [K.path(d, dotted ? { paint, weight: "hair", dash: "dotted" } : { paint })];
	if (nodes && accent !== "none") for (const [x, y] of pts) children.push(K.dot(x, y, NODE_R, { paint: accent }));
	return drawing(children);
}
