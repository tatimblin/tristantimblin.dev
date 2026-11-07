import { describe, expect, test } from "bun:test";
import { devowel, middleTruncate, slugForms } from "./slug";

describe("slug forms", () => {
	test("vowels out, each word's first letter kept", () => {
		expect(devowel("tristans-very-first-slug")).toBe("trstns-vry-frst-slg");
		expect(devowel("asserting-on-agent-behavior")).toBe("assrtng-on-agnt-bhvr");
	});

	test("a middle ellipsis, the head getting the odd character", () => {
		expect(middleTruncate("trstns-vry-frst-slg", 17)).toBe("trstns-v…frst-slg");
		expect(middleTruncate("trstns-vry-frst-slg", 7)).toBe("trs…slg");
		expect(middleTruncate("short", 10)).toBe("short");
	});

	test("longest first: the slug, without vowels, then shorter by one to three a side", () => {
		const forms = slugForms("tristans-very-first-slug");
		expect(forms[0]).toBe("tristans-very-first-slug");
		expect(forms[1]).toBe("trstns-vry-frst-slg");
		expect(forms).toContain("trstns-v…frst-slg");
		expect(forms[forms.length - 1]).toBe("trs…slg");
		for (let i = 1; i < forms.length; i++) expect(forms[i].length).toBeLessThan(forms[i - 1].length);
	});

	test("a slug with nothing to drop starts truncating at once", () => {
		expect(slugForms("why")[0]).toBe("why");
		expect(slugForms("rhythm-myth")).toEqual(["rhythm-myth", "rhyth…myth", "rhyt…myth", "rhyt…yth", "rhy…yth"]);
	});

	test("a short slug stops at its vowel-free form", () => {
		expect(slugForms("subhumans")).toEqual(["subhumans", "sbhmns"]);
	});
});
