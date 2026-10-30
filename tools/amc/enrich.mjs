#!/usr/bin/env bun
/**
 * AMC A-List film metadata — each film's IMDb id and genre bucket, cached in
 * src/data/amc-films.json (committed), keyed by filmKey(name).
 *
 * Runs in the nightly Action after tools/amc/fetch.mjs. For every film in
 * src/data/amc.json that the cache doesn't know yet, it asks Wikidata (keyless
 * SPARQL: a title search, narrowed to films with an IMDb id released within a
 * year of the screening) for the IMDb id and genre labels, and buckets them with
 * genreBucket (src/widgets/amc/genres.ts). A film Wikidata can't place is
 * cached as Other with no IMDb id, and the widget links it to an IMDb search;
 * a request that FAILS caches nothing, so tomorrow's run tries again.
 *
 * The cache is never rewritten, only added to: an existing entry keeps every
 * field as it is (fix a genre or an id by hand and it stays fixed), and only
 * gains the AMC movie id when it has none. `poster` on an entry overrides
 * AMC's poster URL.
 *
 * Exits 0 even when Wikidata is down: the widget renders uncached films as
 * Other, and the next run fills them in.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { filmKey, genreBucket } from "../../src/widgets/amc/genres.ts";

const AMC_PATH = fileURLToPath(new URL("../../src/data/amc.json", import.meta.url));
const CACHE_PATH = fileURLToPath(new URL("../../src/data/amc-films.json", import.meta.url));

const SPARQL = "https://query.wikidata.org/sparql";
const UA = "tristantimblin.dev-amc-enrich/1.0 (https://tristantimblin.dev; nightly widget data)";

/** The film's title as Wikidata would have it: AMC's event and format
 *  suffixes and a disambiguating "(2024)" dropped. Exported for the tests. */
export function searchTitle(name) {
	return name
		.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")
		.replace(/\s*[:\-–]\s*(?:the\s+)?(?:imax|dolby|3d|prime|early access|fan event|opening night|unlimited screening|re-?release|\d+(?:st|nd|rd|th) anniversary)\b.*$/i, "")
		.trim();
}

/** The year a showing's date string falls in ("2024-01-10" or "January 10,
 *  2024"). */
export function screeningYear(movie) {
	const m = String(movie.iso ?? movie.date ?? "").match(/\b((?:19|20)\d{2})\b/);
	return m ? Number(m[1]) : null;
}

const query = (title) => `
SELECT ?item ?ordinal ?imdb ?date ?genre ?type WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org";
                    wikibase:api "EntitySearch";
                    mwapi:search ${JSON.stringify(title)};
                    mwapi:language "en";
                    mwapi:limit "50".
    ?item wikibase:apiOutputItem mwapi:item.
    ?ordinal wikibase:apiOrdinal true.
  }
  # Instances of the film classes, not P279*: the search's other hits (a car
  # maker for "Ferrari") would make a subclass walk time out.
  VALUES ?class { wd:Q11424 wd:Q24869 wd:Q29168811 wd:Q202866 wd:Q93204 wd:Q506240 }
  ?item wdt:P31 ?class;
        wdt:P345 ?imdb.
  OPTIONAL { ?item wdt:P577 ?date. }
  OPTIONAL { ?item wdt:P136/rdfs:label ?genre. FILTER(LANG(?genre) = "en") }
  OPTIONAL { ?item wdt:P31/rdfs:label ?type. FILTER(LANG(?type) = "en") }
}`;

/**
 * The best candidate from the SPARQL rows: films whose earliest release is
 * within a year of the screening (a January showing of a December release),
 * nearest year first, then Wikidata's search rank. Its genre labels include
 * its instance-of labels ("animated feature film" lives there, not in genre).
 * Null when nothing fits. Exported for the tests.
 */
export function pickCandidate(bindings, year) {
	const items = new Map();
	for (const b of bindings) {
		const v = (k) => b[k]?.value;
		const id = v("item");
		if (!id || !/^tt\d+$/.test(v("imdb") ?? "")) continue;
		const it = items.get(id) ?? { ordinal: Number(v("ordinal") ?? 99), imdb: v("imdb"), year: Infinity, labels: new Set() };
		const y = Number(String(v("date") ?? "").slice(0, 4));
		if (y > 0) it.year = Math.min(it.year, y);
		for (const k of ["genre", "type"]) if (v(k)) it.labels.add(v(k));
		items.set(id, it);
	}
	const fits = [...items.values()]
		.filter((it) => year == null || (Number.isFinite(it.year) && it.year >= year - 1 && it.year <= year))
		.sort((a, b) => (year == null ? 0 : Math.abs(year - a.year) - Math.abs(year - b.year)) || a.ordinal - b.ordinal);
	const best = fits[0];
	return best ? { imdb_id: best.imdb, labels: [...best.labels].sort() } : null;
}

async function lookup(movie) {
	const res = await fetch(`${SPARQL}?${new URLSearchParams({ query: query(searchTitle(movie.name)), format: "json" })}`, {
		headers: { "user-agent": UA, accept: "application/sparql-results+json" },
		signal: AbortSignal.timeout(60_000),
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} from Wikidata`);
	const body = await res.json();
	return pickCandidate(body?.results?.bindings ?? [], screeningYear(movie));
}

/**
 * The cache with every film in `movies` accounted for: existing entries
 * untouched but for a missing amc_id, new ones from `lookup` (which throws to
 * mean "try again tomorrow"). Returns the cache and what changed.
 * Exported for the tests.
 */
export async function enrich(movies, cache, lookupFn) {
	const out = { ...cache };
	const byAmcId = new Map(Object.entries(out).filter(([, e]) => e?.amc_id).map(([k, e]) => [String(e.amc_id), k]));
	const added = [];
	const failed = [];
	let changed = false;
	for (const movie of movies) {
		if (!movie?.name) continue;
		const key = (movie.id != null && byAmcId.get(String(movie.id))) || filmKey(movie.name);
		if (out[key]) {
			if (movie.id != null && out[key].amc_id == null) {
				out[key] = { ...out[key], amc_id: String(movie.id) };
				byAmcId.set(String(movie.id), key);
				changed = true;
			}
			continue;
		}
		try {
			const hit = await lookupFn(movie);
			out[key] = {
				title: movie.name,
				imdb_id: hit?.imdb_id ?? null,
				primary_genre: hit ? genreBucket(hit.labels) : "Other",
				...(movie.id != null ? { amc_id: String(movie.id) } : {}),
			};
			if (movie.id != null) byAmcId.set(String(movie.id), key);
			added.push(`${movie.name} → ${out[key].primary_genre}${hit ? ` (${hit.imdb_id})` : " (no match)"}`);
			changed = true;
		} catch (err) {
			failed.push(`${movie.name}: ${err?.message ?? err}`);
		}
	}
	const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
	return { cache: sorted, changed, added, failed };
}

async function main() {
	const { movies = [] } = JSON.parse(await readFile(AMC_PATH, "utf8"));
	let cache = {};
	try {
		cache = JSON.parse(await readFile(CACHE_PATH, "utf8"));
	} catch (err) {
		if (err?.code !== "ENOENT") throw err;
	}

	const pause = () => new Promise((r) => setTimeout(r, 500));
	const result = await enrich(movies, cache, async (m) => {
		await pause(); // gentle on the public endpoint
		return lookup(m);
	});

	for (const a of result.added) console.log(`Added ${a}`);
	for (const f of result.failed) console.log(`::warning::AMC enrich: ${f} — will retry next run.`);
	if (result.changed) {
		await writeFile(CACHE_PATH, `${JSON.stringify(result.cache, null, "\t")}\n`, "utf8");
		console.log(`Wrote ${Object.keys(result.cache).length} films to ${CACHE_PATH}`);
	} else {
		console.log("Every film is cached — nothing to do.");
	}
}

if (import.meta.main) {
	main().catch((err) => {
		console.log(`::warning::AMC enrich failed: ${err?.stack ?? err}`);
	});
}
