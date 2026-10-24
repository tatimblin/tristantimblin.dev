import { describe, expect, test } from "bun:test";
import { gaugeOrder, litCount } from "./ring";

const inGap = (gap: number[]) => (p: number) => gap.includes(p);

describe("gaugeOrder", () => {
	test("starts just after the gap and runs round, gap left out", () => {
		expect(gaugeOrder([0, 1, 2, 3, 4, 5], inGap([1, 2]))).toEqual([3, 4, 5, 0]);
	});

	test("a gap that wraps the start (bottom-centre) still starts after it", () => {
		expect(gaugeOrder([0, 1, 2, 3, 4, 5], inGap([5, 0, 1]))).toEqual([2, 3, 4]);
	});

	test("no gap: every tick, from the first", () => {
		expect(gaugeOrder([0, 1, 2, 3], () => false)).toEqual([0, 1, 2, 3]);
	});

	test("all gap: nothing", () => {
		expect(gaugeOrder([0, 1, 2], () => true)).toEqual([]);
	});
});

describe("litCount", () => {
	test("none at 0, all at 1, rounded between", () => {
		expect(litCount(0, 47)).toBe(0);
		expect(litCount(1, 47)).toBe(47);
		expect(litCount(0.5656, 47)).toBe(27);
		expect(litCount(0.0659, 47)).toBe(3);
	});
});
