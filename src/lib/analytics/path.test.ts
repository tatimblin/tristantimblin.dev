import { describe, expect, test } from "bun:test";
import { normalisePath, shouldCount } from "./path";

describe("normalisePath", () => {
	test.each([
		["/", "/"],
		["/txt", "/txt/"],
		["/txt/", "/txt/"],
		["/txt/Mega-Desk", "/txt/mega-desk/"],
		["/txt/mega-desk/?utm_source=x", "/txt/mega-desk/"],
		["/txt/mega-desk/#intro", "/txt/mega-desk/"],
		["/txt/mega-desk?a=1#b", "/txt/mega-desk/"],
		["/txt//mega-desk//", "/txt/mega-desk/"],
		["/demo/sutro/index.html", "/demo/sutro/"],
		["/index.html", "/"],
		["/404", "/404/"],
		["  /txt/  ", "/txt/"],
		["https://tristantimblin.dev/txt/mega-desk?x=1", "/txt/mega-desk/"],
	])("%s → %s", (input, expected) => {
		expect(normalisePath(input)).toBe(expected);
	});

	test.each([
		[""],
		["   "],
		["txt/mega-desk"],
		["//evil.example/x"],
		["/txt/../etc/passwd"],
		["/./"],
		["/wp login.php"],
		["/txt/%2e%2e/"],
		["/<script>/"],
		["/ünïcode/"],
		[`/${"a".repeat(250)}/`],
		["javascript:alert(1)"],
	])("rejects %p", (input) => {
		expect(normalisePath(input)).toBeNull();
	});

	test("rejects non-strings", () => {
		expect(normalisePath(null)).toBeNull();
		expect(normalisePath(undefined)).toBeNull();
	});

	test("is idempotent", () => {
		for (const input of ["/", "/txt/Mega-Desk?x", "/demo/sutro/index.html"]) {
			const once = normalisePath(input);
			expect(normalisePath(once)).toBe(once);
		}
	});
});

describe("shouldCount", () => {
	test("counts on the production hosts", () => {
		expect(shouldCount({ hostname: "tristantimblin.dev" })).toBe(true);
		expect(shouldCount({ hostname: "www.tristantimblin.dev" })).toBe(true);
		expect(shouldCount({ hostname: "TristanTimblin.dev", webdriver: false })).toBe(true);
	});

	test("never under automation", () => {
		expect(shouldCount({ hostname: "tristantimblin.dev", webdriver: true })).toBe(false);
	});

	test.each([
		["localhost"],
		["127.0.0.1"],
		["abc123.tristantimblin-dev.pages.dev"],
		["media.tristantimblin.dev"],
		["tristantimblin.dev.evil.example"],
		[""],
	])("never on %p", (hostname) => {
		expect(shouldCount({ hostname })).toBe(false);
	});
});
