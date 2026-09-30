/**
 * The ARIA a meter glyph passes to the host when it is labelled — the
 * instrument generators' (`gauge`, `dial`, `ladder`) shared a11y. The
 * range is a PERCENT, 0–100 (a screen reader reads "62", not "0.62"),
 * the value the fraction the drawing shows (clamped as the generator
 * clamps it) rounded to a whole percent, and the text says it as one
 * ("62%", or what the caller says instead — a ladder's "6 of 9").
 *
 *   <GlyphSvg svg={gauge(v)} {...(label ? meterAria(v) : {})} {label} />
 *
 * Without a label the component passes none of it and the mark is
 * aria-hidden like any glyph: a value that matters needs a name.
 */

import { clamp } from "./base";

export interface MeterAria {
	role: "meter";
	"aria-valuemin": 0;
	"aria-valuemax": 100;
	"aria-valuenow": number;
	"aria-valuetext": string;
}

/** `role="meter"` and its `aria-value*` for a fraction 0–1 (clamped; not a number is 0). */
export function meterAria(fraction: unknown, text?: string): MeterAria {
	const pct = Math.round(clamp(fraction, 0, 1, 0) * 100);
	return { role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct, "aria-valuetext": text ?? `${pct}%` };
}
