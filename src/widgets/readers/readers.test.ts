import { describe, expect, test } from "bun:test";
import committed from "../../data/pageviews.json";
import { buildViews, emptyNote, formatDay, getReaderStats, isDrawable } from "./readers";

const day = (date: string, visitors: number) => ({ date, visitors });

/** `n` consecutive days ending 2026-10-20, each with `visitors`. */
function series(n: number, visitors = 3) {
	const end = Date.parse("2026-10-20T00:00:00Z");
	return Array.from({ length: n }, (_, i) =>
		day(new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10), visitors),
	);
}

describe("getReaderStats", () => {
	test("reads the GoatCounter ledger's visitors, sorted", () => {
		const stats = getReaderStats({
			updated: "2026-10-20",
			days: [day("2026-10-20", 4), day("2026-10-19", 2), { date: 5, visitors: 9 }],
		});
		expect(stats).toEqual({
			updated: "2026-10-20",
			days: [day("2026-10-19", 2), day("2026-10-20", 4)],
		});
	});

	test("an empty or broken ledger is an empty series, not a throw", () => {
		expect(getReaderStats({ updated: null, days: [] })).toEqual({ updated: "", days: [] });
		expect(getReaderStats(null)).toEqual({ updated: "", days: [] });
		expect(getReaderStats({ days: "nope" }).days).toEqual([]);
	});

	test("the committed ledger parses", () => {
		expect(() => getReaderStats(committed)).not.toThrow();
	});
});

describe("the views over visitors", () => {
	test("totals are exact sums of visitors", () => {
		const [thirty] = buildViews(series(60, 3));
		expect(thirty.key).toBe("30d");
		expect(thirty.total).toBe(90);
		expect(isDrawable(thirty)).toBe(true);
		expect(thirty.points).toHaveLength(30);
		expect(thirty.points.at(-1)?.value).toBe(21); // a 7-day trailing sum of 3s
	});

	test("an empty ledger has nothing to draw", () => {
		expect(buildViews([]).filter(isDrawable)).toEqual([]);
	});
});

describe("the empty state", () => {
	test("before the first read", () => {
		expect(emptyNote([])).toBe("No visitors counted yet.");
		expect(emptyNote([day("2026-10-20", 0)])).toBe("No visitors counted yet.");
	});

	test("once counting has started", () => {
		expect(emptyNote([day("2026-10-19", 0), day("2026-10-20", 2)])).toBe(
			"Counting since Oct 20, 2026.",
		);
	});

	test("formatDay", () => {
		expect(formatDay("2026-07-30")).toBe("Jul 30, 2026");
		expect(formatDay("nope")).toBe("");
	});
});
