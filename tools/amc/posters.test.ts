// The TMDB poster step on a mocked fetch. Nothing here talks to TMDB.
import { describe, expect, test } from "bun:test";
import { pickMovie, posters, RECHECK_DAYS, resolvePoster, tmdbClient, tokenAuth } from "./posters.mjs";

const V3 = "0123456789abcdef0123456789abcdef";
const V4 = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl";

/** A fetch that answers from `routes` (path → body, or a status number) and
 *  records each request. */
function mockFetch(routes: Record<string, unknown>) {
	const calls: { url: URL; headers: Record<string, string> }[] = [];
	const fetchFn = async (input: string, init?: { headers?: Record<string, string> }) => {
		const url = new URL(input);
		calls.push({ url, headers: init?.headers ?? {} });
		const path = url.pathname.replace(/^\/3/, "");
		const body = routes[path];
		if (body === undefined) return new Response("{}", { status: 404 });
		if (typeof body === "number") return new Response("{}", { status: body });
		return Response.json(typeof body === "function" ? body(url) : body);
	};
	return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

describe("token shape", () => {
	test("a 32-hex v3 key goes in the query; a v4 JWT in a Bearer header", async () => {
		expect(tokenAuth(V3)).toEqual({ headers: {}, params: { api_key: V3 } });
		expect(tokenAuth(V4)).toEqual({ headers: { authorization: `Bearer ${V4}` }, params: {} });
		expect(() => tokenAuth("")).toThrow();

		const v3 = mockFetch({ "/movie/1": { id: 1 } });
		await tmdbClient(V3, { fetchFn: v3.fetchFn })("/movie/1");
		expect(v3.calls[0].url.searchParams.get("api_key")).toBe(V3);
		expect(v3.calls[0].headers.authorization).toBeUndefined();

		const v4 = mockFetch({ "/movie/1": { id: 1 } });
		await tmdbClient(V4, { fetchFn: v4.fetchFn })("/movie/1");
		expect(v4.calls[0].url.searchParams.has("api_key")).toBe(false);
		expect(v4.calls[0].headers.authorization).toBe(`Bearer ${V4}`);
	});

	test("a failure names the path, never the key; a 429 is retried once", async () => {
		const { fetchFn } = mockFetch({ "/find/tt1": 500 });
		const err = await tmdbClient(V3, { fetchFn })("/find/tt1").catch((e) => e);
		expect(err.message).toBe("500 from TMDB /find/tt1");
		const thrown = await tmdbClient(V3, {
			fetchFn: (async (u: string) => {
				throw new Error(`could not reach ${u}`);
			}) as unknown as typeof fetch,
		})("/find/tt1").catch((e) => e);
		expect(thrown.message).not.toContain(V3);

		let n = 0;
		const flaky = (async () => (++n === 1 ? new Response("{}", { status: 429 }) : Response.json({ ok: 1 }))) as unknown as typeof fetch;
		expect(await tmdbClient(V4, { fetchFn: flaky, sleep: async () => {} })("/x")).toEqual({ ok: 1 });
		expect(n).toBe(2);
	});
});

describe("pickMovie", () => {
	const results = [
		{ id: 1, title: "Wicked", release_date: "1985-01-01", poster_path: "/old.jpg" },
		{ id: 2, title: "Wicked Little Letters", release_date: "2024-02-23", poster_path: "/wll.jpg" },
		{ id: 3, title: "Wicked", release_date: "2024-11-22", poster_path: "/new.jpg" },
	];
	test("same title, released within a year either side of the showing, nearest first", () => {
		expect(pickMovie(results, "Wicked", 2025)?.id).toBe(3);
		expect(pickMovie(results, "Wicked", 2024)?.id).toBe(3);
		expect(pickMovie(results, "wicked", 1986)?.id).toBe(1);
		expect(pickMovie(results, "Wicked", 2022)).toBeNull();
		// A near title is not the film.
		expect(pickMovie(results, "Wicked Little", 2024)).toBeNull();
		expect(pickMovie([{ id: 9, title: "Movie", original_title: "Película", release_date: "2024-01-01" }], "Pelicula", 2024)?.id).toBe(9);
	});
});

describe("resolvePoster", () => {
	test("by IMDb id through /find; by title search when there is none", async () => {
		const { fetchFn, calls } = mockFetch({
			"/find/tt15239678": { movie_results: [{ id: 693134, poster_path: "/dune.jpg" }] },
			"/search/movie": (u: URL) => ({
				results: u.searchParams.get("query") === "Air" ? [{ id: 964980, title: "AIR", release_date: "2023-04-05", poster_path: "/air.jpg" }] : [],
			}),
		});
		const get = tmdbClient(V4, { fetchFn });
		expect(await resolvePoster({ imdb_id: "tt15239678" }, { title: "Dune: Part Two", year: 2024 }, get)).toEqual({
			tmdb_id: 693134,
			tmdb_poster: "/dune.jpg",
		});
		expect(calls[0].url.searchParams.get("external_source")).toBe("imdb_id");
		expect(await resolvePoster({ imdb_id: null }, { title: "Air", year: 2023 }, get)).toEqual({ tmdb_id: 964980, tmdb_poster: "/air.jpg" });
		// Outside the year window: no match.
		expect(await resolvePoster({ imdb_id: null }, { title: "Air", year: 2026 }, get)).toBeNull();
		expect(await resolvePoster({}, { title: "Nothing Like It", year: 2024 }, get)).toBeNull();
	});

	test("an IMDb id TMDB doesn't know falls back to the search; AMC's suffixes are dropped", async () => {
		const { fetchFn, calls } = mockFetch({
			"/find/tt0133093": { movie_results: [] },
			"/search/movie": { results: [{ id: 603, title: "The Matrix", release_date: "1999-03-31", poster_path: "/m.jpg" }] },
		});
		const hit = await resolvePoster(
			{ imdb_id: "tt0133093" },
			{ title: "The Matrix - 25th Anniversary", year: null },
			tmdbClient(V4, { fetchFn }),
		);
		expect(hit).toEqual({ tmdb_id: 603, tmdb_poster: "/m.jpg" });
		expect(calls[1].url.searchParams.get("query")).toBe("The Matrix");
	});
});

describe("posters (the cache)", () => {
	const movies = [
		{ id: "a1", name: "Dune: Part Two", iso: "2024-03-08" },
		{ id: "a1", name: "Dune: Part Two", iso: "2024-03-13" },
		{ name: "Air", iso: "2023-04-08" },
		{ name: "Obscure", iso: "2024-05-01" },
		{ name: "Down", iso: "2024-05-02" },
	];
	const routes = {
		"/find/tt15239678": { movie_results: [{ id: 693134, poster_path: "/dune.jpg" }] },
		"/find/tt9": 503,
		"/search/movie": (u: URL) => ({
			results: u.searchParams.get("query") === "Air" ? [{ id: 964980, title: "Air", release_date: "2023-04-05", poster_path: "/air.jpg" }] : [],
		}),
	};

	test("fills posters, stamps a miss, writes nothing on a failure, keeps hand edits", async () => {
		const cache = {
			"dune-part-two": { title: "Dune: Part Two", imdb_id: "tt15239678", primary_genre: "Sci-Fi", amc_id: "a1" },
			air: { title: "Air", imdb_id: null, primary_genre: "Other" },
			obscure: { title: "Obscure", imdb_id: null, primary_genre: "Other" },
			down: { title: "Down", imdb_id: "tt9", primary_genre: "Drama" },
			"hand-set": { title: "Hand Set", imdb_id: "tt1", primary_genre: "Drama", tmdb_poster: "/mine.jpg", note: "fixed" },
			"opted-out": { title: "Opted Out", imdb_id: "tt2", primary_genre: "Drama", tmdb_poster: null },
		};
		const { fetchFn, calls } = mockFetch(routes);
		const r = await posters(movies, cache, tmdbClient(V4, { fetchFn }), "2026-10-31");
		expect(r.cache["dune-part-two"]).toEqual({ ...cache["dune-part-two"], tmdb_id: 693134, tmdb_poster: "/dune.jpg" });
		expect(r.cache.air).toMatchObject({ tmdb_id: 964980, tmdb_poster: "/air.jpg" });
		expect(r.cache.obscure).toEqual({ ...cache.obscure, tmdb_checked: "2026-10-31" });
		expect(r.cache.down).toEqual(cache.down);
		expect(r.failed).toHaveLength(1);
		expect(r.cache["hand-set"]).toEqual(cache["hand-set"]);
		expect(r.cache["opted-out"]).toEqual(cache["opted-out"]);
		// Neither hand-set film was asked about.
		expect(calls.some((c) => /tt1$|tt2$/.test(c.url.pathname))).toBe(false);

		// Next night: only the failure is asked again; the miss waits a week.
		const again = mockFetch(routes);
		const r2 = await posters(movies, r.cache, tmdbClient(V4, { fetchFn: again.fetchFn }), "2026-11-01");
		expect(again.calls.map((c) => c.url.pathname)).toEqual(["/3/find/tt9"]);
		expect(r2.changed).toBe(false);

		const week = mockFetch(routes);
		const later = new Date(Date.parse("2026-10-31") + RECHECK_DAYS * 86_400_000).toISOString().slice(0, 10);
		const r3 = await posters(movies, r.cache, tmdbClient(V4, { fetchFn: week.fetchFn }), later);
		expect(week.calls.some((c) => c.url.searchParams.get("query") === "Obscure")).toBe(true);
		expect(r3.cache.obscure.tmdb_checked).toBe(later);
	});

	test("a hit clears an old miss stamp; a hand-set tmdb_id is looked up directly", async () => {
		const { fetchFn } = mockFetch({ "/movie/42": { id: 42, poster_path: "/42.jpg" } });
		const r = await posters(
			[{ name: "Fixed", iso: "2024-01-01" }],
			{ fixed: { title: "Fixed", imdb_id: null, primary_genre: "Other", tmdb_id: 42, tmdb_checked: "2020-01-01" } },
			tmdbClient(V4, { fetchFn }),
			"2026-10-31",
		);
		expect(r.cache.fixed).toEqual({ title: "Fixed", imdb_id: null, primary_genre: "Other", tmdb_id: 42, tmdb_poster: "/42.jpg" });
	});
});
