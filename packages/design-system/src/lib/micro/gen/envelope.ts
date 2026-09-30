/**
 * `envelope` — an ADSR envelope (family B): one path from the baseline up
 * the attack to the peak, curving down the decay to the sustain level,
 * holding, and curving down the release to the baseline.
 *
 *   envelope()                                   the reference ADSR, blue
 *   envelope({ a: 0.1, d: 0, s: 1, h: 0.2, r: 0.4 })   an AR: no decay, full sustain
 *   envelope({ a: 0.5, d: 0.5, s: 0, h: 0, r: 0 })     an AD: decays to silence
 *
 * The four times are RELATIVE — `a`, `d`, `h`, `r` each 0–1, and the
 * tile's width is shared out in proportion (so `{a: 1, r: 1}` is the same
 * shape as `{a: 0.5, r: 0.5}`); `s` is the sustain level, 0–1 of the
 * peak. A zero-width stage is left out of the path rather than drawn as a
 * hook: `d: 0` or `s: 1` is a flat top straight from the attack, `h: 0`
 * a decay straight into the release, `r: 0` a vertical drop. All zero is
 * the default shape.
 */

import { round } from "../geometry";
import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, drawing, paintOf } from "./base";

export interface EnvelopeOpts {
	/** attack time, 0–1 relative; 0.12 unless said */
	a?: number;
	/** decay time, 0–1 relative; 0.22 unless said */
	d?: number;
	/** sustain level, 0–1 of the peak; 0.55 unless said */
	s?: number;
	/** hold time (the sustain's length), 0–1 relative; 0.3 unless said */
	h?: number;
	/** release time, 0–1 relative; 0.36 unless said */
	r?: number;
	/** blue unless said */
	paint?: GenPaint;
}

export const ENVELOPE_DEFAULTS = Object.freeze({ a: 0.12, d: 0.22, s: 0.55, h: 0.3, r: 0.36 });

/** The envelope's box: a unit inside the safe area on each side, the baseline at 26. */
const X0 = SAFE.x0 + 1;
const X1 = SAFE.x1 - 1;
const BASE = SAFE.y1 - 2;
const TOP = SAFE.y0 + 2;
/** A stage narrower than this (in viewBox units) is left out of the path. */
const MIN_STAGE = 0.05;

export function envelope(o: EnvelopeOpts = {}): Drawing {
	const D = ENVELOPE_DEFAULTS;
	let [a, d, h, r] = [clamp(o.a, 0, 1, D.a), clamp(o.d, 0, 1, D.d), clamp(o.h, 0, 1, D.h), clamp(o.r, 0, 1, D.r)];
	const s = clamp(o.s, 0, 1, D.s);
	const paint = paintOf(o.paint, GEN_PAINTS, "blue");
	if (a + d + h + r === 0) [a, d, h, r] = [D.a, D.d, D.h, D.r];
	const k = (X1 - X0) / (a + d + h + r);
	const sy = BASE - s * (BASE - TOP);
	const ax = X0 + a * k;
	const dx = ax + d * k;
	const hx = dx + h * k;
	const rx = hx + r * k;
	const parts = [`M ${X0} ${BASE}`, `L ${round(ax)} ${TOP}`];
	// decay: a quadratic leaning past the peak, its control a fifth of the way along at the sustain level
	if (s < 1) {
		if (d * k >= MIN_STAGE) parts.push(`Q ${round(ax + d * k * 0.2)} ${round(sy)} ${round(dx)} ${round(sy)}`);
		else parts.push(`L ${round(dx)} ${round(sy)}`); // no decay time: a drop to the sustain level
	}
	if (h * k >= MIN_STAGE) parts.push(`L ${round(hx)} ${round(sy)}`);
	if (r * k >= MIN_STAGE) parts.push(`Q ${round(hx + r * k * 0.2)} ${BASE} ${round(rx)} ${BASE}`);
	else parts.push(`L ${round(rx)} ${BASE}`);
	return drawing([K.path(parts.join(" "), { paint })]);
}
