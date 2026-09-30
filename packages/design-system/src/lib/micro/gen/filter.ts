/**
 * `filter` — a filter's magnitude response (family B): the second-order
 * (biquad) response of a low-pass, high-pass, band-pass or notch across
 * seven octaves, in dB, as one path over a dim dotted 0 dB guide. A
 * band-pass may mark its centre with an accent: a fine dashed vertical.
 *
 *   filter("lp")                       the reference low-pass, red
 *   filter("bp", { q: 3 })             a resonant peak, blue, its centre marked in red
 *   filter("hp", { cutoff: 0.45, paint: "blue", accent: "none" })
 *
 * Ranges: `cutoff` 0.05–0.95 across the tile's width (the axis is
 * logarithmic, 7 octaves wide), `q` 0.5–10 (above ~0.7 a low- or
 * high-pass shows a resonant bump at the cutoff; the dB axis is held to
 * -29 … +12). The defaults are the reference sheet's per type: lp 0.55 /
 * 2.4, hp 0.45 / 2.4, bp 0.5 / 3, notch 0.5 / 1.2; red for lp and hp,
 * blue for bp and notch; the accent is red on a bp and none otherwise.
 */

import type { Point } from "../geometry";
import { ACCENT_PAINTS, type AccentPaint, type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, drawing, lineD, paintOf, simplify } from "./base";

export type FilterType = "lp" | "hp" | "bp" | "notch";

export const FILTER_TYPES: readonly FilterType[] = Object.freeze(["lp", "hp", "bp", "notch"]);

export interface FilterOpts {
	/** 0.05–0.95, the cutoff's position across the tile */
	cutoff?: number;
	/** 0.5–10, the resonance */
	q?: number;
	paint?: GenPaint;
	/** a band-pass's centre line; red on a bp, none otherwise, unless said */
	accent?: AccentPaint;
}

const DEFAULTS: Readonly<Record<FilterType, { cutoff: number; q: number; paint: GenPaint; accent: AccentPaint }>> = Object.freeze({
	lp: { cutoff: 0.55, q: 2.4, paint: "red", accent: "none" },
	hp: { cutoff: 0.45, q: 2.4, paint: "red", accent: "none" },
	bp: { cutoff: 0.5, q: 3, paint: "blue", accent: "red" },
	notch: { cutoff: 0.5, q: 1.2, paint: "blue", accent: "none" },
});

/** The 0 dB line, and the dB the tile shows: +12 at the top of the safe area, -29 a hair above its bottom. */
const ZERO_Y = 12;
const DB_MAX = 12;
const DB_MIN = -29;
const DB_SCALE = 0.55;
const OCTAVES = 7;
const SAMPLES = 80;

/** |H| of the biquad at `rho` (the frequency over the cutoff) for a `q`. */
function magnitude(type: FilterType, rho: number, q: number): number {
	const den = Math.sqrt((1 - rho * rho) ** 2 + (rho / q) ** 2);
	switch (type) {
		case "lp": return 1 / den;
		case "hp": return (rho * rho) / den;
		case "bp": return rho / q / den;
		case "notch": return Math.max(0.03, Math.abs(1 - rho * rho)) / den;
	}
}

export function filter(type: FilterType, o: FilterOpts = {}): Drawing {
	const t = FILTER_TYPES.includes(type) ? type : "lp";
	const D = DEFAULTS[t];
	const cutoff = clamp(o.cutoff, 0.05, 0.95, D.cutoff);
	const q = clamp(o.q, 0.5, 10, D.q);
	const paint = paintOf(o.paint, GEN_PAINTS, D.paint);
	const accent = paintOf(o.accent, ACCENT_PAINTS, D.accent);
	const { x0, x1, y0, y1 } = SAFE;
	const pts: Point[] = [];
	for (let i = 0; i <= SAMPLES; i++) {
		const u = i / SAMPLES;
		const rho = 2 ** ((u - cutoff) * OCTAVES);
		const db = Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(magnitude(t, rho, q))));
		pts.push([x0 + (x1 - x0) * u, ZERO_Y - db * DB_SCALE]);
	}
	const children = [K.guide([[x0, ZERO_Y], [x1, ZERO_Y]])];
	if (accent !== "none") {
		const cx = x0 + (x1 - x0) * cutoff;
		children.push(K.line(cx, y0, cx, y1, { paint: accent, weight: "hair", dash: "dash" }));
	}
	children.push(K.path(lineD(simplify(pts)), { paint }));
	return drawing(children);
}
