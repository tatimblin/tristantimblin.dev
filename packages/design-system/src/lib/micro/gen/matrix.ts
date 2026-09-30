/**
 * `matrix` — a grid of pips (family E): the pip matrix, a lit pattern on
 * it, hot cells in the accent, and the desk operator's x/o grid with a
 * square cursor.
 *
 *   matrix()                                         4 × 5 hollow blue pips
 *   matrix(4, 5, { hot: [2, 2] })                    …one hot pip, red
 *   matrix(6, 10, { on: "1011001110;…" })            a lit pattern: filled where on, dim hollow where off
 *   matrix(3, 3, { mark: "x", on: "100;010;001", cursor: [1, 1] })   the x/o grid, a square round the centre
 *
 * Ranges: `rows` 1–6, `cols` 1–10 (integers). Past six columns the grid
 * takes the wide `0 0 96 32` viewBox (and its 6 KB budget). The pitch is
 * 5 units, closer when the rows or columns need it; a pip's radius is
 * 0.38 of the pitch, never over 1.9.
 *
 * `on` — which cells are lit: a pattern string, rows split by `;` (or
 * `/`, `,`, a newline), a cell on for `1`, `x`, `#` or `*` and off for
 * anything else; or an array of row bitmasks, the MOST significant of
 * `cols` bits the leftmost cell (so `0b10110` reads as `"10110"`). A row
 * or cell the pattern leaves out is off; one past the grid is dropped.
 * Without `on`, every cell is lit on a pip or dot grid, and every cell is
 * an `o` on an x grid.
 *
 * `mark` — how a cell is drawn:
 *   pip (default) — without `on`, hollow pips in the paint; with it, lit
 *                   cells filled in the paint and the rest hollow and dim
 *   dot           — filled dots, the unlit ones small and dim
 *   x             — lit cells an × in the paint, the rest an o, dim
 *
 * `hot` — one `[r, c]` or a list of them, drawn in the accent (red unless
 * said) as they would otherwise be drawn; `cursor` — one `[r, c]` with a
 * square round it, in the accent (the paint when the accent is none).
 * Cells off the grid are dropped.
 *
 * Budget: every mark of one kind in one paint is ONE element — the
 * circles arc subpaths of a single path, the ×s strokes of another — so
 * a 6 × 10 grid is at most a handful of elements, whatever is lit.
 */

import { round } from "../geometry";
import type { Paint } from "../paint";
import { ACCENT_PAINTS, type AccentPaint, type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clampInt, drawing, paintOf } from "./base";

export type MatrixMark = "pip" | "dot" | "x";
export type Cell = readonly [number, number];

export const MATRIX_MARKS: readonly MatrixMark[] = Object.freeze(["pip", "dot", "x"]);

export interface MatrixOpts {
	/** the lit cells: a pattern ("10110;01001") or row bitmasks (MSB leftmost) */
	on?: string | readonly number[];
	/** cells in the accent: one [row, col] or a list */
	hot?: Cell | readonly Cell[];
	/** pip (the default), dot, or x (the x/o grid) */
	mark?: MatrixMark;
	/** a square round one [row, col], in the accent */
	cursor?: Cell;
	/** blue unless said */
	paint?: GenPaint;
	/** the hot cells and the cursor; red unless said */
	accent?: AccentPaint;
}

/** Past this many columns the grid goes wide. */
export const MATRIX_WIDE_AFTER = 6;
const WIDE = "0 0 96 32";
const PITCH = 5;
const R_SHARE = 0.38;
const R_MAX = 1.9;
/** An unlit dot's radius, of a lit one's. */
const DOT_OFF = 0.5;
const ON_CHARS = new Set(["1", "x", "X", "#", "*"]);

/** The lit cells as a rows × cols grid of booleans, or null when there is no pattern. */
function parseOn(on: unknown, rows: number, cols: number): boolean[][] | null {
	if (typeof on === "string") {
		const lines = on.split(/[;/,\n]/).map((l) => l.trim());
		return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ON_CHARS.has(lines[r]?.[c] ?? "")));
	}
	if (Array.isArray(on)) {
		return Array.from({ length: rows }, (_, r) => {
			const v = on[r];
			const mask = typeof v === "number" && Number.isFinite(v) ? Math.trunc(Math.abs(v)) : 0;
			// cols ≤ 10 bits: plain arithmetic, no 32-bit sign trouble
			return Array.from({ length: cols }, (_, c) => Math.floor(mask / 2 ** (cols - 1 - c)) % 2 === 1);
		});
	}
	return null;
}

/** A valid [row, col] inside the grid, or null. */
function cellOf(v: unknown, rows: number, cols: number): Cell | null {
	if (!Array.isArray(v) || v.length !== 2) return null;
	const [r, c] = v;
	if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= rows || c >= cols) return null;
	return [r, c];
}

/** The hot cells: `[r, c]` or `[[r, c], …]`, those off the grid dropped. */
function hotCells(v: unknown, rows: number, cols: number): Cell[] {
	if (!Array.isArray(v)) return [];
	const single = cellOf(v, rows, cols);
	if (single && typeof v[0] === "number") return [single];
	return v.map((c) => cellOf(c, rows, cols)).filter((c): c is Cell => c !== null);
}

/**
 * A circle as a subpath: two relative half-arcs from its left point,
 * written tight (no space after a command letter or before a minus) —
 * sixty of them are most of a 6 × 10 grid's bytes.
 */
const circleD = (x: number, y: number, r: number): string => {
	const [rr, dd] = [round(r), round(2 * r)];
	return `M${round(x - r)} ${round(y)}a${rr} ${rr} 0 1 0 ${dd} 0a${rr} ${rr} 0 1 0-${dd} 0`;
};

/** An × of half-size `h` as a subpath. */
const crossD = (x: number, y: number, h: number): string =>
	`M ${round(x - h)} ${round(y - h)} L ${round(x + h)} ${round(y + h)} M ${round(x + h)} ${round(y - h)} L ${round(x - h)} ${round(y + h)}`;

type Kind = "ring" | "fill" | "cross";

export function matrix(rows = 4, cols = 5, o: MatrixOpts = {}): Drawing {
	const R = clampInt(rows, 1, 6, 4);
	const C = clampInt(cols, 1, 10, 5);
	const mark: MatrixMark = MATRIX_MARKS.includes(o.mark as MatrixMark) ? (o.mark as MatrixMark) : "pip";
	const paint = paintOf(o.paint, GEN_PAINTS, "blue");
	const accent = paintOf(o.accent, ACCENT_PAINTS, "red");
	const wide = C > MATRIX_WIDE_AFTER;
	const [x0, x1] = wide ? [SAFE.x0, 96 - SAFE.x0] : [SAFE.x0, SAFE.x1];
	const { y0, y1, cy } = SAFE;
	const cx = (x0 + x1) / 2;

	// the pitch: 5, or what fits; the radius a share of it
	let pitch = PITCH;
	for (let i = 0; i < 2; i++) {
		const r = Math.min(R_MAX, pitch * R_SHARE);
		if (R > 1) pitch = Math.min(pitch, (y1 - y0 - 2 * r) / (R - 1));
		if (C > 1) pitch = Math.min(pitch, (x1 - x0 - 2 * r) / (C - 1));
	}
	const r = Math.min(R_MAX, pitch * R_SHARE);
	const px = (c: number) => cx + (c - (C - 1) / 2) * pitch;
	const py = (row: number) => cy + (row - (R - 1) / 2) * pitch;

	const lit = parseOn(o.on, R, C);
	const hot = new Set(hotCells(o.hot, R, C).map(([a, b]) => `${a},${b}`));
	const cursor = cellOf(o.cursor, R, C);

	// every mark, bucketed by kind and paint: one element per bucket
	const buckets = new Map<string, { kind: Kind; paint: Paint; d: string[] }>();
	const add = (kind: Kind, p: Paint, d: string) => {
		const key = `${kind}:${p}`;
		const b = buckets.get(key) ?? buckets.set(key, { kind, paint: p, d: [] }).get(key)!;
		b.d.push(d);
	};

	for (let row = 0; row < R; row++) {
		for (let c = 0; c < C; c++) {
			const on = lit ? lit[row][c] : mark !== "x";
			const isHot = hot.has(`${row},${c}`) && accent !== "none";
			const [x, y] = [px(c), py(row)];
			const tint = (base: Paint): Paint => (isHot ? accent : base);
			if (mark === "pip") {
				if (!lit) add("ring", tint(paint), circleD(x, y, r));
				else if (on) add("fill", tint(paint), circleD(x, y, r));
				else add("ring", tint("dim"), circleD(x, y, r));
			} else if (mark === "dot") {
				if (on) add("fill", tint(paint), circleD(x, y, r));
				else add("fill", tint("dim"), circleD(x, y, r * DOT_OFF));
			} else {
				if (on) add("cross", tint(paint), crossD(x, y, r * 0.95));
				else add("ring", tint("dim"), circleD(x, y, r));
			}
		}
	}

	// the dim marks first, the paint over them, the accent on top
	const rank = (p: Paint) => (p === "dim" ? 0 : p === accent ? 2 : 1);
	const children = [...buckets.values()]
		.sort((a, b) => rank(a.paint) - rank(b.paint))
		.map(({ kind, paint: p, d }) =>
			kind === "fill"
				? K.path(d.join(" "), { paint: "none", fill: p })
				: K.path(d.join(" "), { paint: p, weight: kind === "ring" ? "hair" : "line" }),
		);

	if (cursor) {
		const side = Math.min(pitch, 2 * r + 2.2);
		const [x, y] = [px(cursor[1]), py(cursor[0])];
		children.push(K.rect(x - side / 2, y - side / 2, side, side, { paint: accent === "none" ? paint : accent, weight: "hair", cap: "butt" }));
	}
	return drawing(children, wide ? WIDE : undefined);
}
