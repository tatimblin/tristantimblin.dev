/**
 * `ladder` — a level ladder (family C): a stack of hairline bars, the
 * first `lit` in the paint and the rest dim — a vertical meter lit from
 * the bottom, or a horizontal one lit from the left. Two paths whatever
 * the steps (the lit bars, the unlit bars), centred on the tile.
 *
 *   ladder(0.66)                                   the reference: 6 of 9 lit, blue, vertical
 *   ladder(0, { lit: 4, steps: 6 })                a count instead of a fraction
 *   ladder(0.5, { axis: "horizontal", paint: "green" })
 *
 * Ranges: `value` 0–1, lit as the nearest whole step (`round(value ×
 * steps)`); `lit` 0–steps, an integer, which wins over `value` when it is
 * given; `steps` 2–12. `axis` vertical | horizontal; `paint` the lit bars
 * (blue).
 */

import { round as r } from "../geometry";
import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, clampInt, drawing, paintOf } from "./base";

export type LadderAxis = "vertical" | "horizontal";

export const LADDER_AXES: readonly LadderAxis[] = Object.freeze(["vertical", "horizontal"]);

export interface LadderOpts {
	/** 2–12 bars; 9 unless said */
	steps?: number;
	/** 0–steps, the lit count; wins over the value when given */
	lit?: number;
	/** vertical (stacked, lit from the bottom) or horizontal (side by side, lit from the left); vertical unless said */
	axis?: LadderAxis;
	/** the lit bars; blue unless said */
	paint?: GenPaint;
}

/** The ladder's steps and lit count after clamping — the drawing's, and the meter's ARIA. */
export function ladderLevel(value: number, o: Pick<LadderOpts, "steps" | "lit"> = {}): { steps: number; lit: number } {
	const steps = clampInt(o.steps, 2, 12, 9);
	const lit = o.lit === undefined ? Math.round(clamp(value, 0, 1, 0) * steps) : clampInt(o.lit, 0, steps, 0);
	return { steps, lit };
}

/** A bar's pitch at most, and its length across the ladder. */
const PITCH = { vertical: 3, horizontal: 4 } as const;
const BAR = { vertical: 12, horizontal: 12 } as const;

export function ladder(value: number, o: LadderOpts = {}): Drawing {
	const { steps, lit } = ladderLevel(value, o);
	const axis = LADDER_AXES.includes(o.axis as LadderAxis) ? (o.axis as LadderAxis) : "vertical";
	const paint = paintOf(o.paint, GEN_PAINTS, "blue");
	const { cx, cy, x0, x1, y0, y1 } = SAFE;
	const room = axis === "vertical" ? y1 - y0 : x1 - x0;
	const pitch = Math.min(PITCH[axis], room / (steps - 1));
	const half = BAR[axis] / 2;
	const bar = (i: number): string => {
		if (axis === "vertical") {
			const y = cy + (pitch * (steps - 1)) / 2 - i * pitch;
			return `M ${r(cx - half)} ${r(y)} H ${r(cx + half)}`;
		}
		const x = cx - (pitch * (steps - 1)) / 2 + i * pitch;
		return `M ${r(x)} ${r(cy + half)} V ${r(cy - half)}`;
	};
	const on = Array.from({ length: lit }, (_, i) => bar(i));
	const off = Array.from({ length: steps - lit }, (_, i) => bar(lit + i));
	const children: string[] = [];
	if (off.length) children.push(K.path(off.join(" "), { paint: "dim", weight: "hair", cap: "butt" }));
	if (on.length) children.push(K.path(on.join(" "), { paint, weight: "hair", cap: "butt" }));
	return drawing(children);
}
