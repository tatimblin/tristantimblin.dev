/**
 * The pure half of tools/pageviews/fetch.mjs: the window, the query strings,
 * and the shaping of GoatCounter's responses into the committed ledger.
 * Everything here is exercised by lib.test.mjs against fixtures built from
 * GoatCounter's OpenAPI spec (https://www.goatcounter.com/api.json).
 *
 * THE METRIC IS VISITORS. GoatCounter 2.x stores visitors only: `daily` in a
 * HitListStat is "Total visitors for this day", per path for /stats/hits and
 * site-wide for /stats/total. There is no raw pageview count in the API, so
 * the ledger carries `visitors` and nothing called `views`. A post's "reads"
 * is the sum of its daily visitors: one person reading it on two days is two
 * reads, the same person reloading it is one.
 */
import { normalisePath } from "../../src/lib/analytics/path.ts";
import { addDays, dateRange, daysAgo } from "../lib/ledger.mjs";

/** How far back a normal night re-reads. */
const REFRESH_DAYS = 45;

/**
 * Where a first run (an empty ledger) starts: before the history imported into
 * GoatCounter from the RUM ledger (readers.json, 2026-07-30 → 2026-10-17), so
 * the backfill picks it up. The nightly window alone would never reach it.
 */
export const BACKFILL_FROM = "2026-07-01";

/** Days per request. A long range is split so no one response is huge. */
const CHUNK_DAYS = 30;

/** /stats/hits page size: the API's maximum. */
const HITS_LIMIT = 100;

/** "reads" in a page's `recent` figure. */
const RECENT_DAYS = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a ledger has anything in it yet. */
const isEmptyLedger = (ledger) => !ledger?.days?.length && !ledger?.pathDays?.length;

/**
 * The days to (re-)read: through yesterday (UTC; today is a part-day), from
 * `--since` when given, from BACKFILL_FROM on a first run, else the trailing
 * REFRESH_DAYS.
 */
export function planWindow({ now = new Date(), ledger = null, sinceArg = null } = {}) {
	const until = daysAgo(1, now);
	let since;
	let reason;
	if (sinceArg) {
		if (!DAY.test(sinceArg) || Number.isNaN(Date.parse(sinceArg))) {
			throw new Error(`--since must be a date, YYYY-MM-DD (got "${sinceArg}").`);
		}
		since = sinceArg;
		reason = "--since";
	} else if (isEmptyLedger(ledger)) {
		since = BACKFILL_FROM;
		reason = "backfill (empty ledger)";
	} else {
		since = daysAgo(REFRESH_DAYS, now);
		reason = "nightly";
	}
	if (since > until) throw new Error(`The window starts (${since}) after it ends (${until}).`);
	return { since, until, reason };
}

/**
 * The UTC time ranges to ask for, as contiguous, non-overlapping chunks.
 *
 * GoatCounter buckets days in the account's own time zone, so the request
 * reaches a whole UTC day past each end of the window; the days that only
 * partly fall inside the request are outside [since, until] and dropped by
 * the shaping below. Each chunk ends on :59:59 so the next one's :00:00
 * can't count an hour twice.
 */
export function requestChunks(since, until, today = daysAgo(0), size = CHUNK_DAYS) {
	const first = addDays(since, -1);
	const lastWanted = addDays(until, 1);
	const last = lastWanted > today ? today : lastWanted;
	const chunks = [];
	for (let from = first; from <= last; from = addDays(from, size)) {
		const to = addDays(from, size - 1) < last ? addDays(from, size - 1) : last;
		chunks.push({ start: `${from}T00:00:00Z`, end: `${to}T23:59:59Z` });
	}
	return chunks;
}

/** The query string for GET /api/v0/stats/total. */
export function totalQuery({ start, end }) {
	return new URLSearchParams({ start, end }).toString();
}

/**
 * The query string for one page of GET /api/v0/stats/hits. Paging is by
 * `exclude_paths` (the path IDs already seen, comma-separated: GoatCounter's
 * `Strings` type splits on commas), as the API documents it.
 */
export function hitsQuery({ start, end }, exclude = [], limit = HITS_LIMIT) {
	const params = new URLSearchParams({ start, end, limit: String(limit) });
	if (exclude.length) params.set("exclude_paths", exclude.join(","));
	return params.toString();
}

/** The `stats` array of a /stats/total response, or an error naming the drift. */
export function totalStats(body) {
	if (!body || !Array.isArray(body.stats)) {
		throw new Error("/stats/total: no `stats` array in the response — has the API changed?");
	}
	return body.stats;
}

/** The `hits` and `more` of a /stats/hits page, or an error naming the drift. */
export function hitsPage(body) {
	if (!body || !Array.isArray(body.hits)) {
		throw new Error("/stats/hits: no `hits` array in the response — has the API changed?");
	}
	for (const hit of body.hits) {
		if (typeof hit?.path_id !== "number" || !Array.isArray(hit.stats)) {
			throw new Error("/stats/hits: a hit without `path_id` or `stats` — has the API changed?");
		}
	}
	return { hits: body.hits, more: body.more === true };
}

const count = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0);

/** Adds a /stats/total `stats` array into `acc` (date → visitors). Sums, so chunks add up. */
export function addTotals(acc, stats) {
	for (const stat of stats) {
		if (!stat?.day) continue;
		acc.set(stat.day, (acc.get(stat.day) ?? 0) + count(stat.daily));
	}
	return acc;
}

/**
 * Adds /stats/hits rows into `acc` ("date\tpath" → visitors): only pages the
 * site has (`known`, normalised paths), never events, and with each path
 * normalised, so `/txt/Foo?x` and `/txt/foo/` land on one row.
 */
export function addHits(acc, hits, known) {
	for (const hit of hits) {
		if (hit.event) continue;
		const path = normalisePath(hit.path);
		if (!path || !known.has(path)) continue;
		for (const stat of hit.stats) {
			const visitors = count(stat?.daily);
			if (!stat?.day || !visitors) continue;
			const key = `${stat.day}\t${path}`;
			acc.set(key, (acc.get(key) ?? 0) + visitors);
		}
	}
	return acc;
}

/** The daily series for [since, until], zero-filled. */
export function buildDays(acc, since, until) {
	return dateRange(since, until).map((date) => ({ date, visitors: acc.get(date) ?? 0 }));
}

/** The per-path rows for [since, until], non-zero only, by date then path. */
export function buildPathDays(acc, since, until) {
	return [...acc.entries()]
		.map(([key, visitors]) => {
			const [date, path] = key.split("\t");
			return { date, path, visitors };
		})
		.filter((row) => row.date >= since && row.date <= until && row.visitors > 0)
		.sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
}

/** Drops zero days before the first counted one (before counting began). */
export function trimLeadingZeros(days) {
	const first = days.findIndex((day) => day.visitors > 0);
	return first === -1 ? [] : days.slice(first);
}

/**
 * Per path: `reads` (all-time Σ daily visitors) and `recent` (the same over
 * the RECENT_DAYS ending `until`). Keys sorted, so the file diffs cleanly.
 */
export function summarise(pathDays, until, recentDays = RECENT_DAYS) {
	const recentFrom = addDays(until, -(recentDays - 1));
	const out = {};
	for (const row of [...pathDays].sort((a, b) => a.path.localeCompare(b.path))) {
		const entry = (out[row.path] ??= { reads: 0, recent: 0 });
		entry.reads += row.visitors;
		if (row.date >= recentFrom && row.date <= until) entry.recent += row.visitors;
	}
	return out;
}

/**
 * STALE-AUTH GUARD. A revoked key fails loudly (401/403), but a key on the
 * wrong site, or a beacon that stopped loading, reads as a clean, empty
 * window. Once the ledger has counted anything at least a week before the
 * window's end, a window with no visitors at all is treated as broken rather
 * than written.
 */
export function looksStale(existingDays, freshDays, until) {
	if (freshDays.some((day) => day.visitors > 0)) return false;
	const firstCounted = existingDays.find((day) => day.visitors > 0)?.date;
	return Boolean(firstCounted && firstCounted <= addDays(until, -7));
}

/** The pages worth counting: every post and demo, as normalised paths. */
export function knownPaths({ posts = [], demos = [] }) {
	return new Set(
		[...posts.map((slug) => `/txt/${slug}/`), ...demos.map((slug) => `/demo/${slug}/`)]
			.map(normalisePath)
			.filter(Boolean),
	);
}
