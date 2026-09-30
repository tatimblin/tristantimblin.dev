/**
 * `dial` — a needle dial (family C; the reference's FREQ dial): dashed
 * radial ticks over the sweep and a needle from a hub dot pointing at the
 * value. The needle is its own `<g>` (the hub is outside it), so a
 * consumer could give it motion later; there is none by default. Centred
 * on the tile whatever its sweep.
 *
 *   dial(0.38)                               the reference: five ink ticks, a blue needle
 *   dial(0.5, { ticks: 9, sweep: 180 })
 *   dial(1, { paint: "red" })
 *
 * Ranges: `value` 0–1 (the needle from the sweep's start, clockwise),
 * `ticks` 2–12 (an integer), `sweep` 90–330 degrees centred on the top.
 * `paint` the needle and hub (blue); the ticks are the ink, hair, dashed.
 */

import { polar } from "../geometry";
import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, clampInt, drawing, paintOf } from "./base";
import { arcMiddle } from "./gauge";

export interface DialOpts {
	/** 2–12 ticks over the sweep, both ends included; 5 unless said */
	ticks?: number;
	/** 90–330 degrees, the dial's sweep; 270 unless said */
	sweep?: number;
	/** the needle and its hub; blue unless said */
	paint?: GenPaint;
}

/** The ticks run between these radii; the needle is a little shorter than their outer end. */
const T0 = 8;
const T1 = 13;
const NEEDLE = 11;
const HUB = 2;

export function dial(value: number, o: DialOpts = {}): Drawing {
	const v = clamp(value, 0, 1, 0);
	const n = clampInt(o.ticks, 2, 12, 5);
	const sweep = clamp(o.sweep, 90, 330, 270);
	const paint = paintOf(o.paint, GEN_PAINTS, "blue");
	const [a0, a1] = [-sweep / 2, sweep / 2];
	const cx = SAFE.cx;
	// the extent: the ticks' arc (a zero-width band at their outer radius) and the hub
	const cy = SAFE.cy - arcMiddle(T1, T1, a0, a1, [-HUB, HUB]);
	const angle = a0 + v * sweep;
	const [x, y] = polar(cx, cy, NEEDLE, angle);
	return drawing([
		K.ticksRadial(cx, cy, T0, T1, n, a0, a1, { weight: "hair", dash: "dash" }),
		K.group(K.line(cx, cy, x, y, { paint })),
		K.dot(cx, cy, HUB, { paint }),
	]);
}
