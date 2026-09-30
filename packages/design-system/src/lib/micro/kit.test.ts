/**
 * The L0 kit: every primitive's output passes the validator for its
 * target, the paints map per target, and the geometry lands where the
 * dial says. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, validateSvg } from "../../../scripts/validate-art.mjs";
import { onArc, polar, round, snap, spread } from "./geometry";
import { type Kit, kit } from "./kit";
import { TARGETS } from "./paint";

const g = kit("glyph");
const a = kit("art");
const sc = kit("scene");

/** Every primitive once, on the kit for a target, named. */
const sheet = (k: Kit): Array<[string, string]> => [
	["dot", k.dot(24, 16, 2, { paint: "green" })],
	["pip", k.pip(24, 16, 3, { paint: "blue" })],
	["terminal", k.terminal(24, 16, 6, { paint: "red" })],
	["line", k.line(6, 24, 42, 8)],
	["polyline", k.polyline([[4, 24], [14, 8], [24, 24]], { paint: "red" })],
	["path", k.path("M 4 16 Q 14 2 24 16 T 44 16", { paint: "lavender" })],
	["guide", k.guide([[4, 16], [44, 16]])],
	["dashes", [k.line(4, 8, 44, 8, { dash: "dash" }), k.line(4, 16, 44, 16, { dash: "long" }), k.line(4, 24, 44, 24, { dash: "dotted" })].join("\n")],
	["wire", k.wire([[6, 25], [22, 25], [22, 8], [40, 8]], { start: "dot", end: "terminal", paint: "blue" })],
	["leader", k.leader([6, 26], [30, 10], { paint: "red" })],
	["arc", k.arc(24, 18, 11, -90, 60, { paint: "red" })],
	["ring", k.ring(24, 16, 10, { paint: "blue" })],
	["ring filled", k.ring(24, 16, 10, { paint: "none", fill: "lavender" })],
	["band", k.band(24, 18, 8, 11, -110, 60, { paint: "green" })],
	["band butt", k.band(24, 18, 8, 11, -135, 135, { paint: "dim", cap: "butt" })],
	["arrowhead", k.arrowhead(40, 16, 90, 4)],
	["chevron", k.chevron(24, 16, 90, 8, { paint: "red" })],
	["plus", k.plus(24, 16, 16, { paint: "red" })],
	["cross", k.cross(24, 16, 14, { paint: "red" })],
	["check", k.check(24, 16, 14, { paint: "green" })],
	["ticksRadial", k.ticksRadial(24, 20, 9, 13, 7, -90, 90, { weight: "hair" })],
	["ticksLinear", k.ticksLinear(4, 20, 44, 20, 9, -5, { weight: "hair" })],
	["needle", k.needle(24, 18, 11, -35, { paint: "blue" })],
	["polygon", k.polygon([[14, 6], [14, 26], [36, 16]], { paint: "green" })],
	["tri", k.tri(24, 16, 11, { angle: 90, fill: "green", paint: "none" })],
	["rect", k.rect(10, 8, 28, 16)],
	["roundRect", k.roundRect(10, 8, 28, 16, 4, { paint: "blue" })],
	["pill", k.pill(9, 8, 30, 16, { paint: "dim" })],
	["keycap", k.keycap(8, 3, 32, 26)],
	["bracket", k.bracket(8, 6, 6, "tl", { paint: "dim" })],
	["hex", k.hex(24, 16, 11, { paint: "lavender" })],
	["star", k.star(24, 16, 10, 8, 11.5, { paint: "red" })],
	["coil", k.coil(6, 16, 36, 5, 5, { paint: "lavender" })],
	["group", k.group([k.ring(24, 16, 12, { weight: "hair", dash: "dotted" }), k.line(24, 16, 24, 6)], { motion: "spin", speed: 2 })],
	["group transform+motion", k.group([k.dot(0, 0, 3, { paint: "red" })], { motion: "blink", transform: "translate(24 16)" })],
	["steps", k.steps([
		[k.dot(8, 16, 2, { paint: "green" }), k.ring(8, 16, 4, { paint: "green", weight: "hair", mark: "ripple" }), k.group(k.line(8, 24, 8, 28), { mark: "now" })],
		[k.dot(24, 16, 2, { paint: "green" }), k.ring(24, 16, 4, { paint: "green", weight: "hair", mark: "ripple" }), k.group(k.line(24, 24, 24, 28), { mark: "now" })],
		[k.dot(40, 16, 2, { paint: "red" }), k.ring(40, 16, 4, { paint: "red", weight: "hair", mark: "ripple" }), k.group(k.line(40, 24, 40, 28), { mark: "now" })],
	], { speed: 2 })],
	["isoBox", k.isoBox(24, 28, 12, 12, 10, { right: "blue" })],
	["isoCylinder", k.isoCylinder(24, 27, 8, 14, { side: "green" })],
	["isoCylinder x", k.isoCylinder(14, 12, 6, 24, { axis: "x", side: "blue", top: "none" })],
	["isoEllipse", k.isoEllipse(24, 16, 10, { fill: "green" })],
	["isoEllipse y", k.isoEllipse(24, 16, 10, { axis: "y", paint: "blue" })],
	["isoRoundRect", k.isoRoundRect(30, 30, 24, 12, 3, { paint: "lavender" })],
	["isoRoundBox", k.isoRoundBox(30, 30, 24, 12, 5, 3, { side: "lavender", top: "none" })],
	["isoCoil", k.isoCoil(24, 28, 8, 20, 3, { paint: "red" })],
	["isoPlane", k.isoPlane(24, 30, 20, 20, { grid: 4, paint: "blue" })],
	["vanishingGrid", k.vanishingGrid(24, 8, 44, 22, 5, 7, { paint: "blue" })],
];

/** The `d` of the one path in an element string. */
const dOf = (el: string): string => /d="([^"]+)"/.exec(el)![1];
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe("every primitive is valid for its target", () => {
	for (const [name, body] of sheet(g)) {
		test(`glyph: ${name}`, () => {
			const file = g.svg({ children: body, header: "baked from recipes/x.ts — edit the recipe" });
			expect(validateSvg(file, { profile: PROFILES.glyph })).toEqual([]);
		});
	}
	for (const [name, body] of sheet(a)) {
		test(`art: ${name}`, () => {
			const file = a.svg({ children: body });
			expect(validateSvg(file, { profile: PROFILES.art, slug: "x" })).toEqual([]);
		});
	}
	for (const [name, body] of sheet(sc)) {
		test(`scene: ${name}`, () => {
			const file = sc.svg({ children: body });
			expect(file).toContain('viewBox="0 0 400 400"');
			expect(validateSvg(file, { profile: PROFILES.scene, slug: "x" })).toEqual([]);
		});
	}

	test("a wide glyph keeps its viewBox", () => {
		const file = g.svg({ viewBox: "0 0 96 32", children: g.line(0, 16, 96, 16) });
		expect(file).toContain('viewBox="0 0 96 32"');
		expect(validateSvg(file, { profile: PROFILES.glyph })).toEqual([]);
	});
});

describe("paint, weight and dash map per target", () => {
	test("ink and dim differ; the colours are the art tokens on both", () => {
		expect(g.paint("ink")).toBe("currentColor");
		expect(g.paint("dim")).toBe("var(--glyph-dim)");
		expect(a.paint("ink")).toBe("var(--art-ink)");
		expect(a.paint("dim")).toBe("var(--art-ink-2)");
		for (const k of [g, a]) {
			expect(k.paint("blue")).toBe("var(--art-cyan)");
			expect(k.paint("red")).toBe("var(--art-coral)");
			expect(k.paint("green")).toBe("var(--art-green)");
			expect(k.paint("lavender")).toBe("var(--art-lavender)");
			expect(k.paint("none")).toBe("none");
		}
	});

	test("a stroke states its fill, weight and vector-effect on itself", () => {
		const el = g.line(0, 0, 10, 10);
		expect(el).toContain('fill="none"');
		expect(el).toContain('stroke="currentColor"');
		expect(el).toContain('stroke-width="1.5"');
		expect(el).toContain('vector-effect="non-scaling-stroke"');
		expect(el).not.toContain("class=");
		expect(g.line(0, 0, 10, 10, { weight: "hair" })).toContain('stroke-width="1"');
	});

	test("a wash is the scene's fill: the one color-mix form, held to 1–25%, refused by art and glyph", () => {
		const w = sc.wash("blue", 22);
		expect(sc.fill(w)).toBe("color-mix(in oklab, var(--art-cyan) 22%, transparent)");
		expect(sc.fill(sc.wash("green", 40)).match(/(\d+)%/)![1]).toBe("25");
		expect(sc.fill(sc.wash("red", 0.2)).match(/(\d+)%/)![1]).toBe("1");
		expect(sc.fill(sc.wash("lavender", 12.6)).match(/(\d+)%/)![1]).toBe("13");
		expect(sc.fill("ink")).toBe("var(--art-ink)");
		const sea = sc.ring(200, 200, 120, { paint: "none", fill: w });
		expect(sea).toContain('fill="color-mix(in oklab, var(--art-cyan) 22%, transparent)"');
		expect(sea).not.toContain("stroke=");
		const scene = sc.svg({ children: [sea, sc.ring(200, 200, 120)] });
		expect(validateSvg(scene, { profile: PROFILES.scene })).toEqual([]);
		expect(validateSvg(a.svg({ children: [sea, a.ring(160, 90, 60)] }), { profile: PROFILES.art })).not.toEqual([]);
		expect(validateSvg(g.svg({ children: [g.ring(24, 16, 10, { fill: g.wash("blue", 10) })] }), { profile: PROFILES.glyph })).not.toEqual([]);
	});

	test("art's weight is a class that agrees with the width, hair by default", () => {
		const el = a.line(0, 0, 10, 10);
		expect(el).toContain('stroke-width="1"');
		expect(el).toContain('class="art-line"');
		const two = a.line(0, 0, 10, 10, { weight: "line" });
		expect(two).toContain('stroke-width="1.5"');
		expect(two).toContain('class="art-line--2"');
	});

	test("the dashes are the profile's arrays", () => {
		expect(g.dash("dotted")).toBe("0.01 3.99");
		expect(g.dash("dash")).toBe("2 2");
		expect(g.dash("long")).toBe("4 4");
		expect(a.dash("dotted")).toBe("2 6");
		expect(a.dash("dash")).toBe("4 4");
		expect(a.dash("long")).toBe("4 4");
		for (const t of ["glyph", "art", "scene"] as const) {
			for (const d of Object.values(TARGETS[t].dashes)) expect(PROFILES[t].dashes).toContain(d);
		}
	});

	test("the dot-dash is the scene kit's alone; the others refuse it by name", () => {
		expect(sc.dash("dotdash")).toBe("6 3 1 3");
		expect(sc.paint("ink")).toBe(a.paint("ink"));
		expect(() => a.dash("dotdash")).toThrow(/art kit has no "dotdash" dash/);
		expect(() => g.line(0, 0, 10, 0, { dash: "dotdash" })).toThrow(/glyph kit/);
		const orbit = sc.svg({ children: sc.group([sc.arc(200, 200, 144, -160, -20, { dash: "dotdash", paint: "red" }), sc.arc(200, 200, 144, 20, 160, { dash: "dotdash", paint: "red" })], { motion: "spin" }) });
		expect(validateSvg(orbit, { profile: PROFILES.scene })).toEqual([]);
	});

	test("a guide is a dim, hair, dotted, round-capped polyline", () => {
		const el = g.guide([[0, 0], [10, 0]]);
		expect(el).toContain('stroke="var(--glyph-dim)"');
		expect(el).toContain('stroke-width="1"');
		expect(el).toContain('stroke-dasharray="0.01 3.99"');
		expect(el).toContain('stroke-linecap="round"');
	});

	test("a filled mark has no stroke; a flat shape says paint none", () => {
		expect(g.dot(1, 1)).not.toContain("stroke");
		expect(g.band(0, 0, 4, 6, 0, 90)).not.toContain("stroke");
		expect(g.ring(0, 0, 4, { paint: "none", fill: "red" })).toBe('<circle cx="0" cy="0" r="4" fill="var(--art-coral)" />');
	});

	test("a wire's end marks take the target's sizes", () => {
		expect(g.dot(0, 0)).toContain('r="1.5"');
		expect(a.dot(0, 0)).toContain('r="2.5"');
		expect(g.wire([[0, 0], [10, 0]], { end: "terminal" })).toContain('width="4"');
		expect(a.wire([[0, 0], [10, 0]], { end: "terminal" })).toContain('width="6"');
	});
});

describe("geometry", () => {
	test("numbers: two decimals, no trailing zeros, no -0; snap to the half grid", () => {
		expect(round(1.234)).toBe(1.23);
		expect(round(1.236)).toBe(1.24);
		expect(round(2.1 + 0.2)).toBe(2.3);
		expect(Object.is(round(-0.001), -0)).toBe(false);
		expect(g.dot(1 / 3, 2 / 3, 1)).toBe('<circle cx="0.33" cy="0.67" r="1" fill="currentColor" />');
		expect(snap(1.3)).toBe(1.5);
		expect(snap(1.2)).toBe(1);
	});

	test("polar: 0 is up, 90 right, clockwise", () => {
		expect(polar(0, 0, 10, 0)).toEqual([0, -10]);
		expect(polar(0, 0, 10, 90)).toEqual([10, 0]);
		expect(polar(0, 0, 10, 180)).toEqual([0, 10]);
		expect(polar(24, 16, 10, -90)).toEqual([14, 16]);
	});

	test("spread and onArc include both ends, except over a full turn", () => {
		expect(spread(0, 90, 3)).toEqual([0, 45, 90]);
		expect(spread(0, 360, 4)).toEqual([0, 90, 180, 270]);
		expect(spread(10, 10, 1)).toEqual([10]);
		expect(onArc(0, 0, 10, 0, 180, 3)).toEqual([[0, -10], [10, 0], [0, 10]]);
	});

	test("an arc starts and ends on the dial, sweeps clockwise when a1 > a0, and a full turn is a ring", () => {
		const d = dOf(g.arc(24, 16, 10, 0, 90));
		expect(d).toBe("M 24 6 A 10 10 0 0 1 34 16");
		expect(dOf(g.arc(24, 16, 10, 90, 0))).toBe("M 34 16 A 10 10 0 0 0 24 6");
		expect(dOf(g.arc(24, 16, 10, 0, 270))).toContain("A 10 10 0 1 1");
		expect(g.arc(24, 16, 10, 0, 360)).toStartWith("<circle");
	});

	test("a band is one closed path: two arcs on the radii and a half-disc cap at each end", () => {
		const d = dOf(g.band(24, 16, 8, 12, -90, 90));
		expect(d).toEndWith("Z");
		expect(count(d, /A /g)).toBe(4);
		expect(d).toContain("A 12 12 0 0 1");
		expect(d).toContain("A 8 8 0 0 0");
		expect(count(d, /A 2 2 0 0 1/g)).toBe(2);
		expect(count(dOf(g.band(24, 16, 8, 12, -90, 90, { cap: "butt" })), /A /g)).toBe(2);
	});

	test("ticks: n subpaths, on the dial or along a line", () => {
		expect(count(dOf(g.ticksRadial(24, 16, 8, 12, 7, -90, 90)), /M /g)).toBe(7);
		expect(dOf(g.ticksRadial(24, 16, 8, 12, 2, 0, 90))).toBe("M 24 8 L 24 4 M 32 16 L 36 16");
		expect(count(dOf(g.ticksRadial(24, 16, 8, 12, 12, 0, 360)), /M /g)).toBe(12);
		expect(dOf(g.ticksLinear(0, 10, 20, 10, 3, 4))).toBe("M 0 10 L 0 14 M 10 10 L 10 14 M 20 10 L 20 14");
		expect(dOf(g.ticksLinear(0, 10, 20, 10, 2, 4, { centred: true }))).toBe("M 0 8 L 0 12 M 20 8 L 20 12");
	});

	test("a wire rounds every corner with an elbow no larger than half a leg", () => {
		const d = dOf(g.wire([[0, 0], [10, 0], [10, 10], [20, 10]]));
		expect(count(d, /Q /g)).toBe(2);
		expect(d).toBe("M 0 0 L 7 0 Q 10 0 10 3 L 10 7 Q 10 10 13 10 L 20 10");
		expect(dOf(g.wire([[0, 0], [4, 0], [4, 10]], { radius: 3 }))).toBe("M 0 0 L 2 0 Q 4 0 4 2 L 4 10");
		expect(count(dOf(g.wire([[0, 0], [10, 0]])), /Q /g)).toBe(0);
	});

	test("a needle points along the dial and carries a hub", () => {
		const el = g.needle(24, 16, 10, 90, { paint: "blue" });
		expect(el).toContain('x2="34" y2="16"');
		expect(el).toContain('<circle cx="24" cy="16" r="1.5" fill="var(--art-cyan)"');
		expect(g.needle(24, 16, 10, 90, { hub: 0 })).not.toContain("<circle");
	});

	test("shapes: a star has 2n vertices, a hex six, a triangle three, at the angle asked", () => {
		expect(count(g.star(0, 0, 5, 4, 8), / /g)).toBeGreaterThanOrEqual(10);
		expect(/points="([^"]+)"/.exec(g.star(0, 0, 5, 4, 8))![1].split(" ")).toHaveLength(10);
		expect(/points="([^"]+)"/.exec(g.hex(0, 0, 8))![1].split(" ")).toHaveLength(6);
		expect(/points="([^"]+)"/.exec(g.tri(0, 0, 8, { angle: 90 }))![1].split(" ")[0]).toBe("8,0");
	});

	test("a coil fits its length and has four curves a turn", () => {
		const d = dOf(g.coil(6, 16, 36, 5, 5));
		expect(count(d, /C /g)).toBe(20);
		// The on-curve points: the M, and each C's third pair (its controls may lean past the curve).
		const xs = [...d.matchAll(/C (?:-?[\d.]+ -?[\d.]+ ){2}(-?[\d.]+)/g)].map((m) => Number(m[1]));
		xs.push(Number(/M (-?[\d.]+)/.exec(d)![1]));
		expect(Math.min(...xs)).toBeGreaterThanOrEqual(6);
		expect(Math.max(...xs)).toBeLessThanOrEqual(42);
	});

	test("a bracket is an L at its corner", () => {
		expect(dOf(g.bracket(10, 10, 4, "tl"))).toBe("M 14 10 L 10 10 L 10 14");
		expect(dOf(g.bracket(10, 10, 4, "br"))).toBe("M 6 10 L 10 10 L 10 6");
	});
});

describe("assembly", () => {
	test("svg: the header comment, the target's root, the children indented, a trailing newline", () => {
		const file = g.svg({ header: "baked from recipes/x.ts — edit the recipe", children: [g.dot(1, 1), g.dot(2, 2)] });
		expect(file.split("\n")).toEqual([
			"<!-- baked from recipes/x.ts — edit the recipe -->",
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32">',
			'  <circle cx="1" cy="1" r="1.5" fill="currentColor" />',
			'  <circle cx="2" cy="2" r="1.5" fill="currentColor" />',
			"</svg>",
			"",
		]);
		expect(a.svg({ children: a.dot(1, 1) })).toContain('viewBox="0 0 320 180"');
	});

	test("group: a motion is data-motion on the g; a transform with a motion goes on an outer g", () => {
		expect(g.group(g.dot(1, 1), { motion: "spin", speed: 0.5 })).toStartWith('<g data-motion="spin" data-speed="0.5">');
		expect(g.group(g.dot(1, 1), { transform: "translate(1 2)" })).toStartWith('<g transform="translate(1 2)">\n  <circle');
		const both = g.group(g.dot(1, 1), { motion: "blink", transform: "translate(1 2)" });
		expect(both.split("\n")).toEqual([
			'<g transform="translate(1 2)">',
			'  <g data-motion="blink">',
			'    <circle cx="1" cy="1" r="1.5" fill="currentColor" />',
			"  </g>",
			"</g>",
		]);
	});

	test("steps: data-motion and data-beats on the g, one <g data-beat> per entry in order, the marks as data-ripple / data-now", () => {
		const s = a.steps([a.dot(10, 10), [a.dot(20, 10), a.ring(20, 10, 6, { mark: "ripple" }), a.group(a.dot(20, 30), { mark: "now" })]], { speed: 0.5 });
		expect(s.split("\n")).toEqual([
			'<g data-motion="steps" data-beats="2" data-speed="0.5">',
			'  <g data-beat="0">',
			'    <circle cx="10" cy="10" r="2.5" fill="var(--art-ink)" />',
			"  </g>",
			'  <g data-beat="1">',
			'    <circle cx="20" cy="10" r="2.5" fill="var(--art-ink)" />',
			'    <circle cx="20" cy="10" r="6" data-ripple="" fill="none" stroke="var(--art-ink)" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />',
			'    <g data-now="">',
			'      <circle cx="20" cy="30" r="2.5" fill="var(--art-ink)" />',
			"    </g>",
			"  </g>",
			"</g>",
		]);
		expect(a.svg({ children: s })).toSatisfy((file: string) => validateSvg(file, { profile: PROFILES.art }).length === 0);
		// A transform goes on an outer g, as with any motion.
		expect(a.steps([a.dot(1, 1), a.dot(2, 2)], { transform: "translate(1 2)" })).toStartWith('<g transform="translate(1 2)">\n  <g data-motion="steps" data-beats="2">');
		// A mark on a dot.
		expect(a.dot(1, 1, 2, { mark: "now" })).toBe('<circle data-now="" cx="1" cy="1" r="2" fill="var(--art-ink)" />');
	});

	test("steps: two to eight beats, none empty; group() refuses the kind", () => {
		expect(() => a.steps([a.dot(1, 1)])).toThrow(/two to eight/);
		expect(() => a.steps(Array.from({ length: 9 }, () => a.dot(1, 1)))).toThrow(/two to eight/);
		expect(() => a.steps([a.dot(1, 1), ""])).toThrow(/beat 1 is empty/);
		expect(() => a.group(a.dot(1, 1), { motion: "steps" as never })).toThrow(/k\.steps/);
	});
});
