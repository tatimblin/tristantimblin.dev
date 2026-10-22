#!/usr/bin/env bun
/**
 * Reads page-view counts from hosted GoatCounter and folds them into
 * src/data/pageviews.json, which the pages import at build time (the post
 * strip's READS, /txt's list). No page fetches analytics at runtime and no key
 * ships to the client. Runs in the nightly workflow (.github/workflows/nightly.yml).
 *
 * The API (OpenAPI 2.0 at https://www.goatcounter.com/api.json):
 *   GET https://<code>.goatcounter.com/api/v0/stats/total?start=&end=
 *     → { total, total_events, total_utc, stats: [{ day, daily, hourly, … }] }
 *   GET https://<code>.goatcounter.com/api/v0/stats/hits?start=&end=&limit=100[&exclude_paths=1,2]
 *     → { total, more, hits: [{ path_id, path, title, event, count, max, stats: [{ day, daily, … }] }] }
 * `start` / `end` are RFC 3339 times on the hour; `daily` is visitors that day;
 * pages of hits are walked by excluding the path IDs already seen while `more`.
 * Auth is `Authorization: Bearer <key>` (read-stats permission is enough).
 * The rate limit is 4 requests a second; requests here are spaced past it and
 * a 429 waits out `X-Rate-Limit-Reset`.
 *
 * THE WINDOW (lib.mjs planWindow): yesterday back 45 days on a normal night;
 * from 2026-07-01 when the ledger is empty (a first run, which backfills the
 * history imported into GoatCounter); from `--since YYYY-MM-DD` (or
 * $PAGEVIEWS_SINCE, the workflow_dispatch input) when given. Rows in the
 * window are replaced; older rows stay as committed.
 *
 * GUARDS, as in tools/readers: an HTTP or shape error fails the step; a window
 * with no visitors once the ledger is a week old fails it (stale auth); an
 * unreadable ledger is refused rather than overwritten.
 *
 * Usage:
 *   GOATCOUNTER_TOKEN=<key> [GOATCOUNTER_CODE=tristantimblin] \
 *     bun tools/pageviews/fetch.mjs [--since YYYY-MM-DD]
 */
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { daysAgo, mergeWindow, readLedger } from "../lib/ledger.mjs";
import {
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

const OUT_PATH = fileURLToPath(new URL("../../src/data/pageviews.json", import.meta.url));
const CONTENT = fileURLToPath(new URL("../../src/content/", import.meta.url));

const DEFAULT_CODE = "tristantimblin";
/** 4 requests a second is the limit; one every 300ms stays under it. */
const SPACING_MS = 300;
/** A runaway pager (an API that never stops saying `more`) is an error. */
const MAX_PAGES = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `--since 2026-07-01` / `--since=2026-07-01`, else $PAGEVIEWS_SINCE. */
function sinceArgument(argv = process.argv.slice(2)) {
	const i = argv.findIndex((arg) => arg === "--since" || arg.startsWith("--since="));
	if (i !== -1) return argv[i].includes("=") ? argv[i].split("=")[1] : argv[i + 1];
	return process.env.PAGEVIEWS_SINCE?.trim() || null;
}

/** A GET client for one site's API: spaced requests, 429 waits, loud errors. */
function client(code, token) {
	// $GOATCOUNTER_API points a dry run at a local stand-in.
	const base = process.env.GOATCOUNTER_API || `https://${code}.goatcounter.com/api/v0`;
	let last = 0;
	return async function get(path, query) {
		for (let attempt = 0; ; attempt++) {
			const wait = last + SPACING_MS - Date.now();
			if (wait > 0) await sleep(wait);
			last = Date.now();
			const response = await fetch(`${base}${path}?${query}`, {
				headers: { authorization: `Bearer ${token}`, accept: "application/json" },
			});
			if (response.status === 429 && attempt < 3) {
				const reset = Number(response.headers.get("x-rate-limit-reset")) || 1;
				await sleep(reset * 1000 + 100);
				continue;
			}
			if (!response.ok) {
				const hint =
					response.status === 401
						? " (bad API key)"
						: response.status === 403
							? " (the key lacks a permission: it needs read-stats)"
							: "";
				throw new Error(`GoatCounter ${path} ${response.status}${hint}: ${await response.text()}`);
			}
			return response.json();
		}
	};
}

/** The slugs of the posts and demos, from the content directories' file names. */
async function slugs(dir) {
	const files = await readdir(`${CONTENT}${dir}`, { withFileTypes: true });
	return files
		.filter((f) => f.isFile() && /\.(md|mdx)$/.test(f.name))
		.map((f) => f.name.replace(/\.(md|mdx)$/, ""));
}

async function main() {
	const token = process.env.GOATCOUNTER_TOKEN;
	const code = process.env.GOATCOUNTER_CODE?.trim() || DEFAULT_CODE;
	if (!token) throw new Error("GOATCOUNTER_TOKEN is not set.");

	const existing = (await readLedger(OUT_PATH)) ?? {};
	const existingDays = Array.isArray(existing.days) ? existing.days : [];
	const existingPathDays = Array.isArray(existing.pathDays) ? existing.pathDays : [];
	const { since, until, reason } = planWindow({
		ledger: { days: existingDays, pathDays: existingPathDays },
		sinceArg: sinceArgument(),
	});
	const known = knownPaths({ posts: await slugs("txt"), demos: await slugs("demos") });
	const chunks = requestChunks(since, until, daysAgo(0));
	console.log(`Window ${since} → ${until} (${reason}), ${chunks.length} chunk(s), ${known.size} pages.`);

	const get = client(code, token);
	const totals = new Map();
	const perPath = new Map();
	for (const chunk of chunks) {
		addTotals(totals, totalStats(await get("/stats/total", totalQuery(chunk))));

		const seen = [];
		for (let page = 0; ; page++) {
			if (page >= MAX_PAGES) throw new Error(`/stats/hits still says "more" after ${MAX_PAGES} pages.`);
			const { hits, more } = hitsPage(await get("/stats/hits", hitsQuery(chunk, seen)));
			addHits(perPath, hits, known);
			seen.push(...hits.map((hit) => hit.path_id));
			if (!more || hits.length === 0) break;
		}
	}

	const freshDays = buildDays(totals, since, until);
	if (looksStale(existingDays, freshDays, until)) {
		throw new Error(
			`No visitors at all ${since} → ${until}, though the ledger has counted since ` +
				`${existingDays.find((d) => d.visitors > 0)?.date} — treating it as a broken key or ` +
				"a beacon that stopped loading, not writing it.",
		);
	}

	const days = trimLeadingZeros(mergeWindow(existingDays, freshDays, since));
	const pathDays = mergeWindow(
		existingPathDays,
		buildPathDays(perPath, since, until),
		since,
		(row) => `${row.date}\t${row.path}`,
	);

	const out = {
		updated: until,
		source: "goatcounter",
		code,
		// What every number here is: GoatCounter's daily visitors (see lib.mjs).
		metric: "visitors",
		days,
		pathDays,
		paths: summarise(pathDays, until),
	};
	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");

	const total = days.reduce((sum, day) => sum + day.visitors, 0);
	console.log(
		`Wrote ${OUT_PATH}: ${days.length} days (${days[0]?.date ?? "-"} → ${days.at(-1)?.date ?? "-"}), ` +
			`${total} visitors, ${pathDays.length} path-day rows, ${Object.keys(out.paths).length} pages.`,
	);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(`::error::${err?.stack ?? err}`);
		process.exit(1);
	});
}
