/**
 * Isometric and one-point perspective, in the post-art language's terms
 * (.claude/skills/post-art/references/language.md, "Geometry"): a true
 * 30° projection whose right axis is (0.866, 0.5), left axis (−0.866, 0.5)
 * and up (0, −1). The solids draw their three visible faces only — the
 * standard view from the front and above — never a wireframe.
 *
 * The builders take the kit first (their paint is its), then position,
 * size and options, and are also methods on the kit.
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

/**
 * Project a world point. `x` runs down-right, `y` down-left, `z` up, so
 * `(x, y, 0)` is the ground and the origin's screen position is `at`.
 */
export function iso(x: number, y: number, z: number, at: Point = [0, 0]): Point {
	return [round(at[0] + COS30 * (x - y)), round(at[1] + SIN30 * (x + y) - z)];
}

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
}

/**
 * An upright cylinder of radius `r` and height `h`, placed by the centre
 * of its base at `(x, y)`. Its ellipses are `r` by `r/2`. Two elements: the
 * body (the two sides and the front half of the base, closed over the top
 * disc's front) and the top disc.
 */
export function isoCylinder(k: Kit, x: number, y: number, r: number, h: number, o: IsoCylinderOpts = {}): string {
	const { top = "ink", side = "none", ...stroke } = o;
	const ry = r / 2;
	const [l, rt, t] = [round(x - r), round(x + r), round(y - h)];
	const body =
		`M ${l} ${t} V ${round(y)} A ${round(r)} ${round(ry)} 0 0 0 ${rt} ${round(y)} V ${t} A ${round(r)} ${round(ry)} 0 0 1 ${l} ${t} Z`;
	const disc = `<ellipse cx="${round(x)}" cy="${t}" rx="${round(r)}" ry="${round(ry)}" ${k.attrs(stroke, top)} />`;
	return [k.path(body, { ...stroke, fill: side }), disc].join("\n");
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
