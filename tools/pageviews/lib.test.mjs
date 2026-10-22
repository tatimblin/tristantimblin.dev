import { describe, expect, test } from "bun:test";
import { mergeWindow } from "../lib/ledger.mjs";
import {
	BACKFILL_FROM,
	addHits,
	addTotals,
	buildDays,
	buildPathDays,
	hitsPage,
	hitsQuery,
	knownPaths,
	looksStale,
	planWindow,
	requestChunks,
	summarise,
	totalQuery,
	totalStats,
	trimLeadingZeros,
} from "./lib.mjs";

/* Fixtures in the shapes of GoatCounter's api.json: handlers.apiCountTotalResponse
   and handlers.apiHitsResponse, whose stats are goatcounter.HitListStat. */
const stat = (day, daily) => ({ day, daily, hourly: Array(24).fill(0) });

const TOTAL = {
	total: 31,
	total_events: 0,
	total_utc: 31,
	stats: [stat("2026-10-17", 0), stat("2026-10-18", 12), stat("2026-10-19", 19), stat("2026-10-20", 4)],
};

const HITS_PAGE_1 = {
	total: 40,
	more: true,
	hits: [
		{
			path_id: 7,
			path: "/txt/mega-desk/",
			title: "Mega desk",
			event: false,
			count: 9,
			max: 3,
			stats: [stat("2026-10-18", 4), stat("2026-10-19", 5)],
		},
		{
			path_id: 8,
			path: "/wp-login.php",
			title: "",
			event: false,
			count: 30,
			max: 30,
			stats: [stat("2026-10-18", 30)],
		},
	],
};

const HITS_PAGE_2 = {
	total: 40,
	more: false,
	hits: [
		{
			path_id: 9,
			path: "/TXT/Mega-Desk?utm_source=feed",
			title: "Mega desk",
			event: false,
			count: 1,
			max: 1,
			stats: [stat("2026-10-19", 1)],
		},
		{
			path_id: 10,
			path: "/demo/sutro/",
			title: "Sutro",
			event: false,
			count: 2,
			max: 2,
			stats: [stat("2026-10-19", 2), stat("2026-10-20", 0)],
		},
		{
			path_id: 11,
			path: "click-read",
			title: "",
			event: true,
			count: 5,
			max: 5,
			stats: [stat("2026-10-19", 5)],
		},
	],
};

const KNOWN = knownPaths({ posts: ["mega-desk", "tahoe-mountain-hair"], demos: ["sutro"] });

describe("planWindow", () => {
	const now = new Date("2026-10-21T14:00:00Z");

	test("a normal night re-reads 45 days through yesterday", () => {
		const ledger = { days: [{ date: "2026-10-01", visitors: 3 }], pathDays: [] };
		expect(planWindow({ now, ledger })).toEqual({
			since: "2026-09-06",
			until: "2026-10-20",
			reason: "nightly",
		});
	});

	test("an empty ledger backfills from 2026-07-01", () => {
		expect(planWindow({ now, ledger: { days: [], pathDays: [] } }).since).toBe(BACKFILL_FROM);
		expect(planWindow({ now, ledger: null }).since).toBe("2026-07-01");
	});

	test("--since wins", () => {
		const ledger = { days: [{ date: "2026-10-01", visitors: 3 }] };
		expect(planWindow({ now, ledger, sinceArg: "2026-08-15" })).toMatchObject({
			since: "2026-08-15",
			reason: "--since",
		});
	});

	test("rejects a malformed or future --since", () => {
		expect(() => planWindow({ now, sinceArg: "15/08/2026" })).toThrow(/YYYY-MM-DD/);
		expect(() => planWindow({ now, sinceArg: "2026-10-25" })).toThrow(/after it ends/);
	});
});

describe("requestChunks", () => {
	test("pads a UTC day each side, never past today, in contiguous chunks", () => {
		expect(requestChunks("2026-10-10", "2026-10-20", "2026-10-21")).toEqual([
			{ start: "2026-10-09T00:00:00Z", end: "2026-10-21T23:59:59Z" },
		]);
	});

	test("splits a backfill into 30-day chunks that neither gap nor overlap", () => {
		const chunks = requestChunks("2026-07-01", "2026-10-20", "2026-10-21");
		expect(chunks[0].start).toBe("2026-06-30T00:00:00Z");
		expect(chunks.at(-1).end).toBe("2026-10-21T23:59:59Z");
		for (let i = 1; i < chunks.length; i++) {
			const prevEnd = new Date(chunks[i - 1].end).getTime();
			expect(new Date(chunks[i].start).getTime() - prevEnd).toBe(1000);
		}
		expect(chunks.length).toBe(4);
	});
});

describe("query strings", () => {
	const chunk = { start: "2026-10-09T00:00:00Z", end: "2026-10-21T23:59:59Z" };

	test("/stats/total takes start and end", () => {
		expect(totalQuery(chunk)).toBe("start=2026-10-09T00%3A00%3A00Z&end=2026-10-21T23%3A59%3A59Z");
	});

	test("/stats/hits pages by excluding the path IDs seen, comma-separated", () => {
		const first = new URLSearchParams(hitsQuery(chunk));
		expect(first.get("limit")).toBe("100");
		expect(first.has("exclude_paths")).toBe(false);
		const next = new URLSearchParams(hitsQuery(chunk, [7, 8]));
		expect(next.get("exclude_paths")).toBe("7,8");
	});
});

describe("response shapes", () => {
	test("accepts the documented shapes", () => {
		expect(totalStats(TOTAL)).toHaveLength(4);
		expect(hitsPage(HITS_PAGE_1).more).toBe(true);
		expect(hitsPage(HITS_PAGE_2).more).toBe(false);
	});

	test("fails loudly on drift", () => {
		expect(() => totalStats({ total: 3 })).toThrow(/stats/);
		expect(() => hitsPage({ pages: [] })).toThrow(/hits/);
		expect(() => hitsPage({ hits: [{ path: "/" }] })).toThrow(/path_id/);
	});
});

describe("shaping", () => {
	test("site totals become a zero-filled daily series, summed across chunks", () => {
		const acc = addTotals(new Map(), TOTAL.stats);
		addTotals(acc, [stat("2026-10-18", 1)]); // the same GoatCounter day from a second chunk
		expect(buildDays(acc, "2026-10-16", "2026-10-19")).toEqual([
			{ date: "2026-10-16", visitors: 0 },
			{ date: "2026-10-17", visitors: 0 },
			{ date: "2026-10-18", visitors: 13 },
			{ date: "2026-10-19", visitors: 19 },
		]);
	});

	test("per-path rows: known pages only, normalised, no events, edge days dropped", () => {
		const acc = new Map();
		addHits(acc, hitsPage(HITS_PAGE_1).hits, KNOWN);
		addHits(acc, hitsPage(HITS_PAGE_2).hits, KNOWN);
		expect(buildPathDays(acc, "2026-10-18", "2026-10-19")).toEqual([
			{ date: "2026-10-18", path: "/txt/mega-desk/", visitors: 4 },
			{ date: "2026-10-19", path: "/demo/sutro/", visitors: 2 },
			{ date: "2026-10-19", path: "/txt/mega-desk/", visitors: 6 },
		]);
	});

	test("leading zero days go; zeros inside the record stay", () => {
		const days = [
			{ date: "a", visitors: 0 },
			{ date: "b", visitors: 2 },
			{ date: "c", visitors: 0 },
		];
		expect(trimLeadingZeros(days).map((d) => d.date)).toEqual(["b", "c"]);
		expect(trimLeadingZeros([{ date: "a", visitors: 0 }])).toEqual([]);
	});

	test("paths: all-time reads and the last 30 days", () => {
		const rows = [
			{ date: "2026-08-01", path: "/txt/mega-desk/", visitors: 100 },
			{ date: "2026-10-01", path: "/txt/mega-desk/", visitors: 10 },
			{ date: "2026-10-20", path: "/txt/mega-desk/", visitors: 2 },
			{ date: "2026-10-20", path: "/demo/sutro/", visitors: 12 },
		];
		const paths = summarise(rows, "2026-10-20");
		expect(paths).toEqual({
			"/demo/sutro/": { reads: 12, recent: 12 },
			"/txt/mega-desk/": { reads: 112, recent: 12 },
		});
		expect(Object.keys(paths)).toEqual(["/demo/sutro/", "/txt/mega-desk/"]);
	});

	test("known paths come from the slugs, normalised", () => {
		expect([...knownPaths({ posts: ["Mega-Desk"], demos: ["sutro"] })]).toEqual([
			"/txt/mega-desk/",
			"/demo/sutro/",
		]);
	});
});

describe("merge", () => {
	test("the window replaces its rows (down as well as up); older rows stay", () => {
		const existing = [
			{ date: "2026-10-01", path: "/txt/mega-desk/", visitors: 5 },
			{ date: "2026-10-01", path: "/demo/sutro/", visitors: 3 },
			{ date: "2026-10-10", path: "/txt/mega-desk/", visitors: 9 },
		];
		const fresh = [{ date: "2026-10-11", path: "/txt/mega-desk/", visitors: 1 }];
		const key = (row) => `${row.date}\t${row.path}`;
		expect(mergeWindow(existing, fresh, "2026-10-05", key)).toEqual([
			{ date: "2026-10-01", path: "/demo/sutro/", visitors: 3 },
			{ date: "2026-10-01", path: "/txt/mega-desk/", visitors: 5 },
			{ date: "2026-10-11", path: "/txt/mega-desk/", visitors: 1 },
		]);
	});
});

describe("stale-auth guard", () => {
	const zeros = [{ date: "2026-10-20", visitors: 0 }];

	test("an empty window on a week-old ledger is stale", () => {
		expect(looksStale([{ date: "2026-10-01", visitors: 4 }], zeros, "2026-10-20")).toBe(true);
	});

	test("an empty window before counting began, or in the first week, is not", () => {
		expect(looksStale([], zeros, "2026-10-20")).toBe(false);
		expect(looksStale([{ date: "2026-10-18", visitors: 4 }], zeros, "2026-10-20")).toBe(false);
	});

	test("any visitor in the window passes", () => {
		expect(
			looksStale([{ date: "2026-10-01", visitors: 4 }], [{ date: "2026-10-20", visitors: 1 }], "2026-10-20"),
		).toBe(false);
	});
});
