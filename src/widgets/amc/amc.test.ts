import { describe, expect, test } from "bun:test";
import { buildFilms, getFilms, imdbHref, isoDate, posterUrl, tmdbPosterUrl, type CacheEntry } from "./amc";
import { asGenre, filmKey, genreBucket, GENRES } from "./genres";
import cache from "../../data/amc-films.json";
import amc from "../../data/amc.json";
import { upcomingCache, upcomingMovies } from "../../../tests/fixtures/amc";

describe("genreBucket", () => {
	test("IMDb's genres, by priority", () => {
		expect(genreBucket(["Adventure", "Animation", "Comedy"])).toBe("Animation");
		expect(genreBucket(["Biography", "Drama", "Music"])).toBe("Biopic");
		expect(genreBucket(["Action", "Adventure", "Sci-Fi"])).toBe("Sci-Fi");
		expect(genreBucket(["Action", "Crime", "Thriller"])).toBe("Action");
		expect(genreBucket(["Crime", "Music", "Mystery"])).toBe("Thriller");
		expect(genreBucket(["Comedy", "Drama", "Romance"])).toBe("Comedy");
		expect(genreBucket(["Drama", "Western"])).toBe("Drama");
	});

	test("Wikidata's labels, instance-of included", () => {
		expect(genreBucket(["animated film", "comedy drama", "coming-of-age film"])).toBe("Animation");
		expect(genreBucket(["action film", "anime film", "thriller film"])).toBe("Animation");
		expect(genreBucket(["biographical film", "drama film"])).toBe("Biopic");
		expect(genreBucket(["action film", "science fiction film"])).toBe("Sci-Fi");
		expect(genreBucket(["space Western"])).toBe("Sci-Fi");
		expect(genreBucket(["psychological thriller film", "horror film"])).toBe("Thriller");
		expect(genreBucket(["romantic comedy film", "drama film"])).toBe("Comedy");
		expect(genreBucket(["crime film", "drama film"])).toBe("Thriller");
	});

	test("musicals, family films and nothing at all are Other", () => {
		expect(genreBucket(["Fantasy", "Musical", "Romance"])).toBe("Other");
		expect(genreBucket(["family film", "fantasy film"])).toBe("Other");
		expect(genreBucket([])).toBe("Other");
	});

	test("asGenre reads a hand edit's case, and an old bucket as Other", () => {
		expect(asGenre("sci-fi")).toBe("Sci-Fi");
		expect(asGenre("Musical")).toBe("Other");
		expect(asGenre(undefined)).toBe("Other");
	});
});

describe("filmKey", () => {
	test("case, accents and punctuation don't split a film", () => {
		expect(filmKey("Let's Start A Cult")).toBe("lets-start-a-cult");
		expect(filmKey("Lets Start a Cult")).toBe("lets-start-a-cult");
		expect(filmKey("Amélie")).toBe("amelie");
		expect(filmKey("Star Wars: The Mandalorian and Grogu")).toBe("star-wars-the-mandalorian-and-grogu");
		expect(filmKey("Fast & Furious")).toBe("fast-and-furious");
	});
});

describe("the cache", () => {
	test("covers every film in amc.json, each in a known bucket", () => {
		const c = cache as Record<string, CacheEntry>;
		// A booked film Wikidata can't place yet is retried, not cached
		// (tools/amc/enrich.mjs), so only films already seen must be covered.
		for (const m of amc.movies) if (!("upcoming" in m && m.upcoming)) expect(c[filmKey(m.name)]).toBeDefined();
		for (const e of Object.values(c)) expect(GENRES).toContain(e.primary_genre as (typeof GENRES)[number]);
	});
});

describe("posterUrl", () => {
	const bare = "https://amc-theatres-res.cloudinary.com/v1699911805/amc-cdn/production/2/movies/74100/74138/PosterDynamic/160412.jpg";
	const want =
		"https://amc-theatres-res.cloudinary.com/image/upload/c_fill,ar_2:3,w_240/v1699911805/amc-cdn/production/2/movies/74100/74138/PosterDynamic/160412.jpg";

	test("AMC's Cloudinary, cropped to an exact 2:3", () => {
		expect(posterUrl(bare)).toBe(want);
		expect(posterUrl(bare, 600)).toBe(want.replace("w_240", "w_600"));
	});

	test("an image/upload URL, with or without a transform, gets ours", () => {
		const up = bare.replace(".com/", ".com/image/upload/");
		expect(posterUrl(up)).toBe(want);
		expect(posterUrl(up.replace("upload/", "upload/c_fill,ar_2:3,w_600/"))).toBe(want);
	});

	test("another host is left alone; none is null", () => {
		expect(posterUrl("https://upload.wikimedia.org/x.jpg")).toBe("https://upload.wikimedia.org/x.jpg");
		expect(posterUrl(null)).toBeNull();
	});
});

describe("buildFilms", () => {
	test("dates: the fetch's iso, else parsed from the display date", () => {
		expect(isoDate({ iso: "2026-11-21" })).toBe("2026-11-21");
		expect(isoDate({ date: "January 10, 2024" })).toBe("2024-01-10");
		expect(isoDate({ date: "September 3, 2025" })).toBe("2025-09-03");
		expect(isoDate({ date: "TBA" })).toBeNull();
	});

	test("IMDb: the title page, or a search without an id", () => {
		expect(imdbHref("tt3758542", "Ferrari")).toBe("https://www.imdb.com/title/tt3758542/");
		expect(imdbHref(null, "Hexed")).toBe("https://www.imdb.com/find/?q=Hexed");
	});

	test("the real data: every film dated, in watch order, genre and link from the cache", () => {
		const films = getFilms();
		expect(films.length).toBe(amc.movies.length);
		for (let i = 1; i < films.length; i++) expect(films[i].d >= films[i - 1].d).toBe(true);
		// Seen twice; each showing is its own entry.
		const dunes = films.filter((f) => f.n === "Dune: Part Two");
		expect(dunes.map((f) => f.d)).toEqual(["2024-03-08", "2024-03-13"]);
		expect(dunes[1]).toMatchObject({ g: "Sci-Fi", h: "https://www.imdb.com/title/tt15239678/" });
		expect(dunes[1].p).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w185\/|\/image\/upload\/c_fill,ar_2:3,w_240\//);
		// Every film with a TMDB poster path shows it from TMDB's CDN.
		const c = cache as Record<string, CacheEntry>;
		for (const f of films) {
			const tmdb = c[filmKey(f.n)]?.tmdb_poster;
			if (tmdb && !c[filmKey(f.n)]?.poster) expect(f.p).toBe(`https://image.tmdb.org/t/p/w185${tmdb}`);
		}
		// Booked films, if any, are the ones after the data was written.
		const written = amc.updated.slice(0, 10);
		for (const f of films) expect(Boolean(f.u)).toBe(f.d > written);
	});

	test("booked films (the fixture) land after the seen ones, flagged, joined by AMC id", () => {
		const today = new Date(2026, 9, 30);
		const films = buildFilms([...amc.movies, ...upcomingMovies(today)], {
			...(cache as Record<string, CacheEntry>),
			...upcomingCache,
		});
		const fixture = new Set(upcomingMovies(today).map((m) => m.name));
		const booked = films.filter((f) => f.u && fixture.has(f.n));
		expect(booked.map((f) => [f.n, f.d, f.g])).toEqual([
			["The Hunger Games: Sunrise on the Reaping", "2026-11-21", "Action"],
			["Hexed", "2026-11-27", "Animation"],
		]);
		expect(films.slice(-2)).toEqual(booked);
		expect(booked[1].h).toBe("https://www.imdb.com/find/?q=Hexed");
	});

	test("a film the cache doesn't know is Other, linked to a search; a hand-set poster wins", () => {
		const [f] = buildFilms([{ name: "New Film", iso: "2026-12-01", poster: "https://amc-theatres-res.cloudinary.com/v1/a.jpg" }], {});
		expect(f).toMatchObject({ n: "New Film", g: "Other", h: "https://www.imdb.com/find/?q=New%20Film" });
		const [g] = buildFilms([{ name: "X", iso: "2026-12-01" }], { x: { primary_genre: "Drama", poster: "https://example.com/p.jpg" } });
		expect(g).toMatchObject({ g: "Drama", p: "https://example.com/p.jpg" });
	});

	test("the poster: a hand-set one, then TMDB's at w185, then AMC's, else none", () => {
		const amcPoster = "https://amc-theatres-res.cloudinary.com/v1/a.jpg";
		const pick = (entry: CacheEntry, poster: string | null = amcPoster) =>
			buildFilms([{ name: "X", iso: "2026-01-01", poster }], { x: { primary_genre: "Drama", ...entry } })[0].p;
		expect(pick({ tmdb_poster: "/abc.jpg" })).toBe("https://image.tmdb.org/t/p/w185/abc.jpg");
		expect(pick({ tmdb_poster: "/abc.jpg", poster: "https://example.com/p.jpg" })).toBe("https://example.com/p.jpg");
		expect(pick({})).toBe(posterUrl(amcPoster));
		expect(pick({ tmdb_poster: null })).toBe(posterUrl(amcPoster));
		expect(pick({}, null)).toBeNull();
		expect(tmdbPosterUrl("/x.jpg", "w342")).toBe("https://image.tmdb.org/t/p/w342/x.jpg");
		expect(tmdbPosterUrl("https://evil.example/x.jpg")).toBeNull();
	});
});
