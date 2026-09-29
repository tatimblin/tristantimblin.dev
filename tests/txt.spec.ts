import { test, expect, type Page } from "@playwright/test";

/**
 * THE BLOG: /txt, ITS CATEGORY AND TAG PAGES, AND A POST.
 *
 * The index is the INSTRUMENT — one screen whose board is the quilt, a grid
 * of art tiles, one link per post, newest first in DOM order, with fillers
 * that are aria-hidden and carry no link, under the ruled search bar with
 * its category chips and stepper, and over the timeline (the interaction
 * contract — hover, search, keys, the stepper, the ruler — is pinned in its
 * own spec).
 * The category and tag pages are still the year-grouped list, categories are
 * a closed set with real routes, and the older /txt/tag/<tag> URLs still
 * resolve. The properties worth pinning:
 *
 *  1. EXACTLY ONE LINK PER POST on the index, newest first; fillers link nothing.
 *  2. A CATEGORY PAGE LISTS ONLY ITS POSTS, is noindex, and links its query on
 *     the quilt (/txt?q=<id>). There is no categories page: /txt/categories is
 *     a 301 to /txt in public/_redirects (Cloudflare Pages, so not in dev).
 *  3. TAG PAGES STILL RESOLVE — they predate the redesign and may be linked.
 *  4. IT WORKS WITH SCRIPTING OFF: tiles, rows and nav are plain links.
 *  5. A POST (the block at the foot of this file) is the instrument page: its
 *     number and kicker date, stats and pills, the art hero playing, a
 *     reading ruler that tracks the scroll, a contents rail that follows the
 *     h2s, and its chronological neighbours.
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

	test("a category page lists only its posts and links its query on the quilt", async ({
		page,
	}) => {
		await page.goto("/txt/category/programming");
		expect(await postLinks(page)).toEqual([
			"/txt/asserting-on-agent-behavior",
			"/txt/no-honey-we-have-a-dashboard-at-home",
		]);
		await expect(page.locator(".ds-post-row__meta")).toHaveText([/Programming/, /Programming/]);
		// Thin archive, like the tag pages.
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
		await page.locator('a.ds-pill[href="/txt?q=programming"]').click();
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		await expect(page.locator("[data-search-input]")).toHaveValue("programming");
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
		await page.goto("/txt/tag/diy");
		await page.locator('.site-header a[href="/txt"]').click();
		await expect(page).toHaveURL(/\/txt\/?$/);
		await page.locator('[data-cell="post"] a[href="/txt/mega-desk"]').click();
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
		await expect(page.locator("h1")).toHaveText("The Mega Desk");
		await context.close();
	});

	test("the bar's chips and the timeline ticks are plain links with scripting off", async ({
		browser,
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt");
		// One chip per category in the enum, plus ALL; one tick per post.
		await expect(page.locator("[data-search-chips] [data-chip]")).toHaveCount(5);
		await expect(page.locator("[data-quilt-ruler] [data-mark]")).toHaveCount(5);
		await page.locator('[data-search-chips] [data-chip="thoughts"]').click();
		await expect(page).toHaveURL(/\/txt\/?\?q=thoughts$/);
		await page.locator('[data-quilt-ruler] [data-mark][data-no="002"]').click();
		await expect(page).toHaveURL(/\/txt\/why-i-joined-fisker\/?$/);
		await expect(page.locator("h1")).toHaveText(/Your Car Knows You.re Getting Sick/);
		await context.close();
	});
});

/**
 * THE POST PAGE (src/layouts/PostLayout.astro).
 *
 * Numbers are chronological: 001 the dashboard (May 2023, the oldest), 002
 * Fisker, 003 the Mega Desk, 004 Tahoe, 005 Asserting on Agent Behavior (the
 * newest). `prev` is the older neighbour, `next` the newer. The Mega Desk has
 * no h2s, so it renders no rail; Asserting has three.
 *
 * TEXT. The mono voice is lowercase in the DOM and capitals on screen, so the
 * assertions read textContent, case-insensitively.
 *
 * HEADINGS. The dev toolbar carries h1s of its own, so headings are found by
 * role inside the article, never by a bare `h1`.
 */
const NEWEST = "/txt/asserting-on-agent-behavior";
const NO_H2S = "/txt/mega-desk";
const OLDEST = "/txt/no-honey-we-have-a-dashboard-at-home";
const RAIL_LINKS = "[data-post-rail] a";

/** The reading ruler's --at, as the script writes it (`37.00%`). */
const rulerAt = (page: Page) =>
	page.locator("[data-post-ruler]").evaluate((r: HTMLElement) => r.style.getPropertyValue("--at"));

const scrollToY = (page: Page, y: number | "bottom") =>
	page.evaluate((y) => {
		const max = document.documentElement.scrollHeight - window.innerHeight;
		window.scrollTo({ top: y === "bottom" ? max : y, behavior: "instant" });
	}, y);

/** Which rail entries are current, by index. */
const currentRail = (page: Page) =>
	page.evaluate((sel) =>
		[...document.querySelectorAll(sel)].flatMap((a, i) =>
			a.getAttribute("aria-current") === "true" ? [i] : [],
		),
	RAIL_LINKS);

/** An element's background (or, with `prop: "color"`, its text colour) as sRGB
 *  relative luminance (0 black – 1 white), whatever colour space the computed
 *  value is in: paint it to a canvas and read the pixel back. */
const luminance = (
	page: Page,
	selector: string,
	prop: "backgroundColor" | "color" = "backgroundColor",
) =>
	page.evaluate(([selector, prop]) => {
		const color = getComputedStyle(document.querySelector(selector)!)[prop];
		const ctx = document.createElement("canvas").getContext("2d")!;
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((c) => {
			const s = c / 255;
			return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}, [selector, prop] as const);

test.describe("/txt/<slug> — the post page", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("the newest post: count, kicker, title, stats, pills and the art hero", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const article = page.locator("article[data-post]");
		await expect(article).toBeVisible();

		await expect(article.locator(".post__count")).toHaveText("005 / 005");
		await expect(article.locator(".post__kicker")).toHaveText(/txt · 005 · 02 Feb 2026/i);
		await expect(article.locator(".post__date time[datetime]").first()).toHaveAttribute(
			"datetime",
			"2026-02-02",
		);

		const title = "Asserting on Agent Behavior";
		const h1 = page.getByRole("main").getByRole("heading", { level: 1 });
		await expect(h1).toHaveCount(1);
		await expect(h1).toHaveText(title);

		const stats = article.locator(".post__meta .ds-stat");
		await expect(stats).toHaveCount(2);
		await expect(stats.nth(0)).toContainText(/\d+ min/);
		await expect(stats.nth(0)).toContainText(/read/i);
		await expect(stats.nth(1)).toContainText(/words/i);

		// The category is a query on the quilt; the tags are their routes.
		await expect(article.locator("a.ds-pill.post__category")).toHaveAttribute(
			"href",
			"/txt?q=programming",
		);
		expect(
			await article.locator("a.post__tag").evaluateAll((as) => as.map((a) => a.getAttribute("href"))),
		).toEqual(["/txt/tag/ai", "/txt/tag/testing", "/txt/tag/agents", "/txt/tag/developer-tools"]);
		await article.locator("a.ds-pill.post__category").click();
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		await expect(page.locator("[data-search-input]")).toHaveValue("programming");
	});

	test("the hero art is named by the title and plays on the open post", async ({ page }) => {
		await page.goto(NEWEST);
		const art = page.locator(
			'.post__art[role="img"][aria-label="Asserting on Agent Behavior"][data-art-play]',
		);
		await expect(art).toHaveCount(1);
		const motion = art.locator("[data-motion]");
		await expect(motion).toHaveCSS("animation-play-state", "running");
		expect(await motion.evaluate((m) => parseFloat(getComputedStyle(m).animationDuration))).toBeGreaterThan(0);
		// And the clock actually advances.
		await expect
			.poll(() => motion.evaluate((m) => Number(m.getAnimations()[0]?.currentTime ?? 0)))
			.toBeGreaterThan(0);
	});

	test("under reduced motion the hero art holds its still frame", async ({ browser }) => {
		const context = await browser.newContext({
			reducedMotion: "reduce",
			viewport: { width: 1440, height: 900 },
		});
		const page = await context.newPage();
		await page.goto(NEWEST);
		const motion = page.locator(".post__art [data-motion]");
		await expect(motion).toHaveCount(1);
		const { state, duration } = await motion.evaluate((m) => {
			const cs = getComputedStyle(m);
			return { state: cs.animationPlayState, duration: parseFloat(cs.animationDuration) };
		});
		expect(state === "paused" || duration === 0, `${state} / ${duration}s`).toBe(true);
		// The ruler is position, not motion: it still tracks the scroll.
		await scrollToY(page, "bottom");
		await expect.poll(() => rulerAt(page)).toBe("100.00%");
		await context.close();
	});

	test("light theme: the art's plate follows the theme — a bone plate, a dark ink", async ({
		page,
	}) => {
		await page.addInitScript(() => localStorage.setItem("theme", "light"));
		await page.goto(NEWEST);
		await expect(page.locator("html")).toHaveClass(/maximeheckel-light/);
		expect(await luminance(page, "body")).toBeGreaterThan(0.5);
		expect(await luminance(page, ".post__art")).toBeGreaterThan(0.8);
		expect(await luminance(page, ".post__art", "color")).toBeLessThan(0.05);
	});

	test("dark theme: the art keeps its near-black plate and white ink", async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem("theme", "dark"));
		await page.goto(NEWEST);
		await expect(page.locator("html")).toHaveClass(/maximeheckel-dark/);
		expect(await luminance(page, ".post__art")).toBeLessThan(0.05);
		expect(await luminance(page, ".post__art", "color")).toBeGreaterThan(0.85);
	});

	test("the reading ruler tracks the scroll: 0 at the top, between, 100 at the bottom", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		await expect.poll(() => rulerAt(page)).toBe("0.00%");

		const max = await page.evaluate(
			() => document.documentElement.scrollHeight - window.innerHeight,
		);
		expect(max, "the post should scroll").toBeGreaterThan(0);
		await scrollToY(page, Math.round(max / 2));
		await expect
			.poll(async () => parseFloat(await rulerAt(page)))
			.toBeGreaterThan(40);
		expect(parseFloat(await rulerAt(page))).toBeLessThan(60);

		await scrollToY(page, "bottom");
		await expect.poll(() => rulerAt(page)).toBe("100.00%");

		await scrollToY(page, 0);
		await expect.poll(() => rulerAt(page)).toBe("0.00%");
	});

	test("the rail links every h2, numbered like the prose, and follows the reading line", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const nav = page.getByRole("navigation", { name: "Contents" });
		await expect(nav).toHaveAttribute("data-post-rail", "");

		const h2s = page.locator(".ds-prose--numbered-true > h2");
		await expect(h2s).toHaveCount(3);
		// The prose counts its h2s (01, 02, …) the way the rail prints them.
		expect(
			await h2s.evaluateAll((hs) =>
				hs.map((h) => {
					const b = getComputedStyle(h, "::before");
					return `${b.counterIncrement} | ${b.content}`;
				}),
			),
		).toEqual(
			Array(3).fill("ds-prose-section 1 | counter(ds-prose-section, decimal-leading-zero)"),
		);
		const ids = await h2s.evaluateAll((hs) => hs.map((h) => h.id));
		const texts = await h2s.allTextContents();
		const links = page.locator(RAIL_LINKS);
		expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(
			ids.map((id) => `#${id}`),
		);
		await expect(links).toHaveText(
			texts.map((t, i) => `${String(i + 1).padStart(2, "0")} — ${t.trim()}`),
		);

		// At the top no heading has reached the reading line (30% down).
		await expect.poll(() => currentRail(page)).toEqual([]);

		// Each h2, brought just above the line, becomes the current entry.
		for (const i of [0, 1]) {
			await page.evaluate((id) => {
				const h = document.getElementById(id)!;
				const y = h.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.2;
				window.scrollTo({ top: y, behavior: "instant" });
			}, ids[i]);
			await expect.poll(() => currentRail(page)).toEqual([i]);
		}

		// At the very bottom the last section is current.
		await scrollToY(page, "bottom");
		await expect.poll(() => currentRail(page)).toEqual([2]);
	});

	test("clicking a rail entry jumps to its heading and lights it", async ({ page }) => {
		await page.goto(NEWEST);
		await page.locator(RAIL_LINKS).nth(1).click();
		await expect(page).toHaveURL(/#where-it-breaks-down$/);
		const heading = page.getByRole("article").getByRole("heading", { name: "Where it breaks down" });
		await expect
			.poll(() => heading.evaluate((h) => h.getBoundingClientRect().top / window.innerHeight))
			.toBeLessThan(0.3);
		await expect(heading).toBeInViewport();
		await expect.poll(() => currentRail(page)).toEqual([1]);
	});

	test("a post without h2s: no rail, the same chrome", async ({ page }) => {
		await page.goto(NO_H2S);
		await expect(page.locator(".post__count")).toHaveText("003 / 005");
		await expect(page.locator(".post__kicker")).toHaveText(/txt · 003 · 06 Apr 2025/i);
		await expect(page.locator(".post__date time").first()).toHaveAttribute("datetime", "2025-04-06");
		await expect(page.locator("[data-post-rail]")).toHaveCount(0);
		await expect(page.locator(".post__meta .ds-stat")).toHaveCount(2);
		await expect(
			page.locator('.post__art[role="img"][aria-label="The Mega Desk"][data-art-play]'),
		).toHaveCount(1);
		const pill = page.locator("a.ds-pill.post__category");
		await expect(pill).toHaveAttribute("href", "/txt?q=projects");
		await expect(pill).toContainText(/projects/i);
		expect(await page.locator(".ds-prose > p, .ds-prose > .ds-body").count()).toBeGreaterThan(3);
		// Neighbours from the middle of the list: both sides.
		await expect(page.locator('a[data-neighbour="prev"]')).toHaveAttribute("href", "/txt/why-i-joined-fisker");
		await expect(page.locator('a[data-neighbour="next"]')).toHaveAttribute("href", "/txt/tahoe-mountain-hair");
		// The ruler works without a rail.
		await expect.poll(() => rulerAt(page)).toBe("0.00%");
		await scrollToY(page, "bottom");
		await expect.poll(() => rulerAt(page)).toBe("100.00%");
	});

	test("neighbours at the ends: the newest has no next, the oldest no prev", async ({ page }) => {
		await page.goto(NEWEST);
		const nav = page.getByRole("navigation", { name: "Previous and next posts" });
		await expect(nav.locator('a[data-neighbour="prev"]')).toHaveAttribute(
			"href",
			"/txt/tahoe-mountain-hair",
		);
		await expect(nav.locator('a[data-neighbour="next"]')).toHaveCount(0);
		await expect(nav).toContainText(/latest post — nothing newer/i);

		await page.goto(OLDEST);
		await expect(page.locator(".post__count")).toHaveText("001 / 005");
		await expect(nav.locator('a[data-neighbour="next"]')).toHaveAttribute(
			"href",
			"/txt/why-i-joined-fisker",
		);
		await expect(nav.locator('a[data-neighbour="prev"]')).toHaveCount(0);
		await expect(nav).toContainText(/first post — nothing older/i);
	});

	test("accessibility basics: one h1, a labelled rail, machine-readable dates", async ({ page }) => {
		await page.goto(NEWEST);
		await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
		await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(1);
		const times = page.locator("article[data-post] time");
		expect(await times.count()).toBeGreaterThan(0);
		for (const dt of await times.evaluateAll((ts) => ts.map((t) => t.getAttribute("datetime")))) {
			expect(dt).toMatch(/^\d{4}-\d{2}-\d{2}/);
		}
		// The ruler is decoration; the art is an image with a name.
		await expect(page.locator("[data-post-ruler]")).toHaveAttribute("aria-hidden", "true");
		await expect(page.getByRole("img", { name: "Asserting on Agent Behavior" })).toBeVisible();
	});

	test("at 390px: one column, the rail in flow above the prose, no overflow", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(NEWEST);
		const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;

		// The hero stacks: the art above the words, both full width.
		const art = await box(".post__art");
		const lead = await box(".post__lead");
		expect(art.y + art.height).toBeLessThanOrEqual(lead.y + 1);
		expect(Math.abs(art.x - lead.x)).toBeLessThanOrEqual(1);

		// The rail is in flow (not sticky) and sits above the prose.
		const rail = page.locator("[data-post-rail]");
		await expect(rail).toHaveCSS("position", "static");
		const railBox = await box("[data-post-rail]");
		const prose = await box(".post__prose");
		expect(railBox.y + railBox.height).toBeLessThanOrEqual(prose.y + 1);
		expect(Math.abs(railBox.x - prose.x)).toBeLessThanOrEqual(1);

		for (const path of [NEWEST, NO_H2S]) {
			await page.goto(path);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			expect(overflow, `${path} overflows at 390px`).toBeLessThanOrEqual(0);
		}
	});

	test("with scripting off the post reads and the ruler sits at 0", async ({ browser }) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 1440, height: 900 },
		});
		const page = await context.newPage();
		await page.goto(NEWEST);
		await expect(
			page.getByRole("main").getByRole("heading", { level: 1, name: "Asserting on Agent Behavior" }),
		).toBeVisible();
		await expect(page.locator(".ds-prose")).toBeVisible();
		await expect(page.locator(".ds-prose > h2").first()).toBeVisible();
		await expect(page.locator(RAIL_LINKS)).toHaveCount(3);
		// The server-rendered playhead: --at 0% from TickRuler, nothing moves it.
		const ruler = page.locator("[data-post-ruler]");
		await expect(ruler).toHaveAttribute("style", /--at:\s*0%/);
		await page.mouse.wheel(0, 4000);
		await expect(ruler).toHaveAttribute("style", /--at:\s*0%/);
		await context.close();
	});
});
