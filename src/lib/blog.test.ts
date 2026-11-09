import { describe, expect, test } from "bun:test";
import { demoHref, isPublished, padNo, postPlaces, tagLabel } from "./blog";

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
		const places = postPlaces(demos);
		expect(`demo / ${padNo(places.get("b")!.no)}`).toBe("demo / 002");
		expect(places.get("a")!.no).toBe(1);
		expect(demoHref("sutro")).toBe("/demo/sutro/");
	});
});

describe("postPlaces", () => {
	const newestFirst = [entry("c", "2026-03-01"), entry("b", "2026-02-01"), entry("a", "2026-01-01")];
	const places = postPlaces(newestFirst);

	test("prev is the older neighbour, next the newer", () => {
		expect(places.get("b")!.prev?.id).toBe("a");
		expect(places.get("b")!.next?.id).toBe("c");
	});

	test("the ends have no neighbour on their open side", () => {
		expect(places.get("a")!.prev).toBeNull();
		expect(places.get("c")!.next).toBeNull();
	});

	test("the newest takes the highest number", () => {
		expect(newestFirst.map((p) => places.get(p.id)!.no)).toEqual([3, 2, 1]);
	});
});

test("a tag's hyphens print as spaces", () => {
	expect(tagLabel("side-projects")).toBe("side projects");
});
