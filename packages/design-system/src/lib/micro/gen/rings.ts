/**
 * `rings` — a row or a stack of rings (family E).
 *
 *   rings()                                    four linked rings in a row: the unison glyph
 *   rings(4, { fade: true })                   …the last one dimmed, as the reference draws it
 *   rings(3, { mode: "concentric" })           a nested stack: a speaker, a target
 *   rings(4, { mode: "concentric", dotted: 2, accent: "blue" })   solid inner rings, two dotted outer, a centre dot
 *
 * `chain` (the default) is `n` equal rings overlapping in a row, centred
 * on the tile; `concentric` is `n` rings on the centre, evenly spaced out
 * to the safe area's edge. Ranges: `n` 1–6 (an integer). `fade` dims the
 * last ring (the chain's rightmost, the stack's outermost). `dotted`
 * (concentric only) draws that many outer rings as dim dotted guides —
 * the halo — 0 to n − 1, so the innermost is always solid. `accent`
 * (concentric only) is a dot on the centre, `none` unless said. The
 * default paint is red.
 */

import { ACCENT_PAINTS, type AccentPaint, type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clampInt, drawing, paintOf } from "./base";

export type RingsMode = "chain" | "concentric";

export const RINGS_MODES: readonly RingsMode[] = Object.freeze(["chain", "concentric"]);

export interface RingsOpts {
	/** chain (a row, the default) or concentric (a stack) */
	mode?: RingsMode;
	/** the last ring dimmed */
	fade?: boolean;
	/** concentric: how many outer rings are dim dotted guides, 0 to n − 1; 0 unless said */
	dotted?: number;
	/** red unless said */
	paint?: GenPaint;
	/** concentric: a dot on the centre; none unless said */
	accent?: AccentPaint;
}

/** A chain ring's largest radius, and its pitch as a share of the radius (under 2: they overlap). */
const CHAIN_R = 6;
const CHAIN_PITCH = 1.08;
/** A stack's outer radius: the safe area's half-height. */
const OUTER_R = SAFE.cy - SAFE.y0;
const CENTRE_R = 1.5;

export function rings(n = 4, o: RingsOpts = {}): Drawing {
	const count = clampInt(n, 1, 6, 4);
	const mode: RingsMode = RINGS_MODES.includes(o.mode as RingsMode) ? (o.mode as RingsMode) : "chain";
	const fade = o.fade === true;
	const paint = paintOf(o.paint, GEN_PAINTS, "red");
	const { cx, cy } = SAFE;
	const children: string[] = [];

	if (mode === "chain") {
		const width = SAFE.x1 - SAFE.x0;
		const r = Math.min(CHAIN_R, width / (2 + (count - 1) * CHAIN_PITCH));
		const pitch = r * CHAIN_PITCH;
		const first = cx - ((count - 1) * pitch) / 2;
		for (let i = 0; i < count; i++) {
			children.push(K.ring(first + i * pitch, cy, r, { paint: fade && i === count - 1 ? "dim" : paint }));
		}
		return drawing(children);
	}

	const dotted = clampInt(o.dotted, 0, count - 1, 0);
	const accent = paintOf(o.accent, ACCENT_PAINTS, "none");
	for (let i = 0; i < count; i++) {
		const r = (OUTER_R * (i + 1)) / count;
		const outer = count - 1 - i; // 0 is the outermost
		if (outer < dotted) children.push(K.ring(cx, cy, r, { paint: "dim", weight: "hair", dash: "dotted" }));
		else children.push(K.ring(cx, cy, r, { paint: fade && i === count - 1 ? "dim" : paint }));
	}
	if (accent !== "none") children.push(K.dot(cx, cy, CENTRE_R, { paint: accent }));
	return drawing(children);
}
