#!/usr/bin/env bun
/**
 * AMC A-List posters from TMDB — each film's TMDB id and poster path, cached
 * in src/data/amc-films.json (the cache tools/amc/enrich.mjs keeps) as
 * `tmdb_id` and `tmdb_poster` ("/abc.jpg"). The widget hotlinks the poster
 * from TMDB's image CDN (src/widgets/amc/amc.ts, tmdbPosterUrl); no image is
 * downloaded or committed. AMC's own poster stays the fallback.
 *
 * Runs in the nightly Action right after enrich.mjs. For every cached film:
 *   - with an IMDb id: GET /3/find/{imdb_id}?external_source=imdb_id, the
 *     first movie result;
 *   - with a hand-set tmdb_id and no poster: GET /3/movie/{tmdb_id};
 *   - otherwise, or when find has nothing: GET /3/search/movie?query=<title>,
 *     kept only when a result's title is the film's (case, accents and
 *     punctuation aside) and it was released within a year either side of
 *     the first showing, nearest year first, then TMDB's rank (pickMovie).
 *
 * Cheap on purpose: a film with a tmdb_poster is never asked again; a film
 * TMDB has no poster for is stamped `tmdb_checked` (YYYY-MM-DD) and asked
 * again only once that is a week old. A failed request writes nothing, so the
 * next run tries again. Requests go one at a time, and a 429 waits out its
 * Retry-After once.
 *
 * Hand edits survive, as in enrich.mjs: a tmdb_poster set by hand is never
 * replaced, and `"tmdb_poster": null` set by hand opts a film out of TMDB
 * (it keeps AMC's poster, or the placeholder).
 *
 * TMDB_TOKEN is either a v4 API Read Access Token (a JWT, sent as a Bearer
 * header) or a v3 API key (32 hex, sent as ?api_key=); its shape decides.
 * Never logged: errors name the path, not the URL. Without a token it warns
 * and exits 0.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { filmKey } from "../../src/widgets/amc/genres.ts";
import { screeningYear, searchTitle } from "./enrich.mjs";

const AMC_PATH = fileURLToPath(new URL("../../src/data/amc.json", import.meta.url));
const CACHE_PATH = fileURLToPath(new URL("../../src/data/amc-films.json", import.meta.url));

export const API = "https://api.themoviedb.org/3";
/** A film TMDB had nothing for is asked again after this many days. */
export const RECHECK_DAYS = 7;

/** How to send the token: a v3 key (32 hex) as ?api_key=, anything else (a
 *  v4 read-access JWT) as a Bearer header. Exported for the tests. */
export function tokenAuth(token) {
	const t = String(token ?? "").trim();
	if (!t) throw new Error("no TMDB token");
	return /^[0-9a-f]{32}$/i.test(t) ? { headers: {}, params: { api_key: t } } : { headers: { authorization: `Bearer ${t}` }, params: {} };
}

/** A GET against TMDB's API, `path` from /3 on: the parsed body, null on a
 *  404, and an Error naming the path (never the URL, which may hold the key)
 *  otherwise. */
export function tmdbClient(token, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
	const auth = tokenAuth(token);
	return async function get(path, params = {}) {
		const url = `${API}${path}?${new URLSearchParams({ ...params, ...auth.params })}`;
		for (let attempt = 0; ; attempt++) {
			let res;
			try {
				res = await fetchFn(url, {
					headers: { accept: "application/json", ...auth.headers },
					signal: AbortSignal.timeout(30_000),
				});
			} catch (err) {
				// A network error's message may quote the URL, and with it a v3 key.
				throw new Error(`request to TMDB ${path} failed (${err?.name ?? "Error"})`);
			}
			if (res.status === 429 && attempt === 0) {
				await sleep(Math.min(10, Number(res.headers?.get?.("retry-after")) || 2) * 1000);
				continue;
			}
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`${res.status} from TMDB ${path}`);
			return res.json();
		}
	};
}

const yearOf = (date) => {
	const y = Number(String(date ?? "").slice(0, 4));
	return y > 0 ? y : null;
};

/** The leading "the" aside, so "The Wild Robot" and "Wild Robot" agree. */
const titleKey = (t) => filmKey(String(t ?? "")).replace(/^the-/, "");

/**
 * The search result to trust, or null: its title (or original title) is the
 * film's, and it was released within a year either side of the screening
 * (`year`; any year when unknown), nearest first, then TMDB's own order.
 * Exported for the tests.
 */
export function pickMovie(results, title, year) {
	const want = titleKey(title);
	const fits = (results ?? [])
		.map((r, rank) => ({ r, rank, y: yearOf(r?.release_date) }))
		.filter(({ r }) => r?.id != null && (titleKey(r.title) === want || titleKey(r.original_title) === want))
		.filter(({ y }) => year == null || (y != null && y >= year - 1 && y <= year + 1))
		.sort((a, b) => (year == null ? 0 : Math.abs(year - a.y) - Math.abs(year - b.y)) || a.rank - b.rank);
	return fits[0]?.r ?? null;
}

/**
 * One film's TMDB match, `{ tmdb_id, tmdb_poster }` (tmdb_poster null when
 * TMDB knows the film but has no poster), or null when nothing matches.
 * Throws when a request fails. Exported for the tests.
 */
export async function resolvePoster(entry, { title, year }, get) {
	const hit = (m) => (m?.id != null ? { tmdb_id: m.id, tmdb_poster: m.poster_path || null } : null);
	if (entry.tmdb_id != null) {
		const m = await get(`/movie/${encodeURIComponent(entry.tmdb_id)}`);
		if (m) return hit(m);
	}
	if (entry.imdb_id && /^tt\d+$/.test(entry.imdb_id)) {
		const found = await get(`/find/${entry.imdb_id}`, { external_source: "imdb_id" });
		const m = found?.movie_results?.[0];
		if (m) return hit(m);
	}
	const query = searchTitle(title ?? entry.title ?? "");
	if (!query) return null;
	const body = await get("/search/movie", { query, include_adult: "false" });
	return hit(pickMovie(body?.results, query, year));
}

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * The cache with TMDB posters filled in where it can: films with a poster (or
 * opted out, or checked within RECHECK_DAYS) are skipped; a hit sets tmdb_id
 * and tmdb_poster; a miss stamps tmdb_checked; a failure writes nothing.
 * `movies` (amc.json's) give each film its first showing's year and its
 * name. `today` is YYYY-MM-DD. Exported for the tests.
 */
export async function posters(movies, cache, get, today) {
	const firstShowing = new Map();
	for (const m of movies ?? []) {
		if (!m?.name) continue;
		const key = filmKey(m.name);
		const year = screeningYear(m);
		const prev = firstShowing.get(key);
		if (!prev || (year != null && (prev.year == null || year < prev.year))) firstShowing.set(key, { name: m.name, year });
		if (m.id != null) firstShowing.set(`amc:${m.id}`, firstShowing.get(key));
	}

	const out = { ...cache };
	const found = [];
	const missed = [];
	const failed = [];
	let changed = false;
	for (const [key, entry] of Object.entries(out)) {
		// Has a poster, or was opted out by hand ("tmdb_poster": null).
		if (!entry || "tmdb_poster" in entry) continue;
		if (entry.tmdb_checked && daysBetween(entry.tmdb_checked, today) < RECHECK_DAYS) continue;
		const shown = (entry.amc_id != null && firstShowing.get(`amc:${entry.amc_id}`)) || firstShowing.get(key) || {};
		const title = entry.title ?? shown.name ?? key;
		try {
			const hit = await resolvePoster(entry, { title, year: shown.year ?? null }, get);
			if (hit?.tmdb_poster) {
				const { tmdb_checked: _, ...rest } = entry;
				out[key] = { ...rest, tmdb_id: entry.tmdb_id ?? hit.tmdb_id, tmdb_poster: hit.tmdb_poster };
				found.push(`${title} → ${hit.tmdb_poster} (tmdb ${hit.tmdb_id})`);
			} else {
				out[key] = { ...entry, ...(hit && entry.tmdb_id == null ? { tmdb_id: hit.tmdb_id } : {}), tmdb_checked: today };
				missed.push(hit ? `${title} (tmdb ${hit.tmdb_id}, no poster)` : title);
			}
			changed = true;
		} catch (err) {
			failed.push(`${title}: ${err?.message ?? err}`);
		}
	}
	return { cache: out, changed, found, missed, failed };
}

async function main() {
	const token = process.env.TMDB_TOKEN;
	if (!token?.trim()) {
		console.log("::warning::AMC posters: TMDB_TOKEN is not set — skipping.");
		return;
	}
	const { movies = [] } = JSON.parse(await readFile(AMC_PATH, "utf8"));
	const cache = JSON.parse(await readFile(CACHE_PATH, "utf8"));
	const client = tmdbClient(token);
	// One request at a time, a little apart: well under TMDB's rate limit.
	const get = async (path, params) => {
		await new Promise((r) => setTimeout(r, 60));
		return client(path, params);
	};
	const today = new Date().toISOString().slice(0, 10);
	const result = await posters(movies, cache, get, today);

	for (const f of result.found) console.log(`Poster: ${f}`);
	for (const m of result.missed) console.log(`No TMDB poster: ${m} — asked again in ${RECHECK_DAYS} days.`);
	for (const f of result.failed) console.log(`::warning::AMC posters: ${f} — will retry next run.`);
	const all = Object.values(result.cache);
	console.log(`TMDB posters: ${all.filter((e) => e?.tmdb_poster).length} of ${all.length} films.`);
	if (result.changed) {
		await writeFile(CACHE_PATH, `${JSON.stringify(result.cache, null, "\t")}\n`, "utf8");
		console.log(`Wrote ${CACHE_PATH}`);
	}
}

if (import.meta.main) {
	main().catch((err) => {
		console.log(`::warning::AMC posters failed: ${err?.message ?? err}`);
		process.exitCode = 1;
	});
}
