import { describe, expect, test } from "bun:test";
import { cookieHeader, mapColumns, parseCsv, parseShowtime, rotatedCookie, toMovies } from "./cinemoo.mjs";

describe("parseCsv", () => {
	test("quotes, escaped quotes, commas and CRLF", () => {
		expect(parseCsv('a,b\r\n"Dune: Part Two","AMC Metreon 16, SF"\r\n"Say ""hi""",x\n')).toEqual([
			["a", "b"],
			["Dune: Part Two", "AMC Metreon 16, SF"],
			['Say "hi"', "x"],
		]);
	});
});

describe("parseShowtime", () => {
	test("ISO stamp keeps the printed wall-clock time", () => {
		expect(parseShowtime("2024-01-10T19:45:00Z")).toEqual({
			iso: "2024-01-10",
			date: "January 10, 2024",
			day: "Wednesday",
			time: "7:45pm",
			start: "2024-01-10T19:45",
		});
	});
	test("US date plus 12-hour time", () => {
		expect(parseShowtime("1/13/2024", "11:45 AM")).toMatchObject({ iso: "2024-01-13", time: "11:45am", start: "2024-01-13T11:45" });
		expect(parseShowtime("1/13/2024", "12:05 AM")).toMatchObject({ start: "2024-01-13T00:05", time: "12:05am" });
	});
	test("long date without a time", () => {
		expect(parseShowtime("January 12, 2024")).toMatchObject({ iso: "2024-01-12", time: null, start: null });
	});
	test("garbage is null", () => {
		expect(parseShowtime("soon")).toBeNull();
	});
});

describe("mapColumns", () => {
	test("finds film, theater and showtime by name", () => {
		expect(mapColumns(["Film", "Theater", "Showtime", "Seat", "Format"])).toMatchObject({ name: 0, theatre: 1, showtime: 2 });
		expect(mapColumns(["movie_title", "date", "time", "cinema"])).toMatchObject({ name: 0, date: 1, time: 2, theatre: 3 });
	});
});

describe("toMovies", () => {
	const rows = [
		["Film", "Theater", "Date", "Time", "Status"],
		["Mean Girls", "AMC Metreon 16", "2024-01-12", "7:00 PM", ""],
		["Ferrari", "AMC Kabuki 8", "2024-01-10", "7:45 PM", ""],
		["Refunded Film", "AMC Kabuki 8", "2024-01-11", "7:00 PM", "Refunded"],
		["Future Film", "AMC Kabuki 8", "2030-01-01", "7:00 PM", ""],
	];
	const known = new Map([["ferrari", { id: 74138, poster: "https://example/ferrari.jpg" }]]);
	const movies = toMovies(rows, known, new Date(2026, 9, 31));

	test("oldest first, refunds dropped", () => {
		expect(movies.map((m) => m.name)).toEqual(["Ferrari", "Mean Girls", "Future Film"]);
	});
	test("keeps the AMC poster and id on file", () => {
		expect(movies[0]).toMatchObject({ id: 74138, poster: "https://example/ferrari.jpg", theatre: "AMC Kabuki 8", day: "Wednesday" });
		expect(movies[1]).toMatchObject({ id: null, poster: null });
	});
	test("a future showtime is upcoming", () => {
		expect(movies[2].upcoming).toBe(true);
		expect(movies[0].upcoming).toBeUndefined();
	});
	test("names the header when it cannot map it", () => {
		expect(() => toMovies([["a", "b"]])).toThrow("[a | b]");
	});
});

describe("session cookie", () => {
	test("a bare token becomes the Auth.js cookie", () => {
		expect(cookieHeader(" abc ")).toBe("__Secure-authjs.session-token=abc");
		expect(cookieHeader("x=1; y=2")).toBe("x=1; y=2");
	});
	test("a reissued token is picked up; others and clears are ignored", () => {
		const sc = ["__Secure-authjs.session-token=new; Path=/; HttpOnly", "ph_x=1; Path=/"];
		expect(rotatedCookie(sc, "old")).toBe("__Secure-authjs.session-token=new");
		expect(rotatedCookie(["__Secure-authjs.session-token=; Max-Age=0"], "old")).toBeNull();
		expect(rotatedCookie(["__Secure-authjs.session-token=old"], "old")).toBeNull();
	});
});
