/**
 * `progress` (family C) — over a sweep of its params, extremes and junk,
 * it validates clean within the 48×32 budget; the same params give the
 * same string; the geometry is what it says (the lit bar grows with the
 * value, the remainder dotted or solid, the end tick fixed); a labelled
 * bar's meter ARIA. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, validateSvg } from "../../../../scripts/validate-art.mjs";
import { type Drawing, GEN_PAINTS, toSvg } from "./base";
import { meterAria } from "./meter";
import { PROGRESS, progress } from "./progress";

const violations = (d: Drawing) => validateSvg(toSvg(d), { profile: PROFILES.glyph });
const elements = (d: Drawing) => (toSvg(d).match(/<(path|polyline|line|circle|rect|polygon|g)\b/g) ?? []).length;
const attr = (el: string, name: string) => Number(new RegExp(` ${name}="([^"]+)"`).exec(el)![1]);
const bar = (d: Drawing) => d.children.find((c) => c.startsWith("<rect"));
const remainder = (d: Drawing) => d.children.find((c) => c.includes("var(--glyph-dim)"));

const VALUES = [0, 0.001, 0.007, 0.01, 0.1, 0.35, 0.5, 0.62, 0.9, 0.95, 0.999, 1];
const JUNK = [-1, 2, Number.NaN, Number.POSITIVE_INFINITY, "x" as never, undefined as never];

const sweep: Array<[string, Drawing]> = [];
for (const v of [...VALUES, ...JUNK]) for (const dotted of [true, false]) sweep.push([`v${v} dotted ${dotted}`, progress(v, { dotted })]);
for (const paint of GEN_PAINTS) sweep.push([paint, progress(0.5, { paint })]);
sweep.push(["out of range: paint none", progress(0.5, { paint: "none" as never })], ["out of range: paint teal", progress(0.5, { paint: "teal" as never })]);

describe("progress", () => {
	test(`validates clean over its sweep, within the 48×32 budget (${sweep.length} cases)`, () => {
		for (const [name, d] of sweep) {
			expect(d.viewBox, name).toBe("0 0 48 32");
			expect(violations(d), name).toEqual([]);
			expect(elements(d), name).toBeLessThanOrEqual(3);
			expect(toSvg(d).length, name).toBeLessThanOrEqual(3 * 1024);
			expect(toSvg(d), name).not.toContain("data-motion");
		}
	});

	test("the same params give the same string; junk falls back or clamps", () => {
		expect(toSvg(progress(0.62))).toBe(toSvg(progress(0.62)));
		expect(toSvg(progress(0.3, { dotted: false, paint: "blue" }))).toBe(toSvg(progress(0.3, { dotted: false, paint: "blue" })));
		expect(toSvg(progress(-3))).toBe(toSvg(progress(0)));
		expect(toSvg(progress(Number.NaN))).toBe(toSvg(progress(0)));
		expect(toSvg(progress(9))).toBe(toSvg(progress(1)));
		expect(toSvg(progress(0.5, { paint: "none" as never }))).toBe(toSvg(progress(0.5)));
	});

	test("the reference: a filled green bar, a dim dotted remainder, an ink hair end tick", () => {
		const d = progress(0.62);
		expect(d.children).toHaveLength(3);
		const b = bar(d)!;
		expect(b).toContain('fill="var(--art-green)"');
		expect(b).not.toContain("stroke");
		const rem = remainder(d)!;
		expect(rem).toMatch(/stroke-width="1".*stroke-dasharray="0.01 3.99"/);
		const tick = d.children[d.children.length - 1];
		expect(tick).toMatch(/stroke="currentColor" stroke-width="1"/);
		expect(attr(tick, "x1")).toBe(attr(tick, "x2"));
	});

	test("the bar starts at the left end and grows with the value; the remainder takes the rest", () => {
		const { x0, x1, bar: thick } = PROGRESS;
		let last = 0;
		for (const v of [0.2, 0.4, 0.6, 0.8, 1]) {
			const b = bar(progress(v))!;
			expect(attr(b, "x")).toBe(x0);
			expect(attr(b, "height")).toBe(thick);
			const w = attr(b, "width");
			expect(w).toBeCloseTo((x1 - x0) * v, 1);
			expect(w).toBeGreaterThan(last);
			last = w;
			const rem = remainder(progress(v));
			if (rem) expect(attr(rem, "x1")).toBeGreaterThan(x0 + w);
		}
	});

	test("empty is no bar and a whole remainder; full is no remainder; a sliver is a nub as long as it is thick", () => {
		const empty = progress(0);
		expect(bar(empty)).toBeUndefined();
		expect(attr(remainder(empty)!, "x1")).toBe(PROGRESS.x0);
		expect(attr(remainder(empty)!, "x2")).toBe(PROGRESS.x1);
		expect(remainder(progress(1))).toBeUndefined();
		expect(attr(bar(progress(0.01))!, "width")).toBe(PROGRESS.bar);
	});

	test("dotted: false is a solid dim remainder", () => {
		const rem = remainder(progress(0.3, { dotted: false }))!;
		expect(rem).not.toContain("stroke-dasharray");
		expect(rem).toContain('stroke-width="1"');
	});

	test("everything sits in the safe area, centred across the tile", () => {
		const d = progress(1);
		const b = bar(d)!;
		const tick = d.children[d.children.length - 1];
		const left = attr(b, "x");
		const right = attr(tick, "x1");
		expect(left).toBeGreaterThanOrEqual(4);
		expect(right).toBeLessThanOrEqual(44);
		expect((left + right) / 2).toBeCloseTo(24, 0);
		expect(attr(tick, "y1")).toBeGreaterThanOrEqual(4);
		expect(attr(tick, "y2")).toBeLessThanOrEqual(28);
	});

	test("a labelled bar's meter ARIA is the whole percent", () => {
		expect(meterAria(0.62)).toEqual({ role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 62, "aria-valuetext": "62%" });
		expect(meterAria(7)["aria-valuenow"]).toBe(100);
	});
});
