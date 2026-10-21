/**
 * `gauge` — an arc meter (family C): a thick arc built from the kit's
 * filled `band` (a thick line is a shape, never a wide stroke) — a track
 * over the whole sweep and the value's band over it from the start,
 * clockwise. The arc is centred on the tile whatever its sweep, so a
 * half-circle (`sweep: 180`) sits in the middle with room for a readout
 * under it.
 *
 *   gauge(0.62)                                  the reference: a 270° green meter on a dim track
 *   gauge(0.35, { sweep: 180, paint: "blue" })   a half-circle
 *   gauge(1, { track: "ink" })
 *
 * Ranges: `value` 0–1 (0 draws the track alone), `sweep` 90–330 degrees,
 * centred on the top of the dial. `paint` the value (green), `track` the
 * whole sweep (dim).
 */

import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, drawing, paintOf } from "./base";

export interface GaugeOpts {
	/** 90–330 degrees, the arc's sweep; 270 unless said */
	sweep?: number;
	/** the value's band; green unless said */
	paint?: GenPaint;
	/** the track's band; dim unless said */
	track?: GenPaint;
}

/** The band's outer and inner radius: 3.5 units thick, 24 across. */
const R1 = 12;
const R0 = 8.5;

/**
 * The vertical middle of a band's extent (relative to its centre) from
 * `a0` to `a1`, its round caps included — what to subtract so the arc is
 * centred on the tile.
 */
export function arcMiddle(r0: number, r1: number, a0: number, a1: number, extra: number[] = []): number {
	const w = (r1 - r0) / 2;
	const rm = (r0 + r1) / 2;
	const ys: number[] = [...extra];
	for (let i = 0; i <= 64; i++) {
		const t = ((a0 + ((a1 - a0) * i) / 64) * Math.PI) / 180;
		ys.push(-r1 * Math.cos(t), -r0 * Math.cos(t));
	}
	for (const a of [a0, a1]) {
		const y = -rm * Math.cos((a * Math.PI) / 180);
		ys.push(y - w, y + w);
	}
	return (Math.min(...ys) + Math.max(...ys)) / 2;
}

export function gauge(value: number, o: GaugeOpts = {}): Drawing {
	const v = clamp(value, 0, 1, 0);
	const sweep = clamp(o.sweep, 90, 330, 270);
	const paint = paintOf(o.paint, GEN_PAINTS, "green");
	const track = paintOf(o.track, GEN_PAINTS, "dim");
	const [a0, a1] = [-sweep / 2, sweep / 2];
	const cx = SAFE.cx;
	const cy = SAFE.cy - arcMiddle(R0, R1, a0, a1);
	const children = [K.band(cx, cy, R0, R1, a0, a1, { paint: track })];
	// under a degree the value is a cap alone — the empty meter shows the track
	if (v * sweep >= 1) children.push(K.band(cx, cy, R0, R1, a0, a0 + v * sweep, { paint }));
	return drawing(children);
}
