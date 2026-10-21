#!/usr/bin/env bun
/**
 * Fetches the data behind the readers widget (src/widgets/readers/) and writes
 * it to readers.json, which the widget imports at build time (Vite inlines it —
 * no runtime fetch, no token shipped to the client). Mirrors the github and volo
 * pipelines: a scheduled Action runs this and commits the JSON, and each commit
 * triggers a rebuild that picks up the fresh data (see
 * .github/workflows/readers.yml).
 *
 * THE SOURCE is Cloudflare Web Analytics (RUM), not the zone's HTTP analytics.
 * The RUM beacon is JavaScript, so only real browsers ever appear in it —
 * crawlers and scanners cannot execute it. That matters here: the zone datasets
 * for this site are ~98% machines (the top paths after `/` are /wp-login.php,
 * /.env and /.git/config), so a "traffic" number taken from them would be a
 * number about bots. This one is about people.
 *
 * TWO PROPERTIES OF RUM SHAPE EVERYTHING DOWNSTREAM, and the widget's maths
 * assumes them:
 *   1. It is SAMPLED and pre-scaled, so every count comes back a multiple of
 *      ten. One person reading one post is reported as "10". The figures are
 *      estimates and the widget says so.
 *   2. It is SPARSE at this site's volume — roughly half of all days are zero.
 *      A raw daily series is not a curve, which is why the widget plots a 7-day
 *      trailing sum (see buildView() in src/widgets/readers/readers.ts).
 *
 * WHY THIS SCRIPT MERGES RATHER THAN OVERWRITES. Cloudflare retains RUM for
 * roughly 90 days. Overwriting would mean the widget's history silently rolled
 * off that cliff forever. Instead each run folds the fresh window into the
 * committed file, so readers.json accumulates into a permanent record that
 * outlives the retention window. The trailing REFRESH_DAYS are always re-read
 * from the API (sampling revises recent days); everything older is frozen.
 *
 * Auth: a Cloudflare API token in $CLOUDFLARE_ANALYTICS_TOKEN scoped
 * `Account → Account Analytics: Read`. RUM is ACCOUNT-scoped, so no zone
 * permission is needed — and the CLOUDFLARE_API_TOKEN secret the deploy
 * workflow uses is a Pages-deploy token, which is not the same thing.
 *
 * Usage:
 *   CLOUDFLARE_ANALYTICS_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> \
 *     bun tools/readers/fetch.mjs
 *
 * Output is committed, so neither the build nor CI depends on running it live.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(
	new URL("../../src/data/readers.json", import.meta.url),
);

// The Web Analytics site this reads. Not a secret — it is a public identifier
// visible in the beacon request every visitor makes. Hardcoded rather than
// looked up by hostname because the lookup endpoint (/rum/site_info/list) needs
// a broader token scope than the one metric this script wants. If the site is
// ever re-provisioned, get the new tag from that endpoint and replace this.
const SITE_TAG = "4fa1a14d4e604219b081bb511741d2ab";
const HOST = "tristantimblin.dev";

// How far back to re-read on every run. Comfortably wider than the widget's
// plotted window (30 points, each a 7-day trailing sum, so 36 days of input) so
// a few missed runs heal themselves rather than leaving a permanent hole.
const REFRESH_DAYS = 45;
// How much history the committed file keeps. Past this, the oldest days are
// dropped — a year of daily rows is a few tens of KB, which is already more
// than any plausible widget window. Note this makes the widget's "All time"
// face mean "as far back as this" once the ledger is older than it.
const TAIL_DAYS = 400;

// The API caps a result set, and neither dataset here paginates. `posts` is
// grouped by date AND path, so it is the one that could plausibly grow into the
// cap — at which point Cloudflare truncates silently rather than erroring, and
// the ledger would quietly start missing rows. Guarded below instead.
const ROW_LIMIT = 1000;

const API = "https://api.cloudflare.com/client/v4/graphql";

// Two aliased datasets in one request. `all` is every human pageload on the
// site; `posts` is the same thing narrowed to post URLs, kept so the widget can
// be re-pointed at post-only reads later without touching this pipeline.
// /txt/tag/% is excluded there — a tag index is a table of contents, not a read.
const QUERY = `
query Readers($accountTag: String!, $siteTag: String!, $since: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      all: rumPageloadEventsAdaptiveGroups(
        limit: 1000
        filter: { siteTag: $siteTag, date_geq: $since }
        orderBy: [date_ASC]
      ) {
        count
        sum { visits }
        dimensions { date }
      }
      posts: rumPageloadEventsAdaptiveGroups(
        limit: 1000
        filter: {
          siteTag: $siteTag
          date_geq: $since
          requestPath_like: "/txt/%"
          requestPath_notlike: "/txt/tag/%"
        }
        orderBy: [date_ASC]
      ) {
        count
        dimensions { date requestPath }
      }
    }
  }
}`;

const isoDay = (date) => date.toISOString().slice(0, 10);

const daysAgo = (n) => {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - n);
	return isoDay(date);
};

/** Every date from `from` to `to` inclusive, so the series has no holes. */
export function dateRange(from, to) {
	const out = [];
	const cursor = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	while (cursor <= end) {
		out.push(isoDay(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return out;
}

/**
 * Folds a freshly-read window into the previously committed days.
 *
 * Rows at or after `since` come from `fresh` and nothing else — a day that has
 * dropped to zero must be able to go back DOWN, which a merge that only ever
 * took the larger value could not express. Rows before `since` are whatever was
 * already on disk, because the API can no longer see them.
 *
 * ONE ROW PER DATE. This is the daily series only; see mergePostDays() for the
 * per-path one, which is keyed differently because it is shaped differently.
 *
 * Exported, with the other pure helpers here, so the merge can be exercised
 * directly — it is the one piece of this script whose failure mode is silent
 * and permanent, and it is not reachable through main() without a live token.
 */
export function mergeDays(existing, fresh, since, tailDays = TAIL_DAYS) {
	const byDate = new Map();
	for (const day of existing) {
		if (day?.date && day.date < since) byDate.set(day.date, day);
	}
	for (const day of fresh) byDate.set(day.date, day);

	const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
	return sorted.slice(-tailDays);
}

/**
 * The same fold for the per-path rows — but keyed on DATE AND PATH.
 *
 * These are one row per (date, path), so keying on the date alone silently
 * keeps whichever post happened to sort last and drops the rest. Two posts read
 * on the same day is not an edge case, it is a good day, and once that date
 * ages past Cloudflare's retention the merge is the only copy there is.
 *
 * Trimmed by DATE against the daily ledger's own horizon rather than by row
 * count: a row cap would shorten the post history exactly as the site got
 * busier, which is backwards.
 */
export function mergePostDays(existing, fresh, since, keepFrom) {
	const byKey = new Map();
	const key = (row) => `${row.date}\t${row.path}`;

	for (const row of existing) {
		if (row?.date && row?.path && row.date < since) byKey.set(key(row), row);
	}
	for (const row of fresh) byKey.set(key(row), row);

	return [...byKey.values()]
		.filter((row) => !keepFrom || row.date >= keepFrom)
		.sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
}

/**
 * Drops leading zero days.
 *
 * A zero inside the record means "nobody read anything that day", which is a
 * fact worth keeping. A zero BEFORE the first reading means something else
 * entirely — either the beacon was not live yet, or the window reaches past
 * Cloudflare's ~90-day retention and the API is reporting absence as emptiness.
 * Keeping those would draw a flat line of invented history at the left edge of
 * any chart wide enough to reach it.
 */
export function trimLeadingZeros(days) {
	const first = days.findIndex((day) => day.pageloads > 0);
	return first <= 0 ? days : days.slice(first);
}

async function readExisting() {
	let text;
	try {
		text = await readFile(OUT_PATH, "utf8");
	} catch (err) {
		// A MISSING file is the first run, and there is genuinely nothing to
		// preserve. Anything else — a permission problem, a directory in the way —
		// is not, and must not be mistaken for one.
		if (err?.code === "ENOENT") return { days: [], postDays: [] };
		throw err;
	}

	// AN UNREADABLE FILE IS NOT AN EMPTY ONE, and the difference is the whole
	// pipeline. Swallowing a parse error here would merge the fresh window into
	// nothing, write a REFRESH_DAYS-long file, and let the workflow commit and
	// push it — permanently deleting every day older than Cloudflare's retention
	// window, which is precisely the history this script exists to accumulate.
	// A conflict marker or a truncated write is enough to trigger it. Fail loud
	// and let a human look at the file.
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		throw new Error(
			`${OUT_PATH} exists but is not valid JSON (${err.message}). Refusing to ` +
				"overwrite it — the committed ledger is the only copy of anything older " +
				"than Cloudflare's ~90-day retention.",
		);
	}

	return {
		days: Array.isArray(raw.days) ? raw.days : [],
		postDays: Array.isArray(raw.postDays) ? raw.postDays : [],
	};
}

async function query(token, accountTag, since) {
	const response = await fetch(API, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			query: QUERY,
			variables: { accountTag, siteTag: SITE_TAG, since },
		}),
	});

	if (!response.ok) {
		throw new Error(`Cloudflare API ${response.status}: ${await response.text()}`);
	}

	const body = await response.json();
	if (body.errors?.length) {
		throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
	}

	const account = body.data?.viewer?.accounts?.[0];
	if (!account) throw new Error("No account in response — check the account id.");
	return account;
}

/** Turn the API's sparse rows into a contiguous zero-filled daily series. */
export function buildDays(rows, since, until) {
	const byDate = new Map();
	for (const row of rows) {
		const date = row?.dimensions?.date;
		if (!date) continue;
		const prior = byDate.get(date) ?? { pageloads: 0, visits: 0 };
		byDate.set(date, {
			pageloads: prior.pageloads + (Number(row.count) || 0),
			visits: prior.visits + (Number(row.sum?.visits) || 0),
		});
	}
	return dateRange(since, until).map((date) => ({
		date,
		pageloads: byDate.get(date)?.pageloads ?? 0,
		visits: byDate.get(date)?.visits ?? 0,
	}));
}

/**
 * The /txt rows, kept only where something was actually read.
 *
 * The query's `requestPath_notlike` drops the tag indexes, but SQL `%` also
 * matches the empty string, so "/txt/%" still admits the post index itself.
 * Dropped here rather than with a second filter clause: it is one exact path,
 * and the API has no _neq for this dimension.
 */
export function buildPostDays(rows) {
	return rows
		.map((row) => ({
			date: row?.dimensions?.date ?? "",
			path: row?.dimensions?.requestPath ?? "",
			reads: Number(row.count) || 0,
		}))
		.filter((row) => row.date && row.path && row.reads > 0 && row.path !== "/txt/")
		.sort((a, b) => a.date.localeCompare(b.date) || a.path.localeCompare(b.path));
}

async function main() {
	const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
	const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID;
	if (!token) throw new Error("CLOUDFLARE_ANALYTICS_TOKEN is not set.");
	if (!accountTag) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set.");

	const since = daysAgo(REFRESH_DAYS);
	// YESTERDAY, not today. The cron fires at 07:00 UTC, so "today" is always a
	// part-day, and a part-day in the ledger drags the final point of every
	// trailing sum the widget draws — a downward hook at the right-hand edge of
	// the chart, every day, that is an artifact of when the job runs rather than
	// anything about the traffic. Only whole UTC days go in.
	const until = daysAgo(1);
	const account = await query(token, accountTag, since);

	// STALE-AUTH GUARD. A token that has lost its scope, or a site tag that no
	// longer resolves, returns a clean empty array rather than an error — which
	// would otherwise commit a widget with its history quietly truncated. Over 45
	// days this site has never once recorded zero pageloads, so an empty window
	// means the credential is broken, not that nobody visited.
	if (!account.all?.length) {
		throw new Error(
			`No pageload rows for site ${SITE_TAG} since ${since} — ` +
				"treating as a broken credential rather than writing an empty file.",
		);
	}

	// Neither dataset paginates. A result set that exactly fills the cap is
	// indistinguishable from one that was truncated, so treat it as truncated.
	for (const [name, rows] of [["all", account.all], ["posts", account.posts ?? []]]) {
		if (rows.length >= ROW_LIMIT) {
			throw new Error(
				`The ${name} query returned ${rows.length} rows, at the ${ROW_LIMIT} cap — ` +
					"it is being truncated. Narrow REFRESH_DAYS or add pagination.",
			);
		}
	}

	const existing = await readExisting();
	const days = trimLeadingZeros(
		mergeDays(existing.days, buildDays(account.all, since, until), since),
	);
	const postDays = mergePostDays(
		existing.postDays,
		buildPostDays(account.posts ?? []),
		since,
		days[0]?.date,
	);

	const out = {
		// UTC date stamp (the workflow runs on a UTC cron). No locale, no random.
		updated: until,
		host: HOST,
		siteTag: SITE_TAG,
		// Carried into the widget so the tile can say what the figures are, and
		// so nobody reading the JSON mistakes them for exact counts.
		sampled: true,
		days,
		postDays,
	};

	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	const total = days.reduce((sum, day) => sum + day.pageloads, 0);
	console.log(
		`Wrote ${OUT_PATH}: ${days.length} days (${days[0]?.date} → ${days.at(-1)?.date}), ` +
			`${total} pageloads, ${postDays.length} post-day rows.`,
	);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(`::error::${err?.stack ?? err}`);
		process.exit(1);
	});
}
