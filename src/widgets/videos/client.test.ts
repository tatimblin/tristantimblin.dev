import { describe, expect, test } from "bun:test";
import { chromeAt, liftAt } from "./client";

describe("chromeAt", () => {
	test("hidden until the run begins, shown from the end of the range on", () => {
		expect(chromeAt(0, 650)).toBe(0);
		expect(chromeAt(602, 650)).toBe(0);
		expect(chromeAt(603, 650)).toBeCloseTo(1 / 48);
		expect(chromeAt(626, 650)).toBeCloseTo(0.5);
		expect(chromeAt(650, 650)).toBe(1);
		expect(chromeAt(2000, 650)).toBe(1);
	});

	test("begins exactly run px before the range ends", () => {
		expect(chromeAt(611, 650)).toBeGreaterThan(0);
		expect(chromeAt(610, 650, 40)).toBe(0);
		expect(chromeAt(630, 650, 40)).toBe(0.5);
	});

	test("a page's end that comes first is where it finishes", () => {
		// The fallback passes min(travel, the page's scroll) as the range.
		expect(chromeAt(300, 300)).toBe(1);
		expect(chromeAt(252, 300)).toBe(0);
	});

	test("a page shorter than the run fades over what it has", () => {
		expect(chromeAt(0, 20)).toBe(0);
		expect(chromeAt(10, 20)).toBe(0.5);
		expect(chromeAt(20, 20)).toBe(1);
	});

	test("nothing to dock over: shown", () => {
		expect(chromeAt(0, 0)).toBe(1);
	});
});

describe("liftAt", () => {
	test("parked at rest and docked at the end of the range", () => {
		expect(liftAt(0, 650)).toBe(-650);
		expect(liftAt(650, 650)).toBeCloseTo(0);
		expect(liftAt(900, 650)).toBeCloseTo(0);
	});

	test("the card is within a few px of its cell when the fade starts", () => {
		expect(Math.abs(liftAt(650 - 48, 650))).toBeLessThan(6);
	});
});
