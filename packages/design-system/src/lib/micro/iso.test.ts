/**
 * Iso and perspective: the axes are the post-art language's true 30°, the
 * solids draw their three visible faces, the grid foreshortens. Their
 * validity per target is in kit.test.ts. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { ISO_X, ISO_Y, ISO_Z, iso, isoBox, isoCylinder, isoPlane, vanishingGrid } from "./iso";
import { kit } from "./kit";

const g = kit("glyph");
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const pointsOf = (el: string): string[] => /points="([^"]+)"/.exec(el)![1].split(" ");

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
		expect(body).toContain("V 27 A 8 4 0 0 0 32 27");
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
