/**
 * Iso and perspective: the axes are the post-art language's true 30°, the
 * solids draw their three visible faces, the grid foreshortens. Their
 * validity per target is in kit.test.ts. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { ISO_X, ISO_Y, ISO_Z, iso, isoBox, isoCoil, isoCylinder, isoEllipse, isoPlane, isoRoundBox, isoRoundRect, vanishingGrid } from "./iso";
import { kit } from "./kit";
import { round } from "./geometry";
import { PROFILES, validateSvg } from "../../../scripts/validate-art.mjs";

const g = kit("glyph");
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const pointsOf = (el: string): string[] => /points="([^"]+)"/.exec(el)![1].split(" ");
const dOf = (el: string): string => /d="([^"]+)"/.exec(el)![1];
/** Every `x y` pair a path visits (its M and L ends and its arcs' ends), as numbers. */
const stops = (d: string): [number, number][] =>
	[...d.matchAll(/(?:M|L) (-?[\d.]+) (-?[\d.]+)|A [\d.]+ [\d.]+ \d+ [01] [01] (-?[\d.]+) (-?[\d.]+)/g)].map((m) =>
		m[1] !== undefined ? [Number(m[1]), Number(m[2])] : [Number(m[3]), Number(m[4])],
	);
const arcs = (d: string) => [...d.matchAll(/A ([\d.]+) ([\d.]+) (\d+) ([01]) ([01]) (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
	rx: Number(m[1]),
	ry: Number(m[2]),
	rot: Number(m[3]),
	sweep: Number(m[5]),
	to: [Number(m[6]), Number(m[7])] as [number, number],
}));
const clean = (children: string) => validateSvg(g.svg({ viewBox: "0 0 96 64", children }), { profile: PROFILES.glyph });

describe("the projection", () => {
	test("the axes are (0.866, 0.5), (-0.866, 0.5) and (0, -1)", () => {
		expect(ISO_X).toEqual([0.87, 0.5]);
		expect(ISO_Y).toEqual([-0.87, 0.5]);
		expect(ISO_Z).toEqual([0, -1]);
		expect(iso(40, 0, 0)).toEqual([34.64, 20]);
		expect(iso(0, 40, 0)).toEqual([-34.64, 20]);
		expect(iso(0, 0, 40)).toEqual([0, -40]);
	});

	test("an iso edge has slope tan 30°, and the origin lands at `at`", () => {
		const [x, y] = iso(10, 0, 0);
		expect(y / x).toBeCloseTo(Math.tan(Math.PI / 6), 2);
		expect(iso(0, 0, 0, [24, 16])).toEqual([24, 16]);
		expect(iso(10, 10, 0, [24, 16])).toEqual([24, 26]);
	});
});

describe("the solids", () => {
	test("a box is three faces meeting at its nearest bottom corner, the top ink and the sides the plate unless said", () => {
		const box = isoBox(g, 24, 28, 12, 12, 10, { right: "blue" });
		const faces = box.split("\n");
		expect(faces).toHaveLength(3);
		expect(faces.every((f) => f.startsWith("<polygon"))).toBe(true);
		expect(faces[0]).toContain('fill="currentColor"');
		expect(faces[1]).toContain('fill="var(--art-cyan)"');
		expect(faces[2]).toContain('fill="none"');
		// The top face's near corner sits h above the placement; the sides start on it.
		expect(pointsOf(faces[0])).toContain("24,18");
		expect(pointsOf(faces[1])[0]).toBe("24,28");
		expect(pointsOf(faces[2])[0]).toBe("24,28");
		// The side faces run along the axes: the right face's bottom edge is (0.866·12, −0.5·12) from the corner.
		expect(pointsOf(faces[1])[1]).toBe("34.39,22");
		expect(pointsOf(faces[2])[1]).toBe("13.61,22");
		expect(g.isoBox(24, 28, 12, 12, 10)).toBe(isoBox(g, 24, 28, 12, 12, 10));
	});

	test("a cylinder's ellipses are r by r/2; two elements, the base's front arc only", () => {
		const cyl = isoCylinder(g, 24, 27, 8, 14, { side: "green" });
		const [body, disc] = cyl.split("\n");
		expect(disc).toContain('<ellipse cx="24" cy="13" rx="8" ry="4"');
		expect(body).toContain('fill="var(--art-green)"');
		expect(count(body, /A 8 4 /g)).toBe(2);
		// Down the left side, the front of the base (clockwise on screen is sweep 1; left to right along the bottom is 0), up the right, the front of the top back.
		expect(body).toContain("M 16 13 L 16 27 A 8 4 0 0 0 32 27 L 32 13 A 8 4 0 0 1 16 13 Z");
		expect(g.isoCylinder(24, 27, 8, 14)).toBe(isoCylinder(g, 24, 27, 8, 14));
	});

	test("a cylinder lying along x runs down-right from its base; its discs stand on the yz plane, rotated 120°, and the near cap is the disc", () => {
		const [body, disc] = isoCylinder(g, 30, 20, 6, 20, { axis: "x", top: "none" }).split("\n");
		// The cap's centre is h along ISO_X from the base.
		const cap = iso(20, 0, 0, [30, 20]);
		expect(cap).toEqual([47.32, 30]);
		// The disc starts at its major-axis end r·(−0.5, 0.866) from the centre.
		expect(disc).toContain(`d="M ${round(cap[0] - 3)} ${round(cap[1] + 5.2)} A 6 3 120 1 0`);
		// The body starts at the cap's other end and runs to the base's, parallel to ISO_X.
		const [a, b] = stops(dOf(body));
		expect(a).toEqual([round(cap[0] + 3), round(cap[1] - 5.2)]);
		expect(b).toEqual([33, 14.8]);
		expect((a[1] - b[1]) / (a[0] - b[0])).toBeCloseTo(Math.tan(Math.PI / 6), 2);
		expect(arcs(dOf(body)).every((x) => x.rx === 6 && x.ry === 3 && x.rot === 120)).toBe(true);
		expect(clean(isoCylinder(g, 30, 20, 6, 20, { axis: "y", side: "blue" }))).toEqual([]);
	});

	test("an iso ellipse is a 2:1 disc: flat an <ellipse>, on a face a path of two half arcs at the face's rotation", () => {
		expect(isoEllipse(g, 24, 16, 10, { fill: "blue" })).toBe('<ellipse cx="24" cy="16" rx="10" ry="5" fill="var(--art-cyan)" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />');
		const onX = dOf(isoEllipse(g, 24, 16, 10, { axis: "x" }));
		const onY = dOf(isoEllipse(g, 24, 16, 10, { axis: "y" }));
		expect(arcs(onX).map((a) => a.rot)).toEqual([120, 120]);
		expect(arcs(onY).map((a) => a.rot)).toEqual([60, 60]);
		// The ends of the major axis are r from the centre, at right angles to the axis's projection.
		const [p0, p1] = stops(onX);
		expect(Math.hypot(p0[0] - 24, p0[1] - 16)).toBeCloseTo(10, 1);
		expect(Math.hypot(p1[0] - 24, p1[1] - 16)).toBeCloseTo(10, 1);
		expect((p0[0] - 24) * ISO_X[0] + (p0[1] - 16) * ISO_X[1]).toBeCloseTo(0, 1);
		expect(g.isoEllipse(24, 16, 10)).toBe(isoEllipse(g, 24, 16, 10));
	});

	test("a rounded rectangle's corner arcs are the true projection (c·√1.5 by c/√2), joining edges at their tangent points; a pill at c = d/2", () => {
		const d = dOf(isoRoundRect(g, 60, 55, 54, 26, 5));
		const a = arcs(d);
		expect(a).toHaveLength(4);
		expect(a.every((x) => x.rx === round(5 * Math.sqrt(1.5)) && x.ry === round(5 / Math.SQRT2))).toBe(true);
		// The same way round on every corner, and the tangent points sit 5 in from the sharp corners along the edges.
		expect(new Set(a.map((x) => x.sweep)).size).toBe(1);
		expect(stops(d)[0]).toEqual(iso(0, -5, 0, [60, 55]));
		expect(a[3].to).toEqual(iso(0, -5, 0, [60, 55]));
		// A pill: the corners clamp to d/2 and the short edges vanish — the arcs of adjacent corners meet.
		const pill = dOf(isoRoundRect(g, 60, 55, 54, 26, 40));
		const s = stops(pill);
		expect(s[0]).toEqual(s[1]);
		expect(clean(isoRoundRect(g, 60, 55, 54, 26, 5, { paint: "lavender", weight: "hair" }))).toEqual([]);
		expect(g.isoRoundRect(60, 55, 54, 26, 5)).toBe(isoRoundRect(g, 60, 55, 54, 26, 5));
	});

	test("a rounded box is a body and a top, the body's verticals at the outline's leftmost and rightmost points", () => {
		const [body, top] = isoRoundBox(g, 60, 55, 54, 26, 6, 5, { side: "lavender", top: "none", paint: "lavender" }).split("\n");
		expect(body).toContain('fill="var(--art-lavender)"');
		expect(top).toContain('fill="none"');
		const s = stops(dOf(body));
		// The first vertical: the leftmost point of the top outline, straight down h.
		expect(s[0][0]).toBe(s[1][0]);
		expect(s[1][1] - s[0][1]).toBe(6);
		// It stands at the sharp corner's x plus c·(√3 − √1.5), the round corner's bulge.
		const corner = iso(-54, 0, 6, [60, 55]);
		expect(s[0][0]).toBeCloseTo(corner[0] + 5 * (Math.sqrt(3) - Math.sqrt(1.5)), 1);
		expect(s[0][1]).toBeCloseTo(corner[1], 1);
		// Every x stays inside the box's screen extent; the top outline is the round rect at h.
		expect(Math.min(...s.map((p) => p[0]))).toBeGreaterThanOrEqual(corner[0]);
		expect(top).toContain(`d="${dOf(isoRoundRect(g, 60, 49, 54, 26, 5))}"`);
		expect(arcs(dOf(body))).toHaveLength(6);
		expect(clean(isoRoundBox(g, 60, 55, 54, 26, 6, 5))).toEqual([]);
		expect(g.isoRoundBox(60, 55, 54, 26, 6, 5)).toBe(isoRoundBox(g, 60, 55, 54, 26, 6, 5));
	});

	test("a coil is one path of four cubics a turn, from the front of its base to the top, its loops 2:1", () => {
		const coil = isoCoil(g, 48, 50, 14, 34, 4, { paint: "red" });
		const d = dOf(coil);
		expect(count(d, / C /g)).toBe(16);
		expect(d.startsWith("M 48 57")).toBe(true);
		// The last point is at the top, at the front of the top loop.
		const last = d.split(" C ").pop()!.split(" ").slice(-2).map(Number);
		expect(last).toEqual([48, 23]);
		// A quarter turn on: the loop's right extreme, r out and a quarter of the pitch up.
		const first = d.split(" C ")[1].split(" ").slice(-2).map(Number);
		expect(first).toEqual([62, round(50 - 34 / 16)]);
		expect(clean(coil)).toEqual([]);
		expect(g.isoCoil(48, 50, 14, 34, 4)).toBe(isoCoil(g, 48, 50, 14, 34, 4));
	});

	test("a plane is a rhombus, and a grid path with (nx−1)+(ny−1) lines when asked", () => {
		expect(isoPlane(g, 24, 30, 20, 20).split("\n")).toHaveLength(1);
		const [rhombus, grid] = isoPlane(g, 24, 30, 20, 10, { grid: [5, 2] }).split("\n");
		expect(pointsOf(rhombus)).toHaveLength(4);
		expect(pointsOf(rhombus)[0]).toBe("24,30");
		expect(count(grid, /M /g)).toBe(4 + 1);
		expect(grid).toContain('stroke="var(--glyph-dim)"');
	});

	test("a vanishing grid fans cols lines from the point and crosses rows lines at 1, 1/2, 1/3 … of the height", () => {
		const d = /d="([^"]+)"/.exec(vanishingGrid(g, 24, 8, 44, 22, 3, 5))![1];
		expect(count(d, /M /g)).toBe(5 + 3);
		expect(d).toContain("M 24 8 L 2 30");
		expect(d).toContain("M 24 8 L 46 30");
		expect(d).toContain("M 2 30 L 46 30");
		expect(d).toContain("M 13 19 L 35 19");
		expect(d).toContain("M 16.67 15.33 L 31.33 15.33");
	});
});
