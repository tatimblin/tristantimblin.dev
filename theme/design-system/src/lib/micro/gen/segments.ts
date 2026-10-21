/**
 * `segments` — seven-segment digits (family C), drawn as line segments so
 * no font is involved: the lit segments in the paint at line weight, the
 * unlit ones a ghost — dim, hair weight, dotted (a solid dim hair reads as
 * an "8" at 1×) — two paths whatever the string (every lit segment in
 * one, every unlit one in the other).
 *
 *   segments("045")                  the reference, blue
 *   segments("7", { paint: "red" })  one large digit
 *   segments("20260929")             eight: on the wide 96×32 viewBox
 *
 * Ranges: `value` a string (a number is written as one) of the digits,
 * `-` (the middle bar) and ` ` (a blank digit); any other character is a
 * blank. 1–8 characters: past eight it is cut, and an empty value is one
 * blank digit. One to four sit on the 48×32 tile, five to eight on the
 * wide `0 0 96 32` — the digits sized to the room, never taller than 20.
 * `paint` the lit segments (blue).
 */

import { round } from "../geometry";
import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, drawing, paintOf } from "./base";

export interface SegmentsOpts {
	/** the lit segments; blue unless said */
	paint?: GenPaint;
}

export const SEGMENTS_MAX = 8;
export const WIDE_VIEWBOX = "0 0 96 32";

/** The segments a to g on an 8×14 digit, as the reference draws them: [x1, y1, x2, y2], a hair's gap at every joint. */
const SEG: Readonly<Record<string, readonly [number, number, number, number]>> = Object.freeze({
	a: [1, 0, 7, 0],
	b: [8, 1, 8, 6],
	c: [8, 8, 8, 13],
	d: [1, 14, 7, 14],
	e: [0, 8, 0, 13],
	f: [0, 1, 0, 6],
	g: [1, 7, 7, 7],
});

/** Which segments each character lights. */
const LIT: Readonly<Record<string, string>> = Object.freeze({
	0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g", " ": "",
});

/** The digit's height at most; its width is 8/14 of it; the gap between digits half a digit's width. */
const MAX_H = 20;
const GAP = 0.5;

/** The string the drawing shows: at most eight characters, anything unknown a blank, never empty. */
export function segmentsText(value: unknown): string {
	const s = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value : "";
	const chars = [...s].slice(0, SEGMENTS_MAX).map((c) => (c in LIT ? c : " "));
	return chars.length ? chars.join("") : " ";
}

export function segments(value: string | number, o: SegmentsOpts = {}): Drawing {
	const text = segmentsText(value);
	const paint = paintOf(o.paint, GEN_PAINTS, "blue");
	const n = text.length;
	const wide = n > 4;
	const [x0, x1] = [SAFE.x0, wide ? 92 : SAFE.x1];
	const w = Math.min((MAX_H * 8) / 14, (x1 - x0) / (n + GAP * (n - 1)));
	const h = (w * 14) / 8;
	const [sx, sy] = [w / 8, h / 14];
	const total = n * w + (n - 1) * GAP * w;
	const left = (x0 + x1) / 2 - total / 2;
	const top = SAFE.cy - h / 2;
	const on: string[] = [];
	const off: string[] = [];
	[...text].forEach((ch, i) => {
		const ox = left + i * w * (1 + GAP);
		for (const [k, [a, b, c, d]] of Object.entries(SEG)) {
			const seg = `M ${round(ox + a * sx)} ${round(top + b * sy)} L ${round(ox + c * sx)} ${round(top + d * sy)}`;
			(LIT[ch].includes(k) ? on : off).push(seg);
		}
	});
	const children: string[] = [];
	if (off.length) children.push(K.path(off.join(" "), { paint: "dim", weight: "hair", dash: "dotted" }));
	if (on.length) children.push(K.path(on.join(" "), { paint }));
	return drawing(children, wide ? WIDE_VIEWBOX : undefined);
}
