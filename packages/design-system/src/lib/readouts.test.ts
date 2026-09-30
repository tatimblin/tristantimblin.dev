import { describe, expect, test } from "bun:test";
import { activeIndex, numberStream, parseFormula, spokenFormula } from "./readouts";

describe("parseFormula", () => {
	test("a signed superscript run, the hyphen as a minus", () => {
		expect(parseFormula("z^-1")).toEqual([
			{ kind: "text", text: "z" },
			{ kind: "sup", text: "−1" },
		]);
	});
	test("a run stops at an operator; a group takes it all", () => {
		expect(parseFormula("x^3+1")).toEqual([
			{ kind: "text", text: "x" },
			{ kind: "sup", text: "3" },
			{ kind: "text", text: "+1" },
		]);
		expect(parseFormula("x^{n+1}")).toEqual([
			{ kind: "text", text: "x" },
			{ kind: "sup", text: "n+1" },
		]);
	});
	test("sub then sup; a dangling marker is text", () => {
		expect(parseFormula("x_n^2").map((p) => p.kind)).toEqual(["text", "sub", "sup"]);
		expect(parseFormula("a^")).toEqual([{ kind: "text", text: "a^" }]);
		expect(parseFormula("")).toEqual([]);
	});
});

describe("spokenFormula", () => {
	test("says what it draws", () => {
		expect(spokenFormula(parseFormula("z^-1"))).toBe("z to the minus 1");
		expect(spokenFormula(parseFormula("f_c"))).toBe("f sub c");
		expect(spokenFormula(parseFormula("x^3"))).toBe("x to the 3");
	});
});

describe("numberStream", () => {
	test("deterministic rows of digits", () => {
		const a = numberStream(7, 2, 10);
		expect(a).toEqual(numberStream(7, 2, 10));
		expect(a).toHaveLength(2);
		for (const row of a) expect(row).toMatch(/^\d{10}$/);
		expect(numberStream(8, 2, 10)).not.toEqual(a);
	});
	test("clamps and falls back", () => {
		expect(numberStream(1, 99, 99)).toHaveLength(8);
		expect(numberStream(1, 99, 99)[0]).toHaveLength(16);
		expect(numberStream(1, 0, 0)).toEqual([numberStream(1, 1, 1)[0]]);
		expect(numberStream("x" as unknown, "y" as unknown, Number.NaN)).toEqual(numberStream());
	});
});

describe("activeIndex", () => {
	test("clamped into the list", () => {
		expect(activeIndex(1, 3)).toBe(1);
		expect(activeIndex(9, 3)).toBe(2);
		expect(activeIndex(-2, 3)).toBe(0);
		expect(activeIndex("a", 3)).toBe(0);
		expect(activeIndex(0, 0)).toBe(-1);
	});
});
