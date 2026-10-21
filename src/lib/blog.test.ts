import { describe, expect, test } from "bun:test";
import { demoHref, isPublished, padNo, postNumbers } from "./blog";

const entry = (id: string, date: string, draft = false) => ({ id, data: { date: new Date(date), draft } });

describe("demos", () => {
	test("a draft is left out of a production build and kept on a dev server", () => {
		const draft = entry("wip", "2026-10-01", true);
		const live = entry("sutro", "2026-10-21");
		expect([draft, live].filter((e) => isPublished(e, false)).map((e) => e.id)).toEqual(["sutro"]);
		expect([draft, live].filter((e) => isPublished(e, true)).map((e) => e.id)).toEqual(["wip", "sutro"]);
	});

	test("are numbered on their own, oldest first, and served under /demo/", () => {
		const demos = [entry("b", "2026-10-21"), entry("a", "2025-01-01")];
		const nos = postNumbers(demos);
		expect(`demo / ${padNo(nos.get("b")!)}`).toBe("demo / 002");
		expect(nos.get("a")).toBe(1);
		expect(demoHref("sutro")).toBe("/demo/sutro/");
	});
});
