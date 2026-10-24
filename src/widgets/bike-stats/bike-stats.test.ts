import { describe, expect, test } from "bun:test";
import { getBikeStats } from "./bike-stats";

const csv = (...rows: string[]) => ["date,rides,distance,duration", ...rows].join("\n");

describe("getBikeStats", () => {
	test("reads lifetime miles from the newest row, whole", () => {
		const stats = getBikeStats(csv("2026-09-01,10,20.4,7200", "2026-10-02,12,30.9,10800"));
		expect(stats?.miles).toBe(30);
	});

	test("mph is the latest riding month's, from the gaps between rows", () => {
		// October: 10 mi in 1 h, then 14 mi in 1 h → 24 mi / 2 h = 12 mph.
		// September's 20 mi in 2 h (10 mph) is a different month and not counted.
		const stats = getBikeStats(
			csv(
				"2026-09-01,1,0,0",
				"2026-09-20,5,20,7200",
				"2026-10-05,8,30,10800",
				"2026-10-20,11,44,14400",
			),
		);
		expect(stats?.mph).toBeCloseTo(12, 5);
	});

	test("a month with no riding yet reads the last month that had some", () => {
		const stats = getBikeStats(
			csv("2026-09-01,1,0,0", "2026-09-20,5,20,7200", "2026-10-03,5,20,7200"),
		);
		expect(stats?.mph).toBeCloseTo(10, 5);
	});

	test("rows out of order are sorted by date", () => {
		const stats = getBikeStats(csv("2026-10-20,11,44,14400", "2026-10-05,8,30,10800"));
		expect(stats?.miles).toBe(44);
		expect(stats?.mph).toBeCloseTo(14, 5);
	});

	test("a single row falls back to the lifetime average", () => {
		expect(getBikeStats(csv("2026-10-20,11,44,14400"))?.mph).toBeCloseTo(11, 5);
	});

	test("an empty file is null, not a throw", () => {
		expect(getBikeStats(csv())).toBeNull();
		expect(getBikeStats("")).toBeNull();
	});
});
