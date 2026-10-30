// The AMC tools' pure parts. Nothing here talks to AMC or Wikidata: the
// fetcher must never run locally (its cookie rotates; see fetch.mjs).
import { describe, expect, test } from "bun:test";
import { isoShowtime, pickUpcoming, rotateCookie, toMovie } from "./fetch.mjs";
import { enrich, pickCandidate, screeningYear, searchTitle } from "./enrich.mjs";

describe("fetch: rotateCookie", () => {
	const jar = "authToken=old; session=s1";

	test("a new authToken replaces the old, the session kept", () => {
		expect(rotateCookie(["authToken=new; Path=/; HttpOnly"], jar)).toBe("authToken=new; session=s1");
	});

	test("both rotating at once", () => {
		expect(rotateCookie(["authToken=a2; Path=/", "session=s2; Secure"], jar)).toBe("authToken=a2; session=s2");
	});

	test("nothing new, an unrelated cookie, or a deletion: no rotation", () => {
		expect(rotateCookie([], jar)).toBeNull();
		expect(rotateCookie(["authToken=old; Path=/"], jar)).toBeNull();
		expect(rotateCookie(["__cf_bm=x; Path=/"], jar)).toBeNull();
		expect(rotateCookie(["authToken=; Max-Age=0"], jar)).toBeNull();
	});

	test("chained: each response rotates the cookie the last one left", () => {
		const one = rotateCookie(["authToken=t1"], jar)!;
		const two = rotateCookie(["authToken=t2"], one)!;
		expect(two).toBe("authToken=t2; session=s1");
	});
});

describe("fetch: showtimes", () => {
	test("display fields to local ISO", () => {
		expect(isoShowtime({ monthDate: "January 10", year: 2024, time: "7:45", amPm: "pm" })).toEqual({
			iso: "2024-01-10",
			start: "2024-01-10T19:45",
		});
		expect(isoShowtime({ monthDate: "May 26", year: "2026", time: "12:15", amPm: "AM" })).toEqual({
			iso: "2026-05-26",
			start: "2026-05-26T00:15",
		});
		expect(isoShowtime({ monthDate: "Sept. 3", year: 2025, time: "12:30", amPm: "pm" }).start).toBe("2025-09-03T12:30");
		expect(isoShowtime({ monthDate: "Today", year: 2025 })).toEqual({ iso: null, start: null });
	});

	test("toMovie: refunds dropped, booked flagged, AMC ids and UTC kept", () => {
		const node = {
			movie: { id: "TW92aWU6NzQxMzg=", name: "Ferrari", preferredPoster: { url: "https://p/x.jpg" } },
			theatre: { name: "AMC Kabuki 8" },
			showtime: {
				showDateTimeUtc: "2024-01-11T03:45:00.000Z",
				display: { prefix: "Wednesday", monthDate: "January 10", year: 2024, time: "7:45", amPm: "pm" },
			},
			order: { isRefunded: false },
		};
		expect(toMovie(node)).toEqual({
			id: "TW92aWU6NzQxMzg=",
			name: "Ferrari",
			poster: "https://p/x.jpg",
			theatre: "AMC Kabuki 8",
			date: "January 10, 2024",
			time: "7:45pm",
			day: "Wednesday",
			iso: "2024-01-10",
			start: "2024-01-10T19:45",
			utc: "2024-01-11T03:45:00.000Z",
		});
		expect(toMovie(node, true)?.upcoming).toBe(true);
		expect(toMovie({ ...node, order: { isRefunded: true } })).toBeNull();
	});
});

describe("fetch: pickUpcoming", () => {
	// Introspection as AMC would answer it: events(type: AccountEventType!, …).
	const account = (values: string[], dateKind = "SCALAR") => ({
		name: "Account",
		fields: [
			{ name: "id", args: [] },
			{
				name: "events",
				args: [
					{
						name: "type",
						type: {
							kind: "NON_NULL",
							name: null,
							enumValues: null,
							ofType: { kind: "ENUM", name: "AccountEventType", enumValues: values.map((name) => ({ name })), ofType: null },
						},
					},
					{ name: "startDate", type: { kind: dateKind, name: dateKind === "SCALAR" ? "Date" : null } },
					{ name: "endDate", type: { kind: dateKind, name: dateKind === "SCALAR" ? "Date" : null } },
					{ name: "first", type: { kind: "SCALAR", name: "Int" } },
				],
			},
		],
	});

	test("finds the upcoming value through NON_NULL", () => {
		expect(pickUpcoming(account(["Previous", "Upcoming"]))).toEqual({
			value: "Upcoming",
			values: ["Previous", "Upcoming"],
			withDates: false,
		});
		expect(pickUpcoming(account(["PAST", "FUTURE"])).value).toBe("FUTURE");
	});

	test("a date range only when the field requires one", () => {
		expect(pickUpcoming(account(["Upcoming"], "NON_NULL")).withDates).toBe(true);
	});

	test("no match, no events field, nothing: a null value", () => {
		expect(pickUpcoming(account(["Previous", "All"])).value).toBeNull();
		expect(pickUpcoming({ fields: [] }).value).toBeNull();
		expect(pickUpcoming(null).value).toBeNull();
	});
});

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

	test("pickCandidate: released within a year of the screening, nearest first", () => {
		const rows = [
			row("Q1", 0, "tt0098", "1989-01-01", "drama film"),
			row("Q2", 3, "tt3758542", "2023-08-31", "biographical film", "film"),
			row("Q2", 3, "tt3758542", "2023-12-25", "drama film", "film"),
		];
		expect(pickCandidate(rows, 2024)).toEqual({ imdb_id: "tt3758542", labels: ["biographical film", "drama film", "film"] });
		expect(pickCandidate(rows, 2026)).toBeNull();
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
