// The enrich step's pure parts, and enrich() on a stubbed lookup. Nothing here
// talks to Wikidata.
import { describe, expect, test } from "bun:test";
import { enrich, pickCandidate, screeningYear, searchTitle } from "./enrich.mjs";

describe("enrich", () => {
	test("search titles drop AMC's suffixes", () => {
		expect(searchTitle("IF (2024)")).toBe("IF");
		expect(searchTitle("Dune: Part Two: The IMAX 70mm Experience")).toBe("Dune: Part Two");
		expect(searchTitle("Wicked - Opening Night Fan Event")).toBe("Wicked");
		expect(searchTitle("Dune: Part Two")).toBe("Dune: Part Two");
		expect(screeningYear({ iso: "2025-01-12" })).toBe(2025);
		expect(screeningYear({ date: "January 12, 2025" })).toBe(2025);
	});

	const row = (item: string, ordinal: number, imdb: string, date: string, genre?: string, type?: string) => ({
		item: { value: item },
		ordinal: { value: String(ordinal) },
		imdb: { value: imdb },
		date: { value: `${date}T00:00:00Z` },
		...(genre ? { genre: { value: genre } } : {}),
		...(type ? { type: { value: type } } : {}),
	});

	test("pickCandidate: released within a year either side of the screening, nearest first", () => {
		const rows = [
			row("Q1", 0, "tt0098", "1989-01-01", "drama film"),
			row("Q2", 3, "tt3758542", "2023-08-31", "biographical film", "film"),
			row("Q2", 3, "tt3758542", "2023-12-25", "drama film", "film"),
		];
		expect(pickCandidate(rows, 2024)).toEqual({ imdb_id: "tt3758542", labels: ["biographical film", "drama film", "film"] });
		expect(pickCandidate(rows, 2022)).toEqual({ imdb_id: "tt3758542", labels: ["biographical film", "drama film", "film"] });
		expect(pickCandidate(rows, 2026)).toBeNull();
		expect(pickCandidate(rows, 2021)).toBeNull();
	});

	test("a booked film Wikidata can't place yet is retried, not cached; once seen, it is", async () => {
		const booked = { id: "m9", name: "Not Out Yet", iso: "2026-12-01", upcoming: true };
		const miss = async () => null;
		const r = await enrich([booked], {}, miss);
		expect(r.cache).toEqual({});
		expect(r.pending).toEqual(["Not Out Yet"]);
		expect(r.changed).toBe(false);
		const seen = await enrich([{ ...booked, upcoming: undefined }], r.cache, miss);
		expect(seen.cache["not-out-yet"]).toMatchObject({ imdb_id: null, primary_genre: "Other" });
	});

	test("hand edits survive; new films are looked up; a failed lookup caches nothing", async () => {
		const cache = { ferrari: { title: "Ferrari", imdb_id: "tt1", primary_genre: "Drama", note: "hand-fixed" } };
		const movies = [
			{ id: "m1", name: "Ferrari", iso: "2024-01-10" },
			{ id: "m2", name: "Zootopia 2", iso: "2025-11-26" },
			{ id: "m3", name: "Obscure Short", iso: "2025-11-27" },
			{ id: "m4", name: "Down Today", iso: "2025-11-28" },
		];
		const lookup = async (m: { name: string }) => {
			if (m.name === "Zootopia 2") return { imdb_id: "tt26443597", labels: ["animated film", "comedy film"] };
			if (m.name === "Down Today") throw new Error("503");
			return null;
		};
		const r = await enrich(movies, cache, lookup);
		expect(r.cache.ferrari).toEqual({ ...cache.ferrari, amc_id: "m1" });
		expect(r.cache["zootopia-2"]).toEqual({ title: "Zootopia 2", imdb_id: "tt26443597", primary_genre: "Animation", amc_id: "m2" });
		expect(r.cache["obscure-short"]).toEqual({ title: "Obscure Short", imdb_id: null, primary_genre: "Other", amc_id: "m3" });
		expect(r.cache["down-today"]).toBeUndefined();
		expect(r.failed).toHaveLength(1);
		expect(Object.keys(r.cache)).toEqual(["down-today", "ferrari", "obscure-short", "zootopia-2"].filter((k) => k in r.cache));

		// A renamed film keeps its entry through its AMC id; a second run is a no-op.
		const again = await enrich([{ id: "m2", name: "Zootopia 2 (2025)", iso: "2025-11-26" }], r.cache, lookup);
		expect(again.changed).toBe(false);
	});
});
