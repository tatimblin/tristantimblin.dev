/**
 * LAYOUT — the module sheet's grid. A HUD sheet is modules on a strict
 * grid with air between them; `grid()` cuts the plate (or any box) into
 * that grid's cells, so a composition places modules by cell rather than
 * by eye, and a gutter is one number rather than twenty.
 *
 *   const cells = grid(3, 2, 10, 16);    // 3 × 2 on the 320×180 plate, 10 between, 16 in from the edge
 *   const { x, y, w, h } = cells[4];     // row 1, column 1
 */

import { round } from "./geometry";

/** One cell of a grid: its box, and where it sits. */
export interface GridCell {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly col: number;
	readonly row: number;
}

export interface GridOpts {
	/** the box's width; the plate's 320 unless said */
	width?: number;
	/** the box's height; the plate's 180 unless said */
	height?: number;
	/** a margin per axis, overriding `margin`: `[x, y]` */
	inset?: readonly [number, number];
}

/**
 * `cols` × `rows` cells over the plate (or a `width` × `height` box),
 * `gutter` apart and `margin` in from every edge — the 16-unit safe area
 * is `margin: 16`. Row-major: `cells[row * cols + col]`. Whole-number
 * counts of at least one; a gutter or margin that leaves no room throws.
 */
export function grid(cols: number, rows: number, gutter = 10, margin = 16, o: GridOpts = {}): GridCell[] {
	const { width = 320, height = 180 } = o;
	const [mx, my] = o.inset ?? [margin, margin];
	if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
		throw new Error(`a grid is whole columns and rows, at least one each (got ${cols} × ${rows})`);
	}
	const w = (width - 2 * mx - gutter * (cols - 1)) / cols;
	const h = (height - 2 * my - gutter * (rows - 1)) / rows;
	if (w <= 0 || h <= 0) throw new Error(`no room for ${cols} × ${rows} cells in ${width} × ${height} with gutter ${gutter} and margin ${mx}/${my}`);
	const out: GridCell[] = [];
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			out.push({ x: round(mx + col * (w + gutter)), y: round(my + row * (h + gutter)), w: round(w), h: round(h), col, row });
		}
	}
	return out;
}

/** The box two cells span: from `a`'s top-left to `b`'s bottom-right (a module across columns or rows). */
export function span(a: GridCell, b: GridCell): GridCell {
	return { x: a.x, y: a.y, w: round(b.x + b.w - a.x), h: round(b.y + b.h - a.y), col: a.col, row: a.row };
}
