/**
 * `selector` — a dot-ring selector (family C; the reference's P.Dest): `n`
 * pips on a ring around a centre ring and dot, an input line coming in
 * from the left. The pips alternate ink and dim, the `active` one in the
 * `accent` and the one opposite it red, unless `colours` says the pattern
 * — cycled over the pips, the active one still the accent.
 *
 *   selector()                                  eight pips, the first green, a blue centre
 *   selector(6, { active: 2, spin: true })      the pip ring spins under the pointer or `play`
 *   selector(8, { paint: "ink" })               the reference's green and red pips both show
 *
 * A glyph carries at most two colours (the glyph profile's palette), so
 * they are kept in order — the `paint`, the `accent`, then the pattern's
 * — and a third is drawn in ink: with the default blue centre the red pip
 * is ink; give the centre `ink` or `dim` and it is red.
 *
 * Ranges: `n` 3–12 (an integer), `active` 0 to n−1 (wrapped), `colours`
 * any paints (`none` is dim). `spin` marks the pip ring `data-motion=
 * "spin"` (the one motion in the file); the host runs it on hover and
 * under `play`. The ring turns about its own box's centre, so an odd `n`
 * — whose pips are not symmetric about the centre — adds a dim dotted
 * halo round the pips that squares the box.
 */

import { polar } from "../geometry";
import { ACCENT_PAINTS, type AccentPaint, type Drawing, GEN_PAINTS, type GenPaint, K, clampInt, drawing, paintOf } from "./base";

export interface SelectorOpts {
	/** 0 to n−1, the accent's pip (wrapped); 0 (the top) unless said */
	active?: number;
	/** the pips' pattern, cycled; ink and dim alternating, red opposite the active pip, unless said */
	colours?: readonly GenPaint[];
	/** the centre ring and dot and the input line; blue unless said */
	paint?: GenPaint;
	/** the active pip; green unless said */
	accent?: GenPaint;
	/** the pip ring spins (data-motion="spin") under the host's gating */
	spin?: boolean;
}

const CX = 28;
const CY = 16;
/** The pips' ring, the pip, the centre ring, the centre dot. */
const R = 10.3;
const PIP = 1.6;
const HUB_RING = 4;
const HUB = 1.5;

const COLOURS: readonly string[] = ["blue", "red", "green", "lavender"];

export function selector(n = 8, o: SelectorOpts = {}): Drawing {
	const count = clampInt(n, 3, 12, 8);
	const active = ((clampInt(o.active, -1e6, 1e6, 0) % count) + count) % count;
	const paint = paintOf(o.paint, GEN_PAINTS, "blue");
	const accent = paintOf(o.accent, GEN_PAINTS, "green");
	const pattern: GenPaint[] = Array.isArray(o.colours) && o.colours.length
		? o.colours.slice(0, 12).map((c) => paintOf(c as AccentPaint, ACCENT_PAINTS, "dim")).map((c) => (c === "none" ? "dim" : c))
		: [];
	const opposite = (active + Math.round(count / 2)) % count;
	const pipPaint = (i: number): GenPaint => {
		if (i === active) return accent;
		if (pattern.length) return pattern[i % pattern.length];
		if (i === opposite) return "red";
		return (i - active) % 2 === 0 ? "ink" : "dim";
	};
	// at most two colours, first come first kept: the paint, the accent, the pips
	const kept: string[] = [];
	const keep = (p: GenPaint): GenPaint => {
		if (!COLOURS.includes(p)) return p;
		if (kept.includes(p)) return p;
		if (kept.length < 2) return (kept.push(p), p);
		return "ink";
	};
	const centre = keep(paint);
	const acc = keep(accent);
	const pips = Array.from({ length: count }, (_, i) => {
		const [x, y] = polar(CX, CY, R, (i * 360) / count);
		return K.dot(x, y, PIP, { paint: i === active ? acc : keep(pipPaint(i)) });
	});
	const ring = o.spin && count % 2 ? [...pips, K.ring(CX, CY, R + PIP, { paint: "dim", weight: "hair", dash: "dotted" })] : pips;
	return drawing([
		K.line(4, CY, CX - HUB_RING, CY, { paint: centre }),
		o.spin ? K.group(ring, { motion: "spin" }) : K.group(ring),
		K.ring(CX, CY, HUB_RING, { paint: centre }),
		K.dot(CX, CY, HUB, { paint: centre }),
	]);
}
