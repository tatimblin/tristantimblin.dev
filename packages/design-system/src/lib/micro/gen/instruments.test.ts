/**
 * The instrument generators (family C) — gauge, dial, ladder, segments,
 * selector: every one, over a sweep of its parameters including the
 * extremes and out-of-range values, bakes a file the glyph profile passes
 * within its viewBox's budget; the same params give the same string; the
 * geometry is what it says; a labelled meter's ARIA. Beside gen.test.ts
 * (the same contract) so the families merge apart. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, validateSvg } from "../../../../scripts/validate-art.mjs";
import { type Drawing, GEN_PAINTS, toSvg } from "./base";
import { dial } from "./dial";
import { arcMiddle, gauge } from "./gauge";
import { LADDER_AXES, ladder, ladderLevel } from "./ladder";
import { meterAria } from "./meter";
import { segments, segmentsText } from "./segments";
import { selector } from "./selector";

const violations = (d: Drawing) => validateSvg(toSvg(d), { profile: PROFILES.glyph });
const elements = (d: Drawing) => (toSvg(d).match(/<(path|polyline|line|circle|rect|polygon|g)\b/g) ?? []).length;
const budget = (d: Drawing) => (d.viewBox === "0 0 48 32" ? { el: 40, bytes: 3 * 1024 } : { el: 80, bytes: 6 * 1024 });
const numbers = (s: string) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const colours = (d: Drawing) => new Set(toSvg(d).match(/--art-(cyan|coral|green|lavender)/g) ?? []);

type Sweep = Array<[string, Drawing]>;
const VALUES = [0, 0.001, 0.1, 0.35, 0.5, 0.62, 0.999, 1];
const JUNK = [-1, 2, Number.NaN, Number.POSITIVE_INFINITY, "x" as never, undefined as never];

const gaugeSweep: Sweep = [];
for (const v of [...VALUES, ...JUNK]) for (const sweep of [90, 180, 270, 330]) gaugeSweep.push([`v${v} sweep ${sweep}`, gauge(v, { sweep })]);
for (const paint of GEN_PAINTS) for (const track of GEN_PAINTS) gaugeSweep.push([`${paint} on ${track}`, gauge(0.5, { paint, track })]);
gaugeSweep.push(["out of range: sweep 0", gauge(0.5, { sweep: 0 })], ["out of range: sweep 999", gauge(0.5, { sweep: 999 })], ["out of range: paints", gauge(0.5, { paint: "none" as never, track: "none" as never })]);

const dialSweep: Sweep = [];
for (const v of [...VALUES, ...JUNK]) for (const ticks of [2, 5, 12]) for (const sweep of [90, 270, 330]) dialSweep.push([`v${v} ×${ticks} sweep ${sweep}`, dial(v, { ticks, sweep })]);
for (const paint of GEN_PAINTS) dialSweep.push([paint, dial(0.4, { paint })]);
dialSweep.push(["out of range: ticks 0", dial(0.5, { ticks: 0 })], ["out of range: ticks 99", dial(0.5, { ticks: 99 })], ["out of range: sweep NaN", dial(0.5, { sweep: Number.NaN })]);

const ladderSweep: Sweep = [];
for (const axis of LADDER_AXES) {
	for (const steps of [2, 5, 9, 12]) for (const v of [...VALUES, ...JUNK]) ladderSweep.push([`${axis} ${steps} v${v}`, ladder(v, { steps, axis })]);
	for (const lit of [0, 1, 5, 12, -3, 99]) ladderSweep.push([`${axis} lit ${lit}`, ladder(0, { lit, steps: 12, axis })]);
	for (const paint of GEN_PAINTS) ladderSweep.push([`${axis} ${paint}`, ladder(0.5, { axis, paint })]);
}
ladderSweep.push(["out of range: steps 0", ladder(0.5, { steps: 0 })], ["out of range: steps 99", ladder(0.5, { steps: 99 })], ["out of range: an axis that is not one", ladder(0.5, { axis: "diagonal" as never })]);

const segmentsSweep: Sweep = [];
for (const v of ["", " ", "7", "045", "2893", "20260", "-12.5", "88888888", "20260929", "123456789012", "abc", "- -", 42, -7, Number.NaN, null as never, undefined as never]) {
	segmentsSweep.push([`"${String(v)}"`, segments(v as string)]);
}
for (const paint of GEN_PAINTS) segmentsSweep.push([paint, segments("88888888", { paint })]);

const selectorSweep: Sweep = [];
for (const n of [3, 4, 5, 7, 8, 12]) for (const active of [0, 1, -1, 99]) for (const spin of [false, true]) selectorSweep.push([`n${n} active ${active} spin ${spin}`, selector(n, { active, spin })]);
for (const paint of GEN_PAINTS) for (const accent of GEN_PAINTS) selectorSweep.push([`${paint} + ${accent}`, selector(8, { paint, accent })]);
selectorSweep.push(
	["every colour in the pattern", selector(12, { colours: ["blue", "red", "green", "lavender", "ink", "dim"], spin: true })],
	["out of range: n 0", selector(0)],
	["out of range: n 99", selector(99, { spin: true })],
	["out of range: colours junk", selector(8, { colours: ["none", "teal", 3] as never })],
	["out of range: colours not an array", selector(8, { colours: "red" as never })],
);

describe("every instrument validates clean over its sweep, within its budget", () => {
	for (const [family, sweep] of [["gauge", gaugeSweep], ["dial", dialSweep], ["ladder", ladderSweep], ["segments", segmentsSweep], ["selector", selectorSweep]] as const) {
		test(`${family} (${sweep.length} cases)`, () => {
			for (const [name, d] of sweep) {
				const b = budget(d);
				expect(violations(d), `${family}: ${name}`).toEqual([]);
				expect(elements(d), `${family}: ${name} element count`).toBeLessThanOrEqual(b.el);
				expect(toSvg(d).length, `${family}: ${name} bytes`).toBeLessThanOrEqual(b.bytes);
				expect(toSvg(d).match(/data-motion/g)?.length ?? 0, `${family}: ${name} motions`).toBeLessThanOrEqual(1);
			}
		});
	}
	test("the same params give the same string", () => {
		expect(toSvg(gauge(0.62))).toBe(toSvg(gauge(0.62)));
		expect(toSvg(dial(0.38, { ticks: 7 }))).toBe(toSvg(dial(0.38, { ticks: 7 })));
		expect(toSvg(ladder(0.4, { axis: "horizontal" }))).toBe(toSvg(ladder(0.4, { axis: "horizontal" })));
		expect(toSvg(segments("045"))).toBe(toSvg(segments("045")));
		expect(toSvg(selector(5, { spin: true }))).toBe(toSvg(selector(5, { spin: true })));
	});
});

describe("gauge", () => {
	test("a dim track band and the value's green band, both filled, never stroked", () => {
		const d = gauge(0.62);
		expect(d.children).toHaveLength(2);
		for (const c of d.children) {
			expect(c).toMatch(/^<path d="M .* Z" fill="[^"]+" \/>$/);
			expect(c).not.toContain("stroke");
		}
		expect(d.children[0]).toContain('fill="var(--glyph-dim)"');
		expect(d.children[1]).toContain('fill="var(--art-green)"');
	});
	test("an empty gauge is the track alone; the value's band grows with the value; full is the track's length", () => {
		expect(gauge(0).children).toHaveLength(1);
		expect(toSvg(gauge(-5))).toBe(toSvg(gauge(0)));
		expect(toSvg(gauge(5))).toBe(toSvg(gauge(1)));
		const full = gauge(1);
		expect(full.children[1].replace(/fill="[^"]+"/, "")).toBe(full.children[0].replace(/fill="[^"]+"/, ""));
	});
	test("the arc's points sit in the safe area, its extent centred on the tile, whatever the sweep", () => {
		for (const sweep of [90, 180, 270, 330]) {
			const d = /d="([^"]+)"/.exec(gauge(1, { sweep }).children[0])![1];
			// the points a path passes through: M's pair and each arc's end point
			const pts = d.split(/(?=[MA])/).map((seg) => numbers(seg).slice(-2));
			for (const [x, y] of pts) {
				expect(x).toBeGreaterThanOrEqual(4);
				expect(x).toBeLessThanOrEqual(44);
				expect(y).toBeGreaterThanOrEqual(4);
				expect(y).toBeLessThanOrEqual(28);
			}
			const r1 = numbers(d.split("A")[1])[0];
			const cy = 16 - arcMiddle(8.5, 12, -sweep / 2, sweep / 2);
			expect(cy - r1).toBeGreaterThanOrEqual(4); // the top of the outer arc
		}
	});
});

describe("dial", () => {
	test("hair dashed ticks, the needle in its own group, a hub dot in the paint", () => {
		const d = dial(0.38);
		expect(d.children).toHaveLength(3);
		expect(d.children[0]).toMatch(/stroke="currentColor" stroke-width="1".*stroke-dasharray="2 2"/);
		expect((d.children[0].match(/M /g) ?? []).length).toBe(5);
		expect(d.children[1]).toMatch(/^<g>\n {2}<line .*var\(--art-cyan\)/);
		expect(d.children[1]).not.toContain("data-motion");
		expect(d.children[2]).toMatch(/^<circle cx="24" cy="[\d.]+" r="2" fill="var\(--art-cyan\)" \/>$/);
	});
	test("the needle points at the value: straight up at the middle, the sweep's ends at 0 and 1", () => {
		const tip = (v: number) => {
			const a = (k: string) => Number(new RegExp(` ${k}="([^"]+)"`).exec(dial(v).children[1])![1]);
			const [x1, y1, x2, y2] = [a("x1"), a("y1"), a("x2"), a("y2")];
			return [x2 - x1, y2 - y1];
		};
		const [mx, my] = tip(0.5);
		expect(mx).toBeCloseTo(0, 1);
		expect(my).toBeCloseTo(-11, 1);
		const [x0, y0] = tip(0);
		expect(x0).toBeCloseTo(-11 * Math.SQRT1_2, 1);
		expect(y0).toBeCloseTo(11 * Math.SQRT1_2, 1);
		const [x1] = tip(1);
		expect(x1).toBeCloseTo(11 * Math.SQRT1_2, 1);
	});
});

describe("ladder", () => {
	test("the reference is 6 of 9 lit: a dim path of three bars and a blue path of six", () => {
		const d = ladder(0.66);
		expect(d.children).toHaveLength(2);
		expect(d.children[0]).toContain("var(--glyph-dim)");
		expect((d.children[0].match(/M /g) ?? []).length).toBe(3);
		expect(d.children[1]).toContain("var(--art-cyan)");
		expect((d.children[1].match(/M /g) ?? []).length).toBe(6);
		for (const c of d.children) expect(c).toContain('stroke-width="1"');
	});
	test("lit wins over the value and is clamped; all lit or none is one path", () => {
		expect(ladderLevel(0.9, { lit: 2, steps: 5 })).toEqual({ steps: 5, lit: 2 });
		expect(ladderLevel(0.5, { lit: 99, steps: 5 })).toEqual({ steps: 5, lit: 5 });
		expect(ladderLevel(0.5)).toEqual({ steps: 9, lit: 5 });
		expect(ladder(0).children).toHaveLength(1);
		expect(ladder(1).children).toHaveLength(1);
	});
	test("vertical is lit from the bottom (horizontal bars); horizontal from the left (vertical bars)", () => {
		const v = numbers(ladder(0, { lit: 1, steps: 3 }).children[1]);
		const vOff = numbers(ladder(0, { lit: 1, steps: 3 }).children[0]);
		expect(v[1]).toBeGreaterThan(Math.max(vOff[1], vOff[4]));
		expect(ladder(0, { lit: 1 }).children[1]).toMatch(/ H /);
		const h = ladder(0, { lit: 1, steps: 3, axis: "horizontal" });
		expect(h.children[1]).toMatch(/ V /);
		expect(numbers(h.children[1])[0]).toBeLessThan(numbers(h.children[0])[0]);
	});
});

describe("segments", () => {
	test("two paths whatever the string: the unlit a dim dotted hair, the lit the paint at line weight", () => {
		const d = segments("20260929");
		expect(d.children).toHaveLength(2);
		expect(d.children[0]).toMatch(/var\(--glyph-dim\)" stroke-width="1".*stroke-dasharray="0.01 3.99"/);
		expect(d.children[1]).toMatch(/var\(--art-cyan\)" stroke-width="1.5"/);
		const lit = (s: string) => (segments(s).children.find((c) => c.includes("art-cyan"))?.match(/M /g) ?? []).length;
		expect(lit("8")).toBe(7);
		expect(lit("1")).toBe(2);
		expect(lit("-")).toBe(1);
		expect(lit("045")).toBe(6 + 4 + 5);
	});
	test("one to four on the 48×32, five to eight wide; past eight cut; unknowns are blanks", () => {
		expect(segments("2893").viewBox).toBe("0 0 48 32");
		expect(segments("20260").viewBox).toBe("0 0 96 32");
		expect(segmentsText("123456789012")).toBe("12345678");
		expect(segmentsText("4a2")).toBe("4 2");
		expect(segmentsText("")).toBe(" ");
		expect(segmentsText(42)).toBe("42");
		expect(segments(" ").children).toHaveLength(1);
	});
	test("the digits sit in the safe area", () => {
		for (const s of ["7", "2893", "20260929"]) {
			const d = segments(s);
			const x1 = d.viewBox === "0 0 48 32" ? 44 : 92;
			const n = d.children.flatMap((c) => numbers(/d="([^"]+)"/.exec(c)![1]));
			for (let i = 0; i < n.length; i += 2) {
				expect(n[i]).toBeGreaterThanOrEqual(4);
				expect(n[i]).toBeLessThanOrEqual(x1);
				expect(n[i + 1]).toBeGreaterThanOrEqual(4);
				expect(n[i + 1]).toBeLessThanOrEqual(28);
			}
		}
	});
});

describe("selector", () => {
	test("n pips, the active one green, a blue centre ring and dot and an input line from the left", () => {
		const d = selector();
		expect(toSvg(d).match(/r="1.6"/g)).toHaveLength(8);
		expect(d.children[0]).toMatch(/^<line x1="4" y1="16" x2="24" y2="16".*var\(--art-cyan\)/);
		expect(d.children[1]).toMatch(/^<g>\n {2}<circle cx="28" cy="5.7" r="1.6" fill="var\(--art-green\)"/);
		expect(d.children[2]).toMatch(/^<circle cx="28" cy="16" r="4" fill="none" stroke="var\(--art-cyan\)"/);
	});
	test("at most two colours: the red pip is ink under a blue centre, red under an ink one", () => {
		expect([...colours(selector())].sort()).toEqual(["--art-cyan", "--art-green"]);
		expect([...colours(selector(8, { paint: "ink" }))].sort()).toEqual(["--art-coral", "--art-green"]);
		expect(colours(selector(12, { colours: ["blue", "red", "green", "lavender"] })).size).toBeLessThanOrEqual(2);
	});
	test("spin marks the pip ring alone; an odd ring adds a halo so it turns about the centre", () => {
		const still = toSvg(selector(8));
		expect(still).not.toContain("data-motion");
		const even = selector(8, { spin: true });
		expect(even.children[1]).toMatch(/^<g data-motion="spin">/);
		expect(even.children[1]).not.toContain("stroke-dasharray");
		const odd = selector(5, { spin: true });
		expect(odd.children[1]).toMatch(/<circle cx="28" cy="16" r="11.9" fill="none" stroke="var\(--glyph-dim\)".*stroke-dasharray="0.01 3.99"/);
		expect(selector(5).children[1]).not.toContain("r=\"11.9\"");
	});
	test("active wraps", () => {
		expect(toSvg(selector(8, { active: 9 }))).toBe(toSvg(selector(8, { active: 1 })));
		expect(toSvg(selector(8, { active: -1 }))).toBe(toSvg(selector(8, { active: 7 })));
	});
});

describe("meterAria", () => {
	test("a percent 0–100 of the clamped fraction, said as one unless told", () => {
		expect(meterAria(0.62)).toEqual({ role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 62, "aria-valuetext": "62%" });
		expect(meterAria(5)["aria-valuenow"]).toBe(100);
		expect(meterAria(Number.NaN)["aria-valuenow"]).toBe(0);
		expect(meterAria(6 / 9, "6 of 9")["aria-valuetext"]).toBe("6 of 9");
	});
});
