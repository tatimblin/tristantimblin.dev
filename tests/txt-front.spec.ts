import { test, expect, type Page } from "@playwright/test";

/**
 * THE /txt FRONT PAGE.
 *
 * The page ships two server-rendered views — the curated front page and a plain
 * grid of every story — and the category rail swaps between them. Two properties
 * matter enough to pin down:
 *
 *  1. EXACTLY ONE LINK PER STORY, always. Both views contain every story, so if
 *     they were ever visible at the same time a screen reader's link list would
 *     show each headline twice. `hidden` is what keeps the inactive view out of
 *     the accessibility tree, and it is easy to break by reaching for opacity or a
 *     display class instead.
 *  2. THE RAIL ONLY APPEARS IF IT WORKS. The chips are buttons with no no-JS
 *     fallback, so they ship `hidden` and the script unhides them. A visitor
 *     without JS must never see controls that do nothing.
 */

const visibleLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/txt/"]'))
			.filter((a) => a.offsetParent !== null)
			.map((a) => a.getAttribute("href"))
	);

test.describe("/txt front page", () => {
	test("every story is linked exactly once, in either view", async ({ page }) => {
		await page.goto("/txt");

		const front = await visibleLinks(page);
		expect(front.length, "front page should link some stories").toBeGreaterThan(0);
		expect(new Set(front).size, `duplicate story links on the front page: ${front}`).toBe(
			front.length
		);

		// Switch to a filtered view and re-check. This is the case that regresses:
		// the grid becomes visible while the curated view is still in the tree.
		await page.getByRole("button", { name: "developer tools" }).click();
		const filtered = await visibleLinks(page);
		expect(filtered.length).toBeGreaterThan(0);
		expect(new Set(filtered).size, `duplicate story links when filtered: ${filtered}`).toBe(
			filtered.length
		);
	});

	test("a category filters to only its own stories, and All restores the edit", async ({
		page,
	}) => {
		await page.goto("/txt");

		const all = await visibleLinks(page);

		await page.getByRole("button", { name: "diy" }).click();
		await expect(page.getByRole("button", { name: "diy" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		// "diy" is carried by exactly one post in the collection.
		expect(await visibleLinks(page)).toEqual(["/txt/mega-desk"]);

		await page.getByRole("button", { name: "All", exact: true }).click();
		expect(await visibleLinks(page)).toEqual(all);
	});

	test("exactly one chip is pressed at a time", async ({ page }) => {
		await page.goto("/txt");
		const pressed = () =>
			page.locator('[data-chip-rail] [aria-pressed="true"]').count();

		expect(await pressed()).toBe(1);
		await page.getByRole("button", { name: "career" }).click();
		expect(await pressed()).toBe(1);
	});

	test("the category rail is not shown when it cannot work", async ({ browser }) => {
		// No JS: the chips would be inert, so the rail must stay hidden and the full
		// front page must still be readable.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt");

		await expect(page.locator("[data-chip-rail]")).toBeHidden();
		await expect(page.locator('[data-view="front"]')).toBeVisible();
		expect((await visibleLinks(page)).length).toBeGreaterThan(0);

		await context.close();
	});
});
