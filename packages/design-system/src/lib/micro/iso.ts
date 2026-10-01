/**
 * Isometric and one-point perspective, in the art language's terms: a true
 * 30° projection whose right axis is (0.866, 0.5), left axis (−0.866, 0.5)
 * and up (0, −1). The solids draw their three visible faces only — the
 * standard view from the front and above — never a wireframe.
 *
 * The builders take the kit first (their paint is its), then position,
 * size and options, and are also methods on the kit.
 *
 * Two conventions meet here, and which one a curve follows is said at each
 * builder. A DISC (a cylinder's cap, `isoEllipse`, a coil's loops) keeps
 * the language's rule, ry = rx / 2, with rx the world radius. A ROUNDED
 * CORNER (`isoRoundRect`, `isoRoundBox`) is the true projection of its
 * corner circle — rx = c·√(3/2), ry = c/√2 — because its arc has to meet
 * the box's 30° edges tangent, and a 2:1 arc through the same points
 * kinks at both ends; the two differ by a few percent, which is below a
 * glyph's resolution.
 */

import { type Point, round, xy } from "./geometry";
import type { Kit, ShapeOpts, StrokeOpts } from "./kit";
import type { Paint, Weight } from "./paint";

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** The right axis: one unit of world x on the screen. */
export const ISO_X: Point = [round(COS30), SIN30];
/** The left axis: one unit of world y on the screen. */
export const ISO_Y: Point = [round(-COS30), SIN30];
/** Up: one unit of world z on the screen. */
export const ISO_Z: Point = [0, -1];

/** A world axis: `x` runs down-right, `y` down-left, `z` up. */
export type Axis = "x" | "y" | "z";

/**
 * Project a world point. `x` runs down-right, `y` down-left, `z` up, so
 * `(x, y, 0)` is the ground and the origin's screen position is `at`.
 */
export function iso(x: number, y: number, z: number, at: Point = [0, 0]): Point {
	return [round(at[0] + COS30 * (x - y)), round(at[1] + SIN30 * (x + y) - z)];
}

// --- the arithmetic the builders share ---------------------------------------

const add = (p: Point, q: Point, s = 1): Point => [p[0] + q[0] * s, p[1] + q[1] * s];
const cross = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];

/** The exact screen axis of a world axis (`ISO_X` and `ISO_Y` are rounded for reading). */
const AXES: Record<Axis, Point> = { x: [COS30, SIN30], y: [-COS30, SIN30], z: [0, -1] };

/**
 * A 2:1 disc whose normal is `axis`: its major (unit) direction `u`, at
 * right angles on the screen to the axis's projection, and that
 * direction's angle for an arc's x-axis-rotation. A ground disc lies flat.
 */
const DISC: Record<Axis, { u: Point; rot: number }> = {
	z: { u: [1, 0], rot: 0 },
	x: { u: [-SIN30, COS30], rot: 120 },
	y: { u: [SIN30, COS30], rot: 60 },
};

/**
 * The sweep flag of the arc from `from` to `to` that passes `through`:
 * 1 when that way round is clockwise on the screen (SVG's positive angle,
 * y down), so an arc is chosen by naming a point on it, never by hand.
 */
const sweepVia = (from: Point, to: Point, through: Point): 0 | 1 =>
	cross(add(through, from, -1), add(to, through, -1)) > 0 ? 1 : 0;

const arcTo = (rx: number, ry: number, rot: number, large: 0 | 1, sweep: 0 | 1, to: Point): string =>
	`A ${round(rx)} ${round(ry)} ${rot} ${large} ${sweep} ${xy(to)}`;

/** The `rx ry` of the true projection of a circle of radius `c` in a coordinate plane. */
const TRUE_RX = Math.sqrt(1.5);
const TRUE_RY = Math.SQRT1_2;

/** A quarter or half arc of the corner circle of radius `c` centred at `centre` (screen), from `from` to `to`, bulging away from the centre. */
const cornerArc = (centre: Point, c: number, from: Point, to: Point): string => {
	// The arc's midpoint is opposite the centre from the chord's midpoint.
	const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
	const through = add(centre, add(mid, centre, -1), 2);
	return arcTo(c * TRUE_RX, c * TRUE_RY, 0, 0, sweepVia(from, to, through), to);
};

// --- solids -------------------------------------------------------------------

/** The paints of a solid's visible faces: the top `ink` unless said, the sides `none` (the plate) — and the outline's paint and weight. */
export interface IsoBoxOpts extends StrokeOpts {
	top?: Paint;
	/** the face on the right, the box's +x end */
	right?: Paint;
	/** the face on the left, the box's +y end */
	left?: Paint;
}

/**
 * A box `w` along x, `d` along y and `h` tall, placed by its nearest
 * bottom corner at `(x, y)` — the lowest point, where the two side faces
 * meet. Three polygons: the top and the two sides, outlined in `paint`.
 */
export function isoBox(k: Kit, x: number, y: number, w: number, d: number, h: number, o: IsoBoxOpts = {}): string {
	const { top = "ink", right = "none", left = "none", ...stroke } = o;
	const at: Point = [x, y];
	// World coordinates from the far bottom corner; the near corner is (w, d, 0), which lands on `at`.
	const p = (wx: number, wy: number, wz: number) => iso(wx - w, wy - d, wz, at);
	const face = (pts: Point[], fill: Paint) => k.polygon(pts, { ...stroke, fill });
	return [
		face([p(w, d, h), p(w, 0, h), p(0, 0, h), p(0, d, h)], top),
		face([p(w, d, 0), p(w, 0, 0), p(w, 0, h), p(w, d, h)], right),
		face([p(w, d, 0), p(0, d, 0), p(0, d, h), p(w, d, h)], left),
	].join("\n");
}

export interface IsoCylinderOpts extends StrokeOpts {
	/** the top disc's fill, `ink` unless said */
	top?: Paint;
	/** the body's fill, `none` unless said */
	side?: Paint;
	/** the axis it lies along; upright (`z`) unless said */
	axis?: Axis;
}

/**
 * A cylinder of radius `r` and length `h` along `axis` — upright unless
 * said — placed by the centre of its base at `(x, y)`, the base being its
 * −axis end, so it rises from there (`z`) or runs toward the viewer,
 * down-right (`x`) or down-left (`y`). Its discs are `r` by `r/2`, the
 * minor axis along the axis's projection. Two elements: the body (the two
 * silhouette lines, the front of the base and the front of the top disc)
 * and the top disc, the +axis end, which faces the viewer on every axis.
 */
export function isoCylinder(k: Kit, x: number, y: number, r: number, h: number, o: IsoCylinderOpts = {}): string {
	const { top = "ink", side = "none", axis = "z", ...stroke } = o;
	const ry = r / 2;
	const n = AXES[axis];
	const { u, rot } = DISC[axis];
	const base: Point = [x, y];
	const cap = add(base, n, h);
	// The front of a disc is the half away from the +axis end, toward −n.
	const front = (c: Point): Point => add(c, n, -ry);
	const [b0, b1] = [add(base, u, -r), add(base, u, r)];
	const [t0, t1] = [add(cap, u, -r), add(cap, u, r)];
	const body =
		`M ${xy(t0)} L ${xy(b0)} ${arcTo(r, ry, rot, 0, sweepVia(b0, b1, front(base)), b1)} L ${xy(t1)} ${arcTo(r, ry, rot, 0, sweepVia(t1, t0, front(cap)), t0)} Z`;
	return [k.path(body, { ...stroke, fill: side }), isoEllipse(k, cap[0], cap[1], r, { ...stroke, fill: top, axis })].join("\n");
}

export interface IsoEllipseOpts extends ShapeOpts {
	/** the disc's normal; it lies on the ground (`z`) unless said */
	axis?: Axis;
}

/**
 * A disc of world radius `r` centred at `(x, y)` on the screen, on the
 * plane whose normal is `axis`: the language's 2:1 ellipse, `r` by `r/2`,
 * flat on the ground (an `<ellipse>`), or standing on the x or y face as a
 * path of two half arcs, its minor axis along the axis's projection.
 */
export function isoEllipse(k: Kit, x: number, y: number, r: number, o: IsoEllipseOpts = {}): string {
	const { axis = "z", ...shape } = o;
	const ry = r / 2;
	if (axis === "z") {
		return `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(r)}" ry="${round(ry)}" ${k.attrs(shape, shape.fill)} />`;
	}
	const { u, rot } = DISC[axis];
	const [p0, p1] = [add([x, y], u, r), add([x, y], u, -r)];
	return k.path(`M ${xy(p0)} ${arcTo(r, ry, rot, 1, 0, p1)} ${arcTo(r, ry, rot, 1, 0, p0)} Z`, shape);
}

/**
 * The corners of a `w`×`d` rounded rectangle of corner radius `c` at
 * height `z` above `at`, as its outline goes round — near, right, far,
 * left — each with its centre and its two tangent points: the one the
 * outline arrives at and the one it leaves from.
 */
function roundCorners(x: number, y: number, w: number, d: number, c: number, z: number) {
	const at: Point = [x, y];
	const p = (wx: number, wy: number) => iso(wx - w, wy - d, z, at);
	// Clamped so a pill (c = d/2) is the largest corner: the straight edges vanish and the arcs meet.
	const r = Math.min(c, w / 2, d / 2);
	return {
		near: { centre: p(w - r, d - r), from: p(w - r, d), to: p(w, d - r) },
		right: { centre: p(w - r, r), from: p(w, r), to: p(w - r, 0) },
		far: { centre: p(r, r), from: p(r, 0), to: p(0, r) },
		left: { centre: p(r, d - r), from: p(0, d - r), to: p(r, d) },
		r,
	};
}

/** The `d` of a rounded rectangle's outline from its corners. */
function roundRectD(x: number, y: number, w: number, d: number, c: number, z: number): string {
	const { near, right, far, left, r } = roundCorners(x, y, w, d, c, z);
	const arc = (k: { centre: Point; from: Point; to: Point }) => cornerArc(k.centre, r, k.from, k.to);
	return `M ${xy(near.to)} L ${xy(right.from)} ${arc(right)} L ${xy(far.from)} ${arc(far)} L ${xy(left.from)} ${arc(left)} L ${xy(near.from)} ${arc(near)} Z`;
}

/**
 * A rounded rectangle `w` along x and `d` along y with corners of radius
 * `c`, flat on the ground, placed by its nearest corner at `(x, y)` (the
 * corner the sharp rectangle would have): one path. `c` is held to half
 * the shorter side, so a rectangle with `c = d/2` is a pill.
 */
export function isoRoundRect(k: Kit, x: number, y: number, w: number, d: number, c: number, o: ShapeOpts = {}): string {
	return k.path(roundRectD(x, y, w, d, c, 0), o);
}

export interface IsoRoundBoxOpts extends StrokeOpts {
	/** the top's fill, `ink` unless said */
	top?: Paint;
	/** the body's fill, `none` unless said — the two sides meet in a rounded edge, so they are one face */
	side?: Paint;
}

/**
 * A box `w` along x, `d` along y and `h` tall whose vertical edges are
 * rounded to radius `c` — a handset shell, a board — placed by its nearest
 * bottom corner at `(x, y)` as `isoBox` is. Two elements: the top (a
 * rounded rectangle at `h`) and the body — its silhouette lines at the
 * outline's leftmost and rightmost points, the near half of the bottom
 * outline, the near half of the top's — with no crease where the two
 * sides meet, since that edge is round.
 */
export function isoRoundBox(k: Kit, x: number, y: number, w: number, d: number, h: number, c: number, o: IsoRoundBoxOpts = {}): string {
	const { top = "ink", side = "none", ...stroke } = o;
	const T = roundCorners(x, y, w, d, c, h);
	const B = roundCorners(x, y, w, d, c, 0);
	const r = T.r;
	// The silhouette verticals stand at the leftmost and rightmost points of the outline: the midpoints of the left and right corner arcs.
	const ext = r * TRUE_RX;
	const [lT, lB]: Point[] = [add(T.left.centre, [-ext, 0]), add(B.left.centre, [-ext, 0])];
	const [rT, rB]: Point[] = [add(T.right.centre, [ext, 0]), add(B.right.centre, [ext, 0])];
	const arc = (centre: Point, from: Point, to: Point) => cornerArc(centre, r, from, to);
	const body = [
		`M ${xy(lT)} L ${xy(lB)}`,
		arc(B.left.centre, lB, B.left.to),
		`L ${xy(B.near.from)}`,
		arc(B.near.centre, B.near.from, B.near.to),
		`L ${xy(B.right.from)}`,
		arc(B.right.centre, B.right.from, rB),
		`L ${xy(rT)}`,
		arc(T.right.centre, rT, T.right.from),
		`L ${xy(T.near.to)}`,
		arc(T.near.centre, T.near.to, T.near.from),
		`L ${xy(T.left.to)}`,
		arc(T.left.centre, T.left.to, lT),
		"Z",
	].join(" ");
	return [k.path(body, { ...stroke, fill: side }), k.path(roundRectD(x, y, w, d, c, h), { ...stroke, fill: top })].join("\n");
}

export interface IsoPlaneOpts extends ShapeOpts {
	/** grid divisions: one count for both axes, or `[along x, along y]`; none unless said */
	grid?: number | readonly [number, number];
	/** the grid lines' paint and weight: dim and hair unless said */
	gridPaint?: Paint;
	gridWeight?: Weight;
}

/**
 * A ground plane `w` along x and `d` along y, placed by its nearest corner
 * at `(x, y)`: a rhombus, and a path of grid lines when `grid` says how many.
 */
export function isoPlane(k: Kit, x: number, y: number, w: number, d: number, o: IsoPlaneOpts = {}): string {
	const { grid, gridPaint = "dim", gridWeight = "hair", ...shape } = o;
	const at: Point = [x, y];
	const p = (wx: number, wy: number) => iso(wx - w, wy - d, 0, at);
	const out = [k.polygon([p(w, d), p(w, 0), p(0, 0), p(0, d)], shape)];
	if (grid) {
		const [nx, ny] = typeof grid === "number" ? [grid, grid] : grid;
		const lines: string[] = [];
		for (let i = 1; i < nx; i++) lines.push(`M ${xy(p((w * i) / nx, 0))} L ${xy(p((w * i) / nx, d))}`);
		for (let j = 1; j < ny; j++) lines.push(`M ${xy(p(0, (d * j) / ny))} L ${xy(p(w, (d * j) / ny))}`);
		if (lines.length) out.push(k.path(lines.join(" "), { paint: gridPaint, weight: gridWeight, cap: "butt" }));
	}
	return out.join("\n");
}

/**
 * A spring standing on the ground: `turns` loops of world radius `r`
 * rising `h` from the centre of its base at `(x, y)`, each loop the
 * language's 2:1 ellipse. One path of cubic curves, four a turn, starting
 * at the front of the base and ending at the top; a wire, so every loop
 * shows whole.
 */
export function isoCoil(k: Kit, x: number, y: number, r: number, h: number, turns: number, o: StrokeOpts = {}): string {
	const segs = Math.max(1, Math.round(turns * 4));
	const T = turns * 2 * Math.PI;
	const rise = h / T;
	const ry = r / 2;
	const at = (t: number): Point => [x + r * Math.sin(t), y - rise * t + ry * Math.cos(t)];
	const vel = (t: number): Point => [r * Math.cos(t), -rise - ry * Math.sin(t)];
	let d = `M ${xy(at(0))}`;
	for (let i = 0; i < segs; i++) {
		const [t0, t1] = [(T * i) / segs, (T * (i + 1)) / segs];
		const s = (t1 - t0) / 3;
		const [p0, p3, v0, v1] = [at(t0), at(t1), vel(t0), vel(t1)];
		d += ` C ${xy([p0[0] + v0[0] * s, p0[1] + v0[1] * s])} ${xy([p3[0] - v1[0] * s, p3[1] - v1[1] * s])} ${xy(p3)}`;
	}
	return k.path(d, o);
}

export type VanishingGridOpts = StrokeOpts;

/**
 * The HUD road: a one-point perspective grid under the vanishing point
 * `(vx, vy)` on the horizon, `height` deep and `width` wide at its near
 * edge. `cols` lines fan from the point to the near edge; `rows` cross
 * lines sit at true perspective depths (1, 1/2, 1/3 … of the height), the
 * first on the near edge. One path, dim and hair unless said.
 */
export function vanishingGrid(k: Kit, vx: number, vy: number, width: number, height: number, rows: number, cols: number, o: VanishingGridOpts = {}): string {
	const near = vy + height;
	const half = width / 2;
	const d: string[] = [];
	for (let j = 0; j < cols; j++) {
		const t = cols === 1 ? 0.5 : j / (cols - 1);
		d.push(`M ${xy([vx, vy])} L ${xy([vx - half + width * t, near])}`);
	}
	for (let i = 0; i < rows; i++) {
		const p = 1 / (1 + i);
		const yi = vy + height * p;
		d.push(`M ${xy([vx - half * p, yi])} L ${xy([vx + half * p, yi])}`);
	}
	return k.path(d.join(" "), { paint: "dim", weight: "hair", cap: "butt", ...o });
}
