/**
 * Hidden lines: the hull of a silhouette, and segments cut outside it.
 * `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { chain, clipOutside, clipOutsidePolygon, convexHull, edges, insidePolygon, type Segment, segmentsD } from "./clip";
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

/** A U: a 30 × 20 block with a 10-wide notch cut 15 down from the top. */
const U: Point[] = [[0, 0], [10, 0], [10, 15], [20, 15], [20, 0], [30, 0], [30, 20], [0, 20]];
/** A comb: three teeth hanging from a spine along the bottom. */
const COMB: Point[] = [[0, 0], [4, 0], [4, 10], [8, 10], [8, 0], [12, 0], [12, 10], [16, 10], [16, 0], [20, 0], [20, 14], [0, 14]];
/** Rounded to a hundredth, as a file would write it: floating crossings compare cleanly. */
const r = (segs: Segment[]) => segs.map(([a, b]) => [a.map((v) => Math.round(v * 100) / 100), b.map((v) => Math.round(v * 100) / 100)]);

describe("insidePolygon", () => {
	test("the notch of a U is outside; its arms and base inside", () => {
		expect(insidePolygon([15, 5], U)).toBe(false);
		expect(insidePolygon([5, 5], U)).toBe(true);
		expect(insidePolygon([15, 18], U)).toBe(true);
		expect(insidePolygon([40, 5], U)).toBe(false);
	});

	test("a point on the outline counts as inside; either winding agrees", () => {
		expect(insidePolygon([15, 15], U)).toBe(true);
		expect(insidePolygon([0, 10], U)).toBe(true);
		expect(insidePolygon([15, 5], [...U].reverse())).toBe(false);
		expect(insidePolygon([5, 5], [...U].reverse())).toBe(true);
	});
});

describe("clipOutsidePolygon", () => {
	test("a concave notch: a line across the U's arms shows only in the notch and past the ends", () => {
		expect(r(clipOutsidePolygon([[[-5, 5], [35, 5]]], U))).toEqual([[[-5, 5], [0, 5]], [[10, 5], [20, 5]], [[30, 5], [35, 5]]]);
	});

	test("entering and leaving several times: a line through a comb's teeth is cut at every tooth", () => {
		const out = r(clipOutsidePolygon([[[-2, 5], [22, 5]]], COMB));
		expect(out).toEqual([[[-2, 5], [0, 5]], [[4, 5], [8, 5]], [[12, 5], [16, 5]], [[20, 5], [22, 5]]]);
	});

	test("collinear edges: a line along the notch's floor is hidden there, what runs on past is kept", () => {
		// y = 15 runs along the notch's floor (10–20) and through both arms: all of 0–30 is the solid's.
		expect(r(clipOutsidePolygon([[[-5, 15], [35, 15]]], U))).toEqual([[[-5, 15], [0, 15]], [[30, 15], [35, 15]]]);
		// Along the top edge of an arm and on over the notch: the edge is hidden, the open notch shows.
		expect(r(clipOutsidePolygon([[[0, 0], [30, 0]]], U))).toEqual([[[10, 0], [20, 0]]]);
	});

	test("a line through a vertex it only touches stays whole", () => {
		const tri: Point[] = [[0, 0], [10, -10], [20, 0]];
		const seg: Segment = [[0, -10], [20, -10]];
		expect(clipOutsidePolygon([seg], tri)).toEqual([seg]);
	});

	test("wholly inside is gone, wholly outside untouched, a degenerate polygon hides nothing", () => {
		const inArm: Segment = [[2, 2], [8, 12]];
		const inNotch: Segment = [[12, 2], [18, 12]];
		expect(clipOutsidePolygon([inArm, inNotch], U)).toEqual([inNotch]);
		expect(clipOutsidePolygon([inArm], [[0, 0], [5, 5]])).toEqual([inArm]);
	});

	test("on a convex polygon it cuts as clipOutside does, either winding", () => {
		const segs: Segment[] = [[[-5, 5], [15, 5]], [[5, 5], [5, 20]], [[2, 2], [8, 8]], [[20, 0], [30, 10]], [[-5, -1], [15, -1]]];
		expect(r(clipOutsidePolygon(segs, SQUARE))).toEqual(r(clipOutside(segs, SQUARE)));
		expect(r(clipOutsidePolygon(segs, [...SQUARE].reverse()))).toEqual(r(clipOutside(segs, SQUARE)));
	});

	test("a ridge hides the range behind it: a polyline dipping under a sawtooth comes back in pieces", () => {
		const ridge: Point[] = [[0, 20], [10, 0], [20, 20], [30, 0], [40, 20]];
		const solid: Point[] = [...ridge, [40, 40], [0, 40]];
		const out = clipOutsidePolygon(chain([[0, 8], [40, 8]]), solid);
		expect(out).toHaveLength(3);
		expect(r(out)).toEqual([[[0, 8], [6, 8]], [[14, 8], [26, 8]], [[34, 8], [40, 8]]]);
	});
});

describe("chain", () => {
	test("an open line: one segment per step, no closing edge", () => {
		expect(chain([[0, 0], [1, 0], [1, 1]])).toEqual([[[0, 0], [1, 0]], [[1, 0], [1, 1]]]);
		expect(chain([[0, 0]])).toEqual([]);
	});
});

describe("segmentsD", () => {
	test("a move and a line each, rounded to two decimals", () => {
		expect(segmentsD([[[0, 0], [1 / 3, 2]], [[5, 5], [6, 6]]])).toBe("M 0 0 L 0.33 2 M 5 5 L 6 6");
		expect(segmentsD([])).toBe("");
	});
});
