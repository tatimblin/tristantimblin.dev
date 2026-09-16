import { test, expect, type Page } from "@playwright/test";

/**
 * THE /txt FRONT PAGE AND ITS CATEGORY EDITIONS.
 *
 * Categories are real routes (/txt/tag/<tag>), not a client-side filter, and the
 * properties worth pinning down follow from that choice:
 *
 *  1. A CATEGORY STILL GETS AN EDIT. The whole reason for the route is that
 *     filtering must not collapse the layout into a list — a tag page renders the
 *     same lead-plus-rail front page from a smaller pile of stories. If someone
 *     later swaps it for a uniform grid, the lead disappears and this catches it.
 *  2. EXACTLY ONE LINK PER STORY. The old implementation shipped two copies of
 *     every story and hid one; the route split removed that, and this makes sure
 *     duplicates do not creep back.
 *  3. IT WORKS WITH SCRIPTING OFF. The chips are links now, so nothing on this
 *     page should depend on JS to be reachable.
 *  4. THE RAIL OFFERS SECTIONS, NOT LABELS. A tag needs two stories before it is
 *     surfaced (src/lib/tags.ts), so the rail stops advertising sections that turn
 *     out to be a single article. Its page still exists and still works — the rule
 *     governs what is OFFERED, not what resolves.
 */

const storyLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/txt/"]'))
			.filter((a) => !a.getAttribute("href")!.startsWith("/txt/tag/"))
			.filter((a) => a.offsetParent !== null)
			.map((a) => a.getAttribute("href"))
	);

test.describe("/txt front page", () => {
	test("every story is linked exactly once", async ({ page }) => {
		await page.goto("/txt");
		const links = await storyLinks(page);
		expect(links.length, "the front page should link some stories").toBeGreaterThan(0);
		expect(new Set(links).size, `duplicate story links: ${links}`).toBe(links.length);
	});

	test("a category keeps the editorial layout, it does not become a list", async ({
		page,
	}) => {
		// "developer-tools" is carried by two posts, so the edition has a lead AND a
		// rail — enough to prove the layout survived the filter.
		await page.goto("/txt/tag/developer-tools");

		await expect(page.locator(".lead")).toBeVisible();
		await expect(page.locator(".lead__hed")).toBeVisible();
		await expect(page.locator(".rail")).toBeVisible();

		const links = await storyLinks(page);
		expect(links).toEqual([
			"/txt/asserting-on-agent-behavior",
			"/txt/no-honey-we-have-a-dashboard-at-home",
		]);
	});

	test("a one-story category degrades to a lead with no orphan headings", async ({
		page,
	}) => {
		// "diy" has exactly one post. The rail and featured strip are guarded on
		// length, so neither they nor their headings should render.
		await page.goto("/txt/tag/diy");

		await expect(page.locator(".lead__hed")).toHaveText("The Mega Desk");
		await expect(page.locator(".rail")).toHaveCount(0);
		await expect(page.locator(".featured")).toHaveCount(0);
		expect(await storyLinks(page)).toEqual(["/txt/mega-desk"]);
	});

	test("the rail marks the category being read, and keeps a below-threshold one visible", async ({
		page,
	}) => {
		// "diy" has one story, so the rail does not offer it — but this IS its page,
		// and a reader who arrived here needs to see where they are. It is carried
		// through as the current chip and nowhere else (the /txt assertion below).
		await page.goto("/txt/tag/diy");

		const current = page.locator('[aria-current="page"]');
		await expect(current).toHaveCount(1);
		await expect(current).toHaveText("diy");

		// "All" goes home; the rail is a way sideways between categories, so it lists
		// the qualifying ones alongside the current one rather than only the current.
		await expect(page.locator('.np__rail a[href="/txt"]')).toHaveText("All");
		expect(await page.locator(".np__rail a").count()).toBeGreaterThan(2);
	});

	test("the rail surfaces only tags with two or more stories", async ({ page }) => {
		// The rule this pins is editorial, and it is invisible in the markup: a rail
		// listing every tag looks perfectly correct until you click one and find a
		// "section" of one article. So assert the rail against the counts rather than
		// against a hardcoded list — the expectation then survives new posts, and it
		// fails if the threshold is dropped or the filter is lost in a refactor.
		await page.goto("/txt");

		const railed = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLAnchorElement>('.np__rail a[href^="/txt/tag/"]'))
				.map((a) => a.getAttribute("href")!.replace("/txt/tag/", "").replace(/\/$/, ""))
		);

		// Count each tag across the front page's own story list, via the tag pages the
		// rail links: every surfaced tag must resolve to a page carrying 2+ stories.
		for (const tag of railed) {
			const page2 = page;
			await page2.goto(`/txt/tag/${tag}`);
			const stories = await page2.evaluate(() =>
				new Set(
					Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/txt/"]'))
						.map((a) => a.getAttribute("href")!)
						.filter((h) => !h.startsWith("/txt/tag/"))
				).size
			);
			expect(stories, `/txt/tag/${tag} is surfaced but carries ${stories} story`).toBeGreaterThanOrEqual(2);
		}

		// And the rule is doing something: "diy" exists as a page but is not offered.
		await page.goto("/txt");
		await expect(page.locator('.np__rail a[href="/txt/tag/diy"]')).toHaveCount(0);
		const res = await page.request.get("/txt/tag/diy");
		expect(res.status(), "an unsurfaced tag should still resolve, not 404").toBe(200);
	});

	test("categories are reachable with scripting off", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();

		await page.goto("/txt");
		await expect(page.locator(".np__rail")).toBeVisible();

		// "developer-tools" rather than "diy": this asserts that the chips the rail
		// ACTUALLY OFFERS are plain links, so it has to click one the rail surfaces.
		// It used to click "diy", which the two-story threshold has since withdrawn.
		await page.locator('.np__rail a[href="/txt/tag/developer-tools"]').click();
		await expect(page).toHaveURL(/\/txt\/tag\/developer-tools\/?$/);
		await expect(page.locator(".lead__hed")).toHaveText("Asserting on Agent Behavior");

		await context.close();
	});
});
