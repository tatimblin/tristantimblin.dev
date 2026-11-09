import { describe, expect, test } from "bun:test";
import { MIN_SHOWN, formatReads, getPathStats, topByReads, type PageviewsLedger } from "./pageviews";
import committed from "../data/pageviews.json";

describe("topByReads", () => {
	const ledger: PageviewsLedger = {
		updated: "2026-10-20",
		paths: {
			"/a/": { reads: 5, recent: 1 },
			"/b/": { reads: 30, recent: 1 },
			"/c/": { reads: 5, recent: 1 },
		},
	};
	const top = (items: string[], count: number) => topByReads(items, (item) => item, count, ledger);

	test("ranks by reads and takes the count", () => {
		expect(top(["/a/", "/b/", "/c/"], 1)).toEqual(["/b/"]);
	});

	test("ties keep the order given", () => {
		expect(top(["/c/", "/a/", "/b/"], 3)).toEqual(["/b/", "/c/", "/a/"]);
	});

	test("an uncounted item still fills the row, last", () => {
		expect(top(["/none/", "/a/"], 2)).toEqual(["/a/", "/none/"]);
	});

	test("does not reorder the caller's list", () => {
		const items = ["/a/", "/b/"];
		top(items, 2);
		expect(items).toEqual(["/a/", "/b/"]);
	});
});

describe("formatReads", () => {
	test("hides counts under the threshold", () => {
		expect(MIN_SHOWN).toBe(10);
		expect(formatReads(0)).toBeNull();
		expect(formatReads(9)).toBeNull();
		expect(formatReads(10)).toBe("10 reads");
	});

	test("groups thousands, and takes a unit", () => {
		expect(formatReads(212)).toBe("212 reads");
		expect(formatReads(1204)).toBe("1,204 reads");
		expect(formatReads(212, "views")).toBe("212 views");
	});

	test("no count is no label", () => {
		expect(formatReads(null)).toBeNull();
		expect(formatReads(undefined)).toBeNull();
		expect(formatReads(Number.NaN)).toBeNull();
	});
});

describe("getPathStats", () => {
	const ledger: PageviewsLedger = {
		updated: "2026-10-20",
		paths: { "/txt/mega-desk/": { reads: 212, recent: 40 } },
	};

	test("looks a page up by its normalised path", () => {
		expect(getPathStats("/txt/mega-desk/", ledger)).toEqual({ reads: 212, recent: 40 });
		expect(getPathStats("/txt/Mega-Desk?x=1", ledger)).toEqual({ reads: 212, recent: 40 });
	});

	test("null for a page with no counts, or a junk path", () => {
		expect(getPathStats("/txt/other/", ledger)).toBeNull();
		expect(getPathStats("//junk", ledger)).toBeNull();
	});

	test("reads the committed ledger by default", () => {
		expect(typeof committed.paths).toBe("object");
		expect(() => getPathStats("/txt/mega-desk/")).not.toThrow();
	});
});
