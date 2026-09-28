import { test, expect, type Page } from "@playwright/test";

/**
 * THE BLOG: /txt, ITS CATEGORY AND TAG PAGES, AND A POST.
 *
 * The index is the QUILT — a grid of art tiles, one link per post, newest
 * first in DOM order, with fillers that are aria-hidden and carry no link (the
 * interaction contract — hover, search, keys — is pinned in its own spec).
 * The category and tag pages are still the year-grouped list, categories are
 * a closed set with real routes, and the older /txt/tag/<tag> URLs still
 * resolve. The properties worth pinning:
 *
 *  1. EXACTLY ONE LINK PER POST on the index, newest first; fillers link nothing.
 *  2. A CATEGORY PAGE LISTS ONLY ITS POSTS, and /txt/categories reaches it.
 *  3. TAG PAGES STILL RESOLVE — they predate the redesign and may be linked.
 *  4. IT WORKS WITH SCRIPTING OFF: tiles, rows and nav are plain links.
 *  5. A POST carries its date, title, category pill and a reading column.
 */

/** The post links on a list page (category, tag): one per PostRow. */
const postLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>("a.ds-post-row__link"))
			.map((a) => a.getAttribute("href"))
			.filter((h) => h && /^\/txt\/[^/]+$/.test(h))
	);

/** The post links on the quilt: one per post tile, in DOM order. */
const tileLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-cell="post"] a'))
			.map((a) => a.getAttribute("href"))
			.filter((h) => h && /^\/txt\/[^/]+$/.test(h))
	);

test.describe("/txt", () => {
	test("every post is a tile linked exactly once, newest first; fillers link nothing", async ({
		page,
	}) => {
		await page.goto("/txt");
		const links = await tileLinks(page);
		expect(links.length, "the quilt should link some posts").toBeGreaterThan(0);
		expect(new Set(links).size, `duplicate post links: ${links}`).toBe(links.length);
		// DOM order is newest first — the tab order and the phone's list.
		expect(links.slice(0, 2)).toEqual(["/txt/asserting-on-agent-behavior", "/txt/tahoe-mountain-hair"]);

		const fillers = page.locator('[data-cell="filler"]');
		expect(await fillers.count()).toBeGreaterThan(0);
		await expect(fillers.first()).toHaveAttribute("aria-hidden", "true");
		expect(await page.locator('[data-cell="filler"] a').count()).toBe(0);
	});

	test("a category page lists only its posts, and the categories page links it", async ({
		page,
	}) => {
		await page.goto("/txt/categories");
		const programming = page.locator('a.ds-post-row__link[href="/txt/category/programming"]');
		await expect(programming).toHaveCount(1);
		await programming.click();
		await expect(page).toHaveURL(/\/txt\/category\/programming\/?$/);
		expect(await postLinks(page)).toEqual([
			"/txt/asserting-on-agent-behavior",
			"/txt/no-honey-we-have-a-dashboard-at-home",
		]);
		await expect(page.locator(".ds-post-row__meta")).toHaveText([/Programming/, /Programming/]);
	});

	test("tag pages still resolve", async ({ page }) => {
		const res = await page.request.get("/txt/tag/diy");
		expect(res.status()).toBe(200);
		await page.goto("/txt/tag/diy");
		expect(await postLinks(page)).toEqual(["/txt/mega-desk"]);
		// A tag page is thin archive, so it asks not to be indexed.
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	});

	test("tiles, rows and nav are reachable with scripting off", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt");
		await page.locator('.site-header a[href="/txt/categories"]').click();
		await expect(page).toHaveURL(/\/txt\/categories\/?$/);
		await page.goto("/txt");
		await page.locator('[data-cell="post"] a[href="/txt/mega-desk"]').click();
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
		await expect(page.locator("h1")).toHaveText("The Mega Desk");
		await context.close();
	});

	test("a post carries its date, category pill and reading column", async ({ page }) => {
		await page.goto("/txt/mega-desk");
		await expect(page.locator(".post__date time").first()).toHaveAttribute("datetime", "2025-04-06");
		await expect(page.locator(".post__date")).toContainText("Apr 6, 2025");
		const pill = page.locator("a.ds-pill.post__category");
		await expect(pill).toHaveAttribute("href", "/txt/category/projects");
		await expect(pill).toContainText(/projects/i);
		await expect(page.locator(".ds-prose")).toBeVisible();
		expect(await page.locator(".ds-prose > p, .ds-prose > .ds-body").count()).toBeGreaterThan(3);
		// No horizontal overflow at phone width.
		await page.setViewportSize({ width: 390, height: 844 });
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
