/**
 * `progress` — a horizontal progress bar (family C): the lit run a filled
 * bar in the paint (a thick line is a shape, never a wide stroke) from the
 * left, the remainder a dim hairline — dotted unless said — out to an end
 * tick that marks the whole. At most three elements whatever the value.
 *
 *   progress(0.62)                                the reference: green, dotted remainder
 *   progress(0.3, { dotted: false, paint: "blue" })  a solid dim remainder
 *   progress(1)                                   full: the bar runs to the end tick
 *
 * Ranges: `value` 0–1 (under a quarter unit of length is no bar; past it the
 * bar is at least as long as it is thick). `dotted` true; `paint` the lit
 * bar (green). The end tick is the ink, hair.
 */

import { round as r } from "../geometry";
import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, drawing, paintOf } from "./base";

export interface ProgressOpts {
	/** the remainder a dim dotted hairline (true, the default) or a solid dim hairline */
	dotted?: boolean;
	/** the lit bar; green unless said */
	paint?: GenPaint;
}

/** The track's ends, its axis, the lit bar's thickness, the end tick's half-height, the gap before the remainder. */
export const PROGRESS = Object.freeze({ x0: 5, x1: 40, y: SAFE.cy, bar: 4, tick: 5, gap: 2 });

export function progress(value: number, o: ProgressOpts = {}): Drawing {
	const v = clamp(value, 0, 1, 0);
	const dotted = o.dotted !== false;
	const paint = paintOf(o.paint, GEN_PAINTS, "green");
	const { x0, x1, y, bar, tick, gap } = PROGRESS;
	const len = (x1 - x0) * v;
	const children: string[] = [];
	const lit = len >= 0.25;
	const end = lit ? x0 + Math.max(bar, len) : x0;
	const from = lit ? end + gap : x0;
	if (x1 - from >= 1) {
		children.push(K.line(from, y, x1, y, { paint: "dim", weight: "hair", ...(dotted ? { dash: "dotted" as const } : { cap: "butt" as const }) }));
	}
	if (lit) children.push(K.roundRect(x0, y - bar / 2, r(end - x0), bar, bar / 2, { paint: "none", fill: paint }));
	children.push(K.line(x1 + gap + 1, y - tick, x1 + gap + 1, y + tick, { weight: "hair", cap: "butt" }));
	return drawing(children);
}
