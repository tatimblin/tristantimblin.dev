/**
 * Hidden lines: the hull of a silhouette, and segments cut outside it.
 * `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { clipOutside, convexHull, edges, type Segment, segmentsD } from "./clip";
import type { Point } from "./geometry";

const SQUARE: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("convexHull", () => {
	test("drops the interior, the collinear and the repeated points", () => {
		const h = convexHull([[0, 0], [5, 0], [10, 0], [10, 10], [5, 5], [0, 10], [0, 0], [10, 10]]);
		expect(h).toHaveLength(4);
		expect(new Set(h.map((p) => p.join(",")))).toEqual(new Set(["0,0", "10,0", "10,10", "0,10"]));
	});

	test("an iso slab's eight corners give its six-sided silhouette", () => {
		const p = (x: number, y: number, z: number): Point => [0.866 * (x - y), 0.5 * (x + y) - z];
		const corners = [0, 40].flatMap((x) => [0, 20].flatMap((y) => [0, 4].map((z) => p(x, y, z))));
		expect(convexHull(corners)).toHaveLength(6);
	});

	test("fewer than three distinct points come back deduplicated", () => {
		expect(convexHull([[1, 1], [1, 1], [2, 2]])).toEqual([[1, 1], [2, 2]]);
	});
});

describe("edges", () => {
	test("a closed outline, the last edge back to the first point", () => {
		const e = edges([[0, 0], [1, 0], [1, 1]]);
		expect(e).toEqual([[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 0]]]);
	});
});

describe("clipOutside", () => {
	test("a segment through the polygon comes back in two, the inside dropped", () => {
		const out = clipOutside([[[-5, 5], [15, 5]]], SQUARE);
		expect(out).toEqual([[[-5, 5], [0, 5]], [[10, 5], [15, 5]]]);
	});

	test("wholly inside is gone; wholly outside is untouched", () => {
		const inside: Segment = [[2, 2], [8, 8]];
		const away: Segment = [[20, 0], [30, 10]];
		expect(clipOutside([inside, away], SQUARE)).toEqual([away]);
	});

	test("one end inside: the part outside remains", () => {
		expect(clipOutside([[[5, 5], [5, 20]]], SQUARE)).toEqual([[[5, 10], [5, 20]]]);
	});

	test("either winding: the same cut", () => {
		const seg: Segment[] = [[[-5, 5], [15, 5]]];
		expect(clipOutside(seg, [...SQUARE].reverse())).toEqual(clipOutside(seg, SQUARE));
	});

	test("a segment along an edge, outside, is kept; a degenerate polygon hides nothing", () => {
		expect(clipOutside([[[-5, -1], [15, -1]]], SQUARE)).toEqual([[[-5, -1], [15, -1]]]);
		expect(clipOutside([[[0, 0], [5, 5]]], [[0, 0], [5, 5]])).toEqual([[[0, 0], [5, 5]]]);
	});
});

describe("segmentsD", () => {
	test("a move and a line each, rounded to two decimals", () => {
		expect(segmentsD([[[0, 0], [1 / 3, 2]], [[5, 5], [6, 6]]])).toBe("M 0 0 L 0.33 2 M 5 5 L 6 6");
		expect(segmentsD([])).toBe("");
	});
});
