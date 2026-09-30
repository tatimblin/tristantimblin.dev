/**
 * `wave` — a waveform across the tile (family A): one path in the wave's
 * paint, centred on the glyph's midline. A burst is an impulse over a dim
 * flat guide. Noise and burst are deterministic from `seed`.
 *
 *   wave("sine")                              two blue cycles, amplitude 8
 *   wave("saw", { cycles: 3, paint: "red" })
 *   wave("noise", { seed: 11 })
 *
 * Ranges: `cycles` 1–6 (an integer; a burst ignores it), `amp` 1–12
 * (viewBox units either side of the midline; 12 fills the safe area),
 * `seed` any integer. The default paint is the reference sheet's per
 * shape: blue for sine and square, red for saw, noise and burst, lavender
 * for triangle.
 */

import { type Point, round } from "../geometry";
import { type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clamp, clampInt, drawing, lineD, paintOf, rng } from "./base";

export type WaveShape = "sine" | "saw" | "square" | "triangle" | "noise" | "burst";

export const WAVE_SHAPES: readonly WaveShape[] = Object.freeze(["sine", "saw", "square", "triangle", "noise", "burst"]);

export interface WaveOpts {
	/** 1–6, the whole cycles across the tile; 2 unless said */
	cycles?: number;
	/** 1–12, the height either side of the midline; 8 unless said */
	amp?: number;
	/** the noise's or burst's seed; 7 unless said */
	seed?: number;
	paint?: GenPaint;
}

const DEFAULT_PAINT: Readonly<Record<WaveShape, GenPaint>> = Object.freeze({
	sine: "blue", saw: "red", square: "blue", triangle: "lavender", noise: "red", burst: "red",
});

/**
 * A quarter sine as one cubic: from (0, 0) rising with slope 1 to
 * (π/2, 1) flat, the handles fitted numerically (max error 7.5e-5 of the
 * amplitude). `A` is the first handle's length along the start tangent,
 * `B` the second's back from the peak, both in radians.
 */
const A = 0.511;
const B = 0.569;
const Q = Math.PI / 2;

/**
 * One quarter of a sine as a `C` segment, `w` wide, on the midline `y`:
 * `dir` 1 rises from the midline to the peak (`sign` 1 up, -1 down), -1
 * falls from the peak back to the midline — the same handles, mirrored.
 * The path is continuous, so the start point is the last segment's end.
 */
function quarter(x: number, y: number, w: number, amp: number, dir: 1 | -1, sign: 1 | -1): string {
	const sx = w / Q;
	const dy = -sign * amp;
	const [c1, c2, end]: Point[] = dir === 1
		? [[x + A * sx, y + A * dy], [x + w - B * sx, y + dy], [x + w, y + dy]]
		: [[x + B * sx, y + dy], [x + w - A * sx, y + A * dy], [x + w, y]];
	return `C ${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(end[0])} ${round(end[1])}`;
}

export function wave(shape: WaveShape, o: WaveOpts = {}): Drawing {
	const s = WAVE_SHAPES.includes(shape) ? shape : "sine";
	const cycles = clampInt(o.cycles, 1, 6, 2);
	const amp = clamp(o.amp, 1, 12, 8);
	const seed = clampInt(o.seed, -2147483648, 2147483647, 7);
	const paint = paintOf(o.paint, GEN_PAINTS, DEFAULT_PAINT[s]);
	const { x0, x1, cy } = SAFE;
	const W = (x1 - x0) / cycles;
	const children: string[] = [];

	if (s === "sine") {
		let d = `M ${x0} ${cy}`;
		for (let c = 0; c < cycles; c++) {
			const x = x0 + c * W;
			const q = W / 4;
			d += ` ${quarter(x, cy, q, amp, 1, 1)} ${quarter(x + q, cy, q, amp, -1, 1)} ${quarter(x + 2 * q, cy, q, amp, 1, -1)} ${quarter(x + 3 * q, cy, q, amp, -1, -1)}`;
		}
		children.push(K.path(d, { paint }));
	} else if (s === "saw") {
		const pts: Point[] = [[x0, cy + amp]];
		for (let c = 0; c < cycles; c++) {
			const x = x0 + c * W;
			pts.push([x + W, cy - amp], [x + W, cy + amp]);
		}
		children.push(K.path(lineD(pts), { paint }));
	} else if (s === "square") {
		const pts: Point[] = [[x0, cy + amp]];
		for (let c = 0; c < cycles; c++) {
			const x = x0 + c * W;
			pts.push([x, cy - amp], [x + W / 2, cy - amp], [x + W / 2, cy + amp], [x + W, cy + amp]);
		}
		children.push(K.path(lineD(pts), { paint }));
	} else if (s === "triangle") {
		const pts: Point[] = [[x0, cy]];
		for (let c = 0; c < cycles; c++) {
			const x = x0 + c * W;
			pts.push([x + W / 4, cy - amp], [x + (3 * W) / 4, cy + amp], [x + W, cy]);
		}
		children.push(K.path(lineD(pts), { paint }));
	} else if (s === "noise") {
		const rnd = rng(seed);
		const n = 30;
		const pts: Point[] = Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, cy + amp * (rnd() * 2 - 1)]);
		children.push(K.path(lineD(pts), { paint }));
	} else {
		// burst: flat, an impulse that rings down, flat — over a dim guide at the midline.
		const rnd = rng(seed);
		const lead = 10;
		const span = 22;
		const n = 26;
		const pts: Point[] = [[x0, cy], [x0 + lead, cy]];
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			const env = t < 0.2 ? t / 0.2 : Math.exp(-(t - 0.2) * 4.2);
			// the impulse may overshoot the amplitude by a third but never the safe area
			const a = Math.min(amp * 1.3, cy - SAFE.y0);
			pts.push([x0 + lead + span * t, cy + (i % 2 ? 1 : -1) * a * env * (0.45 + 0.55 * rnd())]);
		}
		pts.push([x1, cy]);
		children.push(K.guide([[x0, cy], [x1, cy]]), K.path(lineD(pts), { paint }));
	}
	return drawing(children);
}
