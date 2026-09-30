/**
 * The L2 generators: every one, over a sweep of its parameters including
 * the extremes and out-of-range values, bakes a file the glyph profile
 * passes; the same params give the same string; and the geometry is the
 * shape it says. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, validateSvg } from "../../../../scripts/validate-art.mjs";
import { type Drawing, GEN_PAINTS, rng, simplify, smoothD, toSvg } from "./base";
import { CURVE_DEFAULT_POINTS, curve } from "./curve";
import { envelope } from "./envelope";
import { FILTER_TYPES, filter } from "./filter";
import { WAVE_SHAPES, wave } from "./wave";

const violations = (d: Drawing) => validateSvg(toSvg(d), { profile: PROFILES.glyph });
const elements = (d: Drawing) => (toSvg(d).match(/<(path|polyline|line|circle|rect|polygon|g)\b/g) ?? []).length;
/** Every number in the one stroked `path` of a drawing, as [x, y] pairs. */
const pathPoints = (d: Drawing, index = 0): Array<[number, number]> => {
	const ds = d.children.filter((c) => c.startsWith("<path")).map((c) => /d="([^"]+)"/.exec(c)![1]);
	const nums = ds[index].match(/-?\d+(\.\d+)?/g)!.map(Number);
	const out: Array<[number, number]> = [];
	for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
	return out;
};
const ys = (pts: Array<[number, number]>) => pts.map((p) => p[1]);
const xs = (pts: Array<[number, number]>) => pts.map((p) => p[0]);

/** A sweep of one generator: [name, drawing] pairs. */
type Sweep = Array<[string, Drawing]>;

const waveSweep: Sweep = [];
for (const shape of WAVE_SHAPES) {
	for (const cycles of [1, 2, 3, 6]) for (const amp of [1, 8, 12]) waveSweep.push([`${shape} ×${cycles} amp ${amp}`, wave(shape, { cycles, amp })]);
	for (const paint of GEN_PAINTS) waveSweep.push([`${shape} ${paint}`, wave(shape, { paint })]);
	for (const seed of [0, 1, 7, 11, -5, 2 ** 31 - 1]) waveSweep.push([`${shape} seed ${seed}`, wave(shape, { seed })]);
}
waveSweep.push(
	["out of range: cycles 0", wave("sine", { cycles: 0 })],
	["out of range: cycles 99", wave("square", { cycles: 99 })],
	["out of range: amp 0", wave("saw", { amp: 0 })],
	["out of range: amp 100", wave("noise", { amp: 100 })],
	["out of range: amp NaN", wave("burst", { amp: Number.NaN })],
	["out of range: a paint that is not one", wave("sine", { paint: "none" as never })],
	["out of range: a shape that is not one", wave("circle" as never)],
);

const envelopeSweep: Sweep = [["default", envelope()]];
for (const a of [0, 0.1, 1]) for (const d of [0, 0.3, 1]) for (const s of [0, 0.5, 1]) for (const h of [0, 0.3, 1]) for (const r of [0, 0.4, 1]) {
	envelopeSweep.push([`a${a} d${d} s${s} h${h} r${r}`, envelope({ a, d, s, h, r })]);
}
for (const paint of GEN_PAINTS) envelopeSweep.push([paint, envelope({ paint })]);
envelopeSweep.push(["out of range: negatives", envelope({ a: -1, d: -1, s: -1, h: -1, r: -1 })], ["out of range: huge", envelope({ a: 99, d: 99, s: 99, h: 99, r: 99 })]);

const filterSweep: Sweep = [];
for (const type of FILTER_TYPES) {
	filterSweep.push([type, filter(type)]);
	for (const cutoff of [0.05, 0.3, 0.5, 0.7, 0.95]) for (const q of [0.5, 0.707, 2.4, 10]) filterSweep.push([`${type} c${cutoff} q${q}`, filter(type, { cutoff, q })]);
	for (const paint of GEN_PAINTS) filterSweep.push([`${type} ${paint} + red accent`, filter(type, { paint, accent: "red" })]);
}
filterSweep.push(["out of range: cutoff 0, q 0", filter("lp", { cutoff: 0, q: 0 })], ["out of range: cutoff 2, q 1e9", filter("bp", { cutoff: 2, q: 1e9 })], ["out of range: a type that is not one", filter("shelf" as never)]);

const zigzag = (n: number): Array<[number, number]> => Array.from({ length: n }, (_, i) => [4 + (40 * i) / Math.max(1, n - 1), i % 2 ? 6 : 26]);
const curveSweep: Sweep = [["default", curve()]];
for (const n of [2, 3, 5, 12, 40]) for (const smooth of [false, true]) for (const dotted of [true, false]) for (const nodes of [true, false]) {
	curveSweep.push([`${n} pts smooth ${smooth} dotted ${dotted} nodes ${nodes}`, curve(zigzag(n), { smooth, dotted, nodes })]);
}
for (const paint of GEN_PAINTS) curveSweep.push([`line ${paint}, nodes red`, curve(undefined, { paint, accent: "red" })]);
curveSweep.push(
	["out of range: points off the tile", curve([[-100, -100], [1000, 1000], [24, Number.NaN]])],
	["out of range: one point", curve([[24, 16]])],
	["out of range: not points", curve("nope" as never)],
);

describe("every generator validates clean over its sweep", () => {
	for (const [family, sweep] of [["wave", waveSweep], ["envelope", envelopeSweep], ["filter", filterSweep], ["curve", curveSweep]] as const) {
		test(`${family} (${sweep.length} cases)`, () => {
			for (const [name, d] of sweep) {
				expect(violations(d), `${family}: ${name}`).toEqual([]);
				expect(elements(d), `${family}: ${name} element count`).toBeLessThanOrEqual(40);
				expect(toSvg(d).length, `${family}: ${name} bytes`).toBeLessThanOrEqual(3 * 1024);
			}
		});
	}
});

describe("a generator is deterministic", () => {
	test("the same params give the same string", () => {
		expect(toSvg(wave("noise", { seed: 3 }))).toBe(toSvg(wave("noise", { seed: 3 })));
		expect(toSvg(wave("burst", { seed: 9 }))).toBe(toSvg(wave("burst", { seed: 9 })));
		expect(toSvg(envelope({ a: 0.2 }))).toBe(toSvg(envelope({ a: 0.2 })));
		expect(toSvg(filter("bp", { q: 4 }))).toBe(toSvg(filter("bp", { q: 4 })));
		expect(toSvg(curve(zigzag(6), { smooth: true }))).toBe(toSvg(curve(zigzag(6), { smooth: true })));
	});
	test("a different seed is a different noise, and a different burst", () => {
		expect(toSvg(wave("noise", { seed: 3 }))).not.toBe(toSvg(wave("noise", { seed: 4 })));
		expect(toSvg(wave("burst", { seed: 3 }))).not.toBe(toSvg(wave("burst", { seed: 4 })));
	});
	test("rng is a fixed sequence in [0, 1)", () => {
		const a = rng(7);
		const b = rng(7);
		for (let i = 0; i < 20; i++) {
			const v = a();
			expect(v).toBe(b());
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});
});

describe("wave geometry", () => {
	test("a wave runs the safe width, centred on the midline, inside its amplitude", () => {
		for (const shape of WAVE_SHAPES) {
			const pts = pathPoints(wave(shape, { amp: 8 }));
			expect(Math.min(...xs(pts))).toBe(4);
			expect(Math.max(...xs(pts))).toBe(44);
			for (const y of ys(pts)) {
				expect(y).toBeGreaterThanOrEqual(4);
				expect(y).toBeLessThanOrEqual(28);
			}
		}
	});
	test("a sine is one path of cubics, starting and ending on the midline, its peaks at ±amp", () => {
		const d = wave("sine", { cycles: 2, amp: 8 });
		expect(d.children).toHaveLength(1);
		expect(d.children[0]).toMatch(/^<path d="M 4 16 C /);
		const pts = pathPoints(d);
		expect(pts[0]).toEqual([4, 16]);
		expect(pts[pts.length - 1]).toEqual([44, 16]);
		expect(Math.min(...ys(pts))).toBe(8);
		expect(Math.max(...ys(pts))).toBe(24);
		expect((d.children[0].match(/ C /g) ?? []).length).toBe(8);
	});
	test("a square has only horizontal and vertical legs; a saw has a vertical drop per cycle", () => {
		const sq = pathPoints(wave("square", { cycles: 3 }));
		for (let i = 1; i < sq.length; i++) expect(sq[i][0] === sq[i - 1][0] || sq[i][1] === sq[i - 1][1]).toBe(true);
		const saw = pathPoints(wave("saw", { cycles: 3 }));
		const drops = saw.filter((p, i) => i > 0 && p[0] === saw[i - 1][0] && p[1] !== saw[i - 1][1]);
		expect(drops).toHaveLength(3);
	});
	test("a triangle peaks once per cycle at ±amp", () => {
		const pts = pathPoints(wave("triangle", { cycles: 2, amp: 6 }));
		expect(pts.filter((p) => p[1] === 10)).toHaveLength(2);
		expect(pts.filter((p) => p[1] === 22)).toHaveLength(2);
	});
	test("a burst sits on a dim guide, flat before and after the impulse", () => {
		const d = wave("burst");
		expect(d.children).toHaveLength(2);
		expect(d.children[0]).toContain("var(--glyph-dim)");
		const pts = pathPoints(d);
		expect(pts[0]).toEqual([4, 16]);
		expect(pts[1]).toEqual([14, 16]);
		expect(pts[pts.length - 1]).toEqual([44, 16]);
		const swing = pts.slice(2, -1).map((p) => Math.abs(p[1] - 16));
		expect(Math.max(...swing)).toBeGreaterThan(6);
		expect(swing[swing.length - 1]).toBeLessThan(swing[3]); // rings down
	});
	test("the sheet's default paints per shape", () => {
		expect(toSvg(wave("sine"))).toContain("var(--art-cyan)");
		expect(toSvg(wave("saw"))).toContain("var(--art-coral)");
		expect(toSvg(wave("triangle"))).toContain("var(--art-lavender)");
		expect(toSvg(wave("noise", { paint: "green" }))).toContain("var(--art-green)");
	});
});

describe("envelope geometry", () => {
	const BASE = 26;
	const TOP = 6;
	test("starts and ends on the baseline, peaks at the top, one path", () => {
		const d = envelope();
		expect(d.children).toHaveLength(1);
		const pts = pathPoints(d);
		expect(pts[0]).toEqual([5, BASE]);
		expect(pts[pts.length - 1][1]).toBe(BASE);
		expect(pts[pts.length - 1][0]).toBeCloseTo(43, 1);
		expect(pts[1]).toEqual([9.56, TOP]);
	});
	test("the stages share the width in proportion", () => {
		const a = pathPoints(envelope({ a: 1, d: 1, h: 1, r: 1, s: 0.5 }));
		const b = pathPoints(envelope({ a: 0.25, d: 0.25, h: 0.25, r: 0.25, s: 0.5 }));
		expect(a).toEqual(b);
		expect(a[1][0]).toBeCloseTo(5 + 38 / 4, 2);
	});
	test("an AR (d 0, s 1) is a flat top straight from the attack with no hook", () => {
		const d = envelope({ a: 0.2, d: 0, s: 1, h: 0.3, r: 0.5 });
		expect(d.children[0]).not.toMatch(/Q [^Q]* Q/); // one Q: the release only
		const pts = pathPoints(d);
		expect(pts[1][1]).toBe(TOP);
		expect(pts[2][1]).toBe(TOP);
		expect(pts[2][0]).toBeGreaterThan(pts[1][0]);
	});
	test("no decay time but a lower sustain is a vertical drop; no release is a vertical drop to the baseline", () => {
		const pts = pathPoints(envelope({ a: 0.2, d: 0, s: 0.5, h: 0.4, r: 0 }));
		expect(pts[1][1]).toBe(TOP);
		expect(pts[2][0]).toBe(pts[1][0]);
		expect(pts[2][1]).toBe(16);
		expect(pts[pts.length - 1]).toEqual([pts[pts.length - 2][0], BASE]);
	});
	test("all-zero times fall back to the default shape; the sustain level is clamped", () => {
		expect(toSvg(envelope({ a: 0, d: 0, h: 0, r: 0 }))).toBe(toSvg(envelope()));
		expect(toSvg(envelope({ s: 5 }))).toBe(toSvg(envelope({ s: 1 })));
	});
});

describe("filter geometry", () => {
	const ZERO = 12;
	const curveOf = (type: "lp" | "hp" | "bp" | "notch", o = {}) => pathPoints(filter(type, o));
	test("draws a dim dotted 0 dB guide, then the curve; a bp adds a dashed centre in red", () => {
		const lp = filter("lp");
		expect(lp.children).toHaveLength(2);
		expect(lp.children[0]).toMatch(/polyline points="4,12 44,12".*var\(--glyph-dim\).*stroke-dasharray="0.01 3.99"/);
		const bp = filter("bp");
		expect(bp.children).toHaveLength(3);
		expect(bp.children[1]).toMatch(/<line x1="24" y1="4" x2="24" y2="28".*var\(--art-coral\).*stroke-width="1".*stroke-dasharray="2 2"/);
		expect(filter("bp", { accent: "none" }).children).toHaveLength(2);
	});
	test("a low-pass is flat at 0 dB then falls; a high-pass rises then is flat", () => {
		const lp = curveOf("lp", { q: 0.707 });
		expect(lp[0][1]).toBeCloseTo(ZERO, 0);
		expect(lp[lp.length - 1][1]).toBeGreaterThan(ZERO + 10);
		for (let i = 1; i < lp.length; i++) expect(lp[i][1]).toBeGreaterThanOrEqual(lp[i - 1][1] - 0.01);
		const hp = curveOf("hp", { q: 0.707 });
		expect(hp[0][1]).toBeGreaterThan(ZERO + 10);
		expect(hp[hp.length - 1][1]).toBeCloseTo(ZERO, 0);
		for (let i = 1; i < hp.length; i++) expect(hp[i][1]).toBeLessThanOrEqual(hp[i - 1][1] + 0.01);
	});
	test("a resonant low-pass bumps above 0 dB at the cutoff", () => {
		const lp = curveOf("lp", { cutoff: 0.5, q: 4 });
		const peak = lp.reduce((m, p) => (p[1] < m[1] ? p : m));
		expect(peak[1]).toBeLessThan(ZERO - 3);
		expect(peak[0]).toBeCloseTo(24, 0);
	});
	test("a band-pass peaks at the cutoff and falls both sides; a notch dips there", () => {
		const bp = curveOf("bp", { cutoff: 0.5, q: 3 });
		const top = bp.reduce((m, p) => (p[1] < m[1] ? p : m));
		expect(top[0]).toBeCloseTo(24, 0);
		expect(top[1]).toBeCloseTo(ZERO, 0);
		expect(bp[0][1]).toBeGreaterThan(ZERO + 8);
		expect(bp[bp.length - 1][1]).toBeGreaterThan(ZERO + 8);
		const notch = curveOf("notch", { cutoff: 0.5 });
		const dip = notch.reduce((m, p) => (p[1] > m[1] ? p : m));
		expect(dip[0]).toBeCloseTo(24, 0);
		expect(dip[1]).toBeGreaterThan(ZERO + 10);
		expect(notch[0][1]).toBeCloseTo(ZERO, 0);
		expect(notch[notch.length - 1][1]).toBeCloseTo(ZERO, 0);
	});
	test("the dB range is held: nothing above +12 or below -29 dB", () => {
		for (const type of FILTER_TYPES) for (const q of [0.5, 10]) {
			for (const [, y] of curveOf(type, { q })) {
				expect(y).toBeGreaterThanOrEqual(ZERO - 12 * 0.55 - 0.01);
				expect(y).toBeLessThanOrEqual(ZERO + 29 * 0.55 + 0.01);
			}
		}
	});
	test("the cutoff moves the curve; the curve is simplified from its samples", () => {
		expect(curveOf("lp", { cutoff: 0.3 })).not.toEqual(curveOf("lp", { cutoff: 0.7 }));
		expect(curveOf("lp").length).toBeLessThan(60);
	});
});

describe("curve geometry", () => {
	test("the default is the reference: a dim dotted polyline through five points with a green dot on each", () => {
		const d = curve();
		expect(d.children).toHaveLength(6);
		expect(d.children[0]).toMatch(/^<path d="M 6 24 L 16 9 L 25 22 L 34 7 L 42 17".*var\(--glyph-dim\).*stroke-width="1".*stroke-dasharray="0.01 3.99"/);
		for (const [i, [x, y]] of CURVE_DEFAULT_POINTS.entries()) {
			expect(d.children[i + 1]).toBe(`<circle cx="${x}" cy="${y}" r="2" fill="var(--art-green)" />`);
		}
	});
	test("smooth is cubics through the same points; solid is the ink at line weight; no nodes is the line alone", () => {
		const s = curve(undefined, { smooth: true });
		expect(s.children[0]).toMatch(/^<path d="M 6 24 C .* 42 17"/);
		expect(pathPoints(s).filter((_, i) => i === 0 || i % 3 === 0)).toEqual(CURVE_DEFAULT_POINTS.map(([x, y]) => [x, y]));
		const solid = curve(undefined, { dotted: false });
		expect(solid.children[0]).toMatch(/stroke="currentColor" stroke-width="1.5"/);
		expect(solid.children[0]).not.toContain("stroke-dasharray");
		expect(curve(undefined, { nodes: false }).children).toHaveLength(1);
		expect(curve(undefined, { accent: "none" }).children).toHaveLength(1);
	});
	test("points are held to the safe area, cut at twelve, and fewer than two fall back", () => {
		const pts = pathPoints(curve([[-10, -10], [100, 100]]));
		expect(pts).toEqual([[4, 4], [44, 28]]);
		expect(curve(zigzag(40)).children).toHaveLength(13);
		expect(toSvg(curve([[24, 16]]))).toBe(toSvg(curve()));
	});
});

describe("the base helpers", () => {
	test("simplify keeps a line's ends and drops what is on the chord", () => {
		const straight = Array.from({ length: 50 }, (_, i): [number, number] => [i, i * 0.5]);
		expect(simplify(straight)).toEqual([[0, 0], [49, 24.5]]);
		const bent: Array<[number, number]> = [[0, 0], [10, 5.01], [20, 10], [30, 4.98], [40, 0]];
		expect(simplify(bent)).toEqual([[0, 0], [20, 10], [40, 0]]);
		expect(simplify([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
	});
	test("smoothD is a polyline for two points, cubics from three", () => {
		expect(smoothD([[0, 0], [10, 10]])).toBe("M 0 0 L 10 10");
		expect(smoothD([[0, 0], [10, 10], [20, 0]])).toMatch(/^M 0 0 C .* 20 0$/);
	});
	test("smoothD closed: one cubic per point, back to the start, shut", () => {
		const sq: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
		const d = smoothD(sq, true);
		expect(d.startsWith("M 0 0 C ")).toBe(true);
		expect(d.match(/C /g)).toHaveLength(4);
		expect(d.endsWith(" 0 0 Z")).toBe(true);
		// Every tangent from both neighbours round the loop: at (0, 0) it runs from (0, 10) to (10, 0), so the first control is (10 − 0)/6 right and (0 − 10)/6 up.
		expect(d).toMatch(/^M 0 0 C 1\.67 -1\.67 /);
		// Symmetric: the join at the start is as smooth as any other point (the last control mirrors the first through (0, 0)).
		expect(d).toMatch(/C [^C]* -1\.67 1\.67 0 0 Z$/);
		// Open is unchanged by the option's existence; two points shut as a line.
		expect(smoothD(sq)).toBe(smoothD(sq, false));
		expect(smoothD([[0, 0], [10, 10]], true)).toBe("M 0 0 L 10 10 Z");
	});
});
