/**
 * The routing and field generators (families D/E) — fan, rings, matrix:
 * over a sweep of their parameters, extremes and out-of-range values
 * included, each bakes a file the glyph profile passes inside its
 * viewBox's budget (40 elements / 3 KB on 48×32, 80 / 6 KB wide); the
 * same params give the same string; the geometry is the shape it says.
 * Beside gen.test.ts (the same harness) so the families merge apart.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, validateSvg } from "../../../../scripts/validate-art.mjs";
import { type Drawing, GEN_PAINTS, toSvg } from "./base";
import { fan } from "./fan";
import { MATRIX_MARKS, matrix } from "./matrix";
import { rings } from "./rings";

const violations = (d: Drawing) => validateSvg(toSvg(d), { profile: PROFILES.glyph });
const elements = (d: Drawing) => (toSvg(d).match(/<(path|polyline|line|circle|rect|polygon|g)\b/g) ?? []).length;
const budget = (d: Drawing) => (d.viewBox === "0 0 48 32" ? { elements: 40, bytes: 3 * 1024 } : { elements: 80, bytes: 6 * 1024 });
const attr = (el: string, name: string) => new RegExp(`${name}="([^"]+)"`).exec(el)?.[1];
/** The circle subpaths of a path's d: [cx, cy, r] each (a subpath is M<left point>a<r> <r> … 2r 0 …). */
const circlesOf = (el: string): Array<[number, number, number]> =>
	[...attr(el, "d")!.matchAll(/M(-?[\d.]+) (-?[\d.]+)a([\d.]+) /g)].map(([, x, y, r]) => [Number(x) + Number(r), Number(y), Number(r)]);

type Sweep = Array<[string, Drawing]>;

const fanSweep: Sweep = [["default", fan()]];
for (let n = 2; n <= 8; n++) for (const dir of ["split", "merge"] as const) for (const dotted of [false, true]) {
	fanSweep.push([`${n} ${dir} dotted ${dotted}`, fan(n, { dir, dotted })]);
}
for (const paint of GEN_PAINTS) fanSweep.push([`paint ${paint}, accent lavender`, fan(5, { paint, accent: "lavender" })]);
fanSweep.push(
	["accent none", fan(4, { accent: "none" })],
	["out of range: n 0", fan(0)],
	["out of range: n 99", fan(99)],
	["out of range: n NaN", fan(Number.NaN)],
	["out of range: a dir that is not one", fan(3, { dir: "sideways" as never })],
	["out of range: a paint that is not one", fan(3, { paint: "none" as never, accent: "pink" as never })],
);

const ringsSweep: Sweep = [["default", rings()]];
for (let n = 1; n <= 6; n++) for (const fade of [false, true]) {
	ringsSweep.push([`chain ${n} fade ${fade}`, rings(n, { fade })]);
	for (const dotted of [0, 1, n - 1, 99]) ringsSweep.push([`concentric ${n} fade ${fade} dotted ${dotted}`, rings(n, { mode: "concentric", fade, dotted, accent: "blue" })]);
}
for (const paint of GEN_PAINTS) ringsSweep.push([`paint ${paint}`, rings(3, { mode: "concentric", paint, accent: "green" })]);
ringsSweep.push(
	["out of range: n 0", rings(0)],
	["out of range: n 50", rings(50, { mode: "concentric" })],
	["out of range: dotted -3", rings(3, { mode: "concentric", dotted: -3 })],
	["out of range: a mode that is not one", rings(3, { mode: "spiral" as never })],
);

/** Every cell on: the worst case for bytes. A checkerboard: the worst for buckets. */
const full = (rows: number, cols: number) => Array.from({ length: rows }, () => "1".repeat(cols)).join(";");
const checker = (rows: number, cols: number) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ((r + c) % 2 ? "1" : "0")).join("")).join(";");
const allCells = (rows: number, cols: number) => Array.from({ length: rows * cols }, (_, i): [number, number] => [Math.floor(i / cols), i % cols]);

const matrixSweep: Sweep = [["default", matrix()]];
for (const rows of [1, 2, 4, 6]) for (const cols of [1, 3, 6, 7, 10]) for (const mark of MATRIX_MARKS) {
	matrixSweep.push(
		[`${rows}×${cols} ${mark}`, matrix(rows, cols, { mark })],
		[`${rows}×${cols} ${mark} full`, matrix(rows, cols, { mark, on: full(rows, cols) })],
		[`${rows}×${cols} ${mark} checker, half hot, cursor`, matrix(rows, cols, { mark, on: checker(rows, cols), hot: allCells(rows, cols).filter((_, i) => i % 2 === 0), cursor: [rows - 1, cols - 1] })],
		[`${rows}×${cols} ${mark} every cell hot`, matrix(rows, cols, { mark, hot: allCells(rows, cols) })],
	);
}
// every size, every mark, fully lit and checkered, a hot cell and a cursor: the byte budget's worst cases
for (let rows = 1; rows <= 6; rows++) for (let cols = 1; cols <= 10; cols++) for (const mark of MATRIX_MARKS) for (const on of [full(rows, cols), checker(rows, cols)]) {
	matrixSweep.push([`${rows}×${cols} ${mark} ${on === full(rows, cols) ? "full" : "checker"} + hot + cursor`, matrix(rows, cols, { mark, on, hot: [0, 0], cursor: [rows - 1, 0] })]);
}
for (const paint of GEN_PAINTS) matrixSweep.push([`paint ${paint}`, matrix(4, 5, { paint, accent: "green", hot: [1, 1], on: "10101;01010" })]);
matrixSweep.push(
	["accent none + cursor", matrix(3, 3, { mark: "x", accent: "none", cursor: [1, 1], hot: [0, 0] })],
	["bitmasks", matrix(4, 6, { on: [0b101101, 0b010010, -7, Number.NaN, 1e9] })],
	["out of range: rows 0 cols 0", matrix(0, 0)],
	["out of range: rows 99 cols 99", matrix(99, 99, { on: full(99, 99) })],
	["out of range: cells off the grid", matrix(3, 3, { hot: [[5, 5], [-1, 0], [1.5, 1]], cursor: [9, 9] })],
	["out of range: not cells", matrix(3, 3, { hot: "nope" as never, cursor: 4 as never, on: {} as never })],
	["out of range: a mark that is not one", matrix(3, 3, { mark: "star" as never })],
);

describe("every field generator validates clean over its sweep", () => {
	for (const [family, sweep] of [["fan", fanSweep], ["rings", ringsSweep], ["matrix", matrixSweep]] as const) {
		test(`${family} (${sweep.length} cases)`, () => {
			for (const [name, d] of sweep) {
				const b = budget(d);
				expect(violations(d), `${family}: ${name}`).toEqual([]);
				expect(elements(d), `${family}: ${name} element count`).toBeLessThanOrEqual(b.elements);
				expect(toSvg(d).length, `${family}: ${name} bytes`).toBeLessThanOrEqual(b.bytes);
			}
		});
	}
	test("deterministic: the same params give the same string", () => {
		expect(toSvg(fan(6, { dir: "merge" }))).toBe(toSvg(fan(6, { dir: "merge" })));
		expect(toSvg(rings(5, { mode: "concentric", dotted: 2 }))).toBe(toSvg(rings(5, { mode: "concentric", dotted: 2 })));
		expect(toSvg(matrix(6, 10, { on: checker(6, 10) }))).toBe(toSvg(matrix(6, 10, { on: checker(6, 10) })));
	});
});

describe("fan geometry", () => {
	test("a split: an accent line in from the left edge to a node, n branches from the node to the right edge", () => {
		const d = fan(4);
		expect(d.viewBox).toBe("0 0 48 32");
		expect(d.children).toHaveLength(3);
		expect(d.children[0]).toMatch(/^<line x1="4" y1="16" x2="18" y2="16".*var\(--art-coral\)/);
		expect(d.children[2]).toBe('<circle cx="18" cy="16" r="1.5" fill="var(--art-coral)" />');
		const branches = attr(d.children[1], "d")!.split("M ").filter(Boolean).map((b) => b.trim());
		expect(branches).toHaveLength(4);
		expect(branches.map((b) => b.split(" ").slice(-2).map(Number))).toEqual([[44, 6], [44, 12.67], [44, 19.33], [44, 26]]);
		for (const b of branches) expect(b.startsWith("18 16 C ")).toBe(true);
		expect(d.children[1]).toContain("var(--art-cyan)");
	});
	test("a merge is the split mirrored", () => {
		const mirror = (s: string) => s.replace(/(x1?2?|cx)="([\d.]+)"/g, (_, k, v) => `${k}="${48 - Number(v)}"`);
		const split = fan(3);
		const merge = fan(3, { dir: "merge" });
		expect(merge.children[2]).toBe(mirror(split.children[2]));
		expect(attr(merge.children[0], "x1")).toBe("44");
		expect(attr(merge.children[0], "x2")).toBe("30");
		const ends = attr(merge.children[1], "d")!.split("M ").filter(Boolean).map((b) => b.trim()).map((b) => Number(b.split(" ").at(-2)));
		expect(ends).toEqual([4, 4, 4]);
	});
	test("dotted: dim hair dotted branches; accent none: the branches alone; n held to 2–8", () => {
		expect(fan(4, { dotted: true }).children[1]).toMatch(/var\(--glyph-dim\).*stroke-width="1".*stroke-dasharray="0.01 3.99"/);
		expect(fan(4, { accent: "none" }).children).toHaveLength(1);
		expect(toSvg(fan(1))).toBe(toSvg(fan(2)));
		expect(toSvg(fan(20))).toBe(toSvg(fan(8)));
	});
});

describe("rings geometry", () => {
	test("a chain: n equal rings in a row, overlapping, centred; fade dims the last", () => {
		const d = rings(4, { fade: true });
		expect(d.children).toHaveLength(4);
		const cs = d.children.map((c) => [Number(attr(c, "cx")), Number(attr(c, "cy")), Number(attr(c, "r"))]);
		for (const [, cy, r] of cs) expect([cy, r]).toEqual([16, 6]);
		const pitch = cs[1][0] - cs[0][0];
		expect(pitch).toBeLessThan(12); // overlapping
		expect((cs[0][0] + cs[3][0]) / 2).toBeCloseTo(24, 1);
		expect(d.children[3]).toContain("var(--glyph-dim)");
		expect(d.children[2]).toContain("var(--art-coral)");
	});
	test("six rings shrink to fit the safe width", () => {
		const cs = rings(6).children.map((c) => [Number(attr(c, "cx")), Number(attr(c, "r"))]);
		expect(cs[0][0] - cs[0][1]).toBeGreaterThanOrEqual(3.99);
		expect(cs[5][0] + cs[5][1]).toBeLessThanOrEqual(44.01);
	});
	test("concentric: n rings on the centre out to r 12, the outer `dotted` as guides, a centre dot when accented", () => {
		const d = rings(3, { mode: "concentric", dotted: 2, accent: "blue" });
		expect(d.children).toHaveLength(4);
		expect(d.children.slice(0, 3).map((c) => Number(attr(c, "r")))).toEqual([4, 8, 12]);
		expect(d.children[0]).toContain("var(--art-coral)");
		for (const c of d.children.slice(1, 3)) expect(c).toMatch(/var\(--glyph-dim\).*stroke-dasharray="0.01 3.99"/);
		expect(d.children[3]).toBe('<circle cx="24" cy="16" r="1.5" fill="var(--art-cyan)" />');
		// dotted never takes the innermost
		expect(rings(3, { mode: "concentric", dotted: 9 }).children[0]).toContain("var(--art-coral)");
	});
});

describe("matrix geometry", () => {
	test("the default is 4 × 5 hollow blue pips at a pitch of 5, centred, in one element", () => {
		const d = matrix();
		expect(d.children).toHaveLength(1);
		expect(d.children[0]).toMatch(/fill="none" stroke="var\(--art-cyan\)" stroke-width="1"/);
		const cs = circlesOf(d.children[0]);
		expect(cs).toHaveLength(20);
		expect(cs[0]).toEqual([14, 8.5, 1.9]);
		expect(cs[19]).toEqual([34, 23.5, 1.9]);
	});
	test("hot cells take the accent, drawn over the rest", () => {
		const d = matrix(4, 5, { hot: [2, 2] });
		expect(d.children).toHaveLength(2);
		expect(d.children[1]).toContain("var(--art-coral)");
		expect(circlesOf(d.children[1])).toEqual([[24, 18.5, 1.9]]);
	});
	test("a pattern: lit cells filled in the paint, the rest hollow and dim; bitmasks read MSB-left", () => {
		const d = matrix(2, 3, { on: "101;010" });
		const dim = d.children.find((c) => c.includes("glyph-dim"))!;
		const lit = d.children.find((c) => c.includes('fill="var(--art-cyan)"'))!;
		expect(circlesOf(lit).map(([x, y]) => [x, y])).toEqual([[19, 13.5], [29, 13.5], [24, 18.5]]);
		expect(circlesOf(dim)).toHaveLength(3);
		expect(toSvg(matrix(2, 3, { on: [0b101, 0b010] }))).toBe(toSvg(d));
	});
	test("x marks: lit cells ×, the rest dim o; a cursor is a square round its cell", () => {
		const d = matrix(3, 3, { mark: "x", on: "100;010;001", cursor: [1, 1] });
		const cross = d.children.find((c) => c.includes("var(--art-cyan)"))!;
		expect(attr(cross, "d")!.match(/M /g)).toHaveLength(6); // three ×, two strokes each
		expect(circlesOf(d.children.find((c) => c.includes("glyph-dim"))!)).toHaveLength(6);
		const rect = d.children.at(-1)!;
		expect(rect).toMatch(/^<rect x="21.5" y="13.5" width="5" height="5".*var\(--art-coral\)/);
	});
	test("past six columns it goes wide; six rows tighten the pitch so pips never touch", () => {
		expect(matrix(4, 6).viewBox).toBe("0 0 48 32");
		expect(matrix(4, 7).viewBox).toBe("0 0 96 32");
		const cs = circlesOf(matrix(6, 10).children[0]);
		expect(cs).toHaveLength(60);
		const pitch = cs[1][0] - cs[0][0];
		expect(2 * cs[0][2]).toBeLessThan(pitch - 0.8);
		for (const [, y, r] of cs) {
			expect(y - r).toBeGreaterThanOrEqual(3.99);
			expect(y + r).toBeLessThanOrEqual(28.01);
		}
	});
	test("the whole of a 6 × 10 grid is a handful of elements", () => {
		expect(matrix(6, 10, { on: checker(6, 10), hot: allCells(6, 10), cursor: [0, 0] }).children.length).toBeLessThanOrEqual(6);
	});
});
