import { describe, expect, test } from "bun:test";
import { MIN_SHOWN, formatReads, getPathStats, type PageviewsLedger } from "./pageviews";
import committed from "../data/pageviews.json";

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
