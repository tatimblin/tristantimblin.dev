import { test, expect, type Page } from "@playwright/test";

/**
 * THE BLOG: /txt, ITS TAG PAGES, AND A POST.
 *
 * The index is the INSTRUMENT — one screen whose board is the quilt, a grid
 * of art tiles, one link per post, newest first in DOM order, with fillers
 * that are aria-hidden and carry no link, under the open search bar with
 * its category chips, and over the foot — the topic key, the bar timeline,
 * the post in focus with the stepper (the interaction contract — hover,
 * search, keys, the stepper, the ruler — is pinned in its own spec).
 * The tag pages are still the year-grouped list, and the older
 * /txt/tag/<tag> URLs still resolve. Categories are a closed set and only
 * queries on the quilt (/txt?q=<id>): /txt/category/<id> is simply gone (404),
 * and /txt/categories is a 301 in public/_redirects (Cloudflare Pages only).
 * The properties worth pinning:
 *
 *  1. EXACTLY ONE LINK PER POST on the index, newest first; fillers link nothing.
 *  2. NO CATEGORY PAGES are built.
 *  3. TAG PAGES STILL RESOLVE — they predate the redesign and may be linked.
 *  4. IT WORKS WITH SCRIPTING OFF: tiles, rows and nav are plain links.
 *  5. A POST (the block at the foot of this file) is the RULED page: one
 *     four-column grid — the status strip, the title with the art as a mark,
 *     the hero as Fig. 01, the body cut into numbered sections with sticky
 *     heads, and an index table naming the tags and the neighbours. No
 *     reading ruler, no contents rail, and the same measure with or
 *     without h2s.
 */

/** The post links on a list page (a tag): one per PostRow. */
const postLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>("a.ds-post-row__link"))
			.map((a) => a.getAttribute("href"))
			.filter((h) => h && /^\/txt\/[^/]+\/$/.test(h))
	);

/** The post links on the quilt: one per post tile, in DOM order. */
const tileLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-cell="post"] a'))
			.map((a) => a.getAttribute("href"))
			.filter((h) => h && /^\/txt\/[^/]+\/$/.test(h))
	);

test.describe("/txt/", () => {
	test("every post is a tile linked exactly once, newest first; fillers link nothing", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const links = await tileLinks(page);
		expect(links.length, "the quilt should link some posts").toBeGreaterThan(0);
		expect(new Set(links).size, `duplicate post links: ${links}`).toBe(links.length);
		// DOM order is newest first — the tab order and the phone's list.
		expect(links.slice(0, 2)).toEqual(["/txt/asserting-on-agent-behavior/", "/txt/tahoe-mountain-hair/"]);

		const fillers = page.locator('[data-cell="filler"]');
		expect(await fillers.count()).toBeGreaterThan(0);
		await expect(fillers.first()).toHaveAttribute("aria-hidden", "true");
		expect(await page.locator('[data-cell="filler"] a').count()).toBe(0);
	});

	test("there are no category pages; a category is a query on the quilt", async ({ page }) => {
		const res = await page.request.get("/txt/category/programming/");
		expect(res.status()).toBe(404);
	});

	test("tag pages still resolve", async ({ page }) => {
		const res = await page.request.get("/txt/tag/diy/");
		expect(res.status()).toBe(200);
		await page.goto("/txt/tag/diy/");
		expect(await postLinks(page)).toEqual(["/txt/mega-desk/"]);
		// A tag page is thin archive, so it asks not to be indexed.
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	});

	test("tiles, rows and nav are reachable with scripting off", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt/tag/diy/");
		await page.locator('.site-header a[href="/txt/"]').click();
		await expect(page).toHaveURL(/\/txt\/?$/);
		// The sheet's last row sits under the docked foot in a short window
		// until it scrolls clear; a reader scrolls, so does this.
		const tile = page.locator('[data-cell="post"] a[href="/txt/mega-desk/"]');
		await tile.evaluate((el) => el.scrollIntoView({ block: "center" }));
		await tile.click();
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
		await expect(page.locator("h1")).toHaveText("The Mega Desk");
		await context.close();
	});

	test("the bar's chips, the topic key and the timeline bars are plain links with scripting off", async ({
		browser,
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt/");
		// One chip per category in the enum, plus ALL; one tick per post.
		await expect(page.locator("[data-search-chips] [data-chip]")).toHaveCount(5);
		await expect(page.locator("[data-quilt-ruler] [data-mark]")).toHaveCount(5);
		await page.locator('[data-search-chips] [data-chip="thoughts"]').click();
		await expect(page).toHaveURL(/\/txt\/?\?q=thoughts$/);
		await expect(page.locator("[data-quilt-key] a")).toHaveCount(4);
		await page.locator('[data-quilt-key] a[href="/txt/?q=projects"]').click();
		await expect(page).toHaveURL(/\/txt\/?\?q=projects$/);
		await page.locator('[data-quilt-ruler] [data-mark][data-no="002"]').click();
		await expect(page).toHaveURL(/\/txt\/why-i-joined-fisker\/?$/);
		await expect(page.locator("h1")).toHaveText(/Your Car Knows You.re Getting Sick/);
		await context.close();
	});
});

/**
 * THE POST PAGE (src/layouts/PostLayout.astro) — the ruled page.
 *
 * Numbers are chronological: 001 the dashboard (May 2023, the oldest), 002
 * Fisker, 003 the Mega Desk, 004 Tahoe, 005 Asserting on Agent Behavior (the
 * newest). `prev` is the older neighbour, `next` the newer. The Mega Desk has
 * no h2s, so it is one section; Asserting has three h2s, so four. Fisker has
 * no hero; the other two of those three do.
 *
 * TEXT. The mono voice is lowercase in the DOM and capitals on screen, so the
 * assertions read textContent, case-insensitively.
 *
 * HEADINGS. The dev toolbar carries h1s of its own, so headings are found by
 * role inside the article, never by a bare `h1`.
 *
 * THE GRID. At 1440 the article is 1136px wide (the container's inset) and
 * the four columns are (1136 − 3 × 16) / 4 = 272px; the text column is two of
 * them and the gap between, 560px. Boxes are compared to the article's own
 * width rather than to those literals, so a container retune does not fail
 * the geometry.
 */
const NEWEST = "/txt/asserting-on-agent-behavior/";
const NO_H2S = "/txt/mega-desk/";
const OLDEST = "/txt/no-honey-we-have-a-dashboard-at-home/";
const NO_HERO = "/txt/why-i-joined-fisker/";

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

/** The column geometry the page lays out, off the article's real width. */
const columns = async (page: Page) => {
	const article = await box(page, "article[data-post]");
	const gap = 16;
	const col = (article.width - 3 * gap) / 4;
	return { article, gap, col, text: 2 * col + gap };
};

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

const TRANSPARENT = "rgba(0, 0, 0, 0)";

test.describe("/txt/<slug> — the post page", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("the status strip: the number, the category as a link to its query, the stats, the date", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const strip = page.locator("[data-post-strip]");
		await expect(strip.locator(".post__no")).toHaveText(/txt \/ 005/i);
		await expect(strip.locator("a.post__category")).toHaveText(/Programming/);
		await expect(strip.locator("a.post__category")).toHaveAttribute("href", "/txt/?q=programming");
		await expect(strip.locator(".post__stats")).toHaveText(/^\s*3 min · \d{3} words\s*$/i);
		await expect(strip.locator("time.post__date")).toHaveText("02.02.2026");
		await expect(strip.locator("time.post__date")).toHaveAttribute("datetime", "2026-02-02");
		// The date sits on the right edge of the row, the number on the left.
		const row = await box(page, "[data-post-strip]");
		const date = await box(page, "time.post__date");
		const no = await box(page, ".post__no");
		expect(Math.abs(date.x + date.width - (row.x + row.width))).toBeLessThanOrEqual(2);
		expect(Math.abs(no.x - row.x)).toBeLessThanOrEqual(1);

		await strip.locator("a.post__category").click();
		await expect(page).toHaveURL(/\/txt\/\?q=programming$/);
		await expect(page.locator("[data-search-input]")).toHaveValue("programming");
	});

	test("no reading ruler, no contents rail, no neighbour cards", async ({ page }) => {
		await page.goto(NEWEST);
		await expect(page.locator("[data-post-ruler], .ds-tick-ruler")).toHaveCount(0);
		await expect(page.locator("[data-post-rail]")).toHaveCount(0);
		await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(0);
		await expect(page.locator(".post__neighbour, .post__neighbours")).toHaveCount(0);
		// The former hero art in its plate, the stat pairs and the pills are gone too.
		await expect(page.locator(".post__art, .post__meta, .ds-pill")).toHaveCount(0);
	});

	test("the title across three columns, the lead in two, the art as a mark in the fourth, playing", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const { article, col, gap } = await columns(page);
		const h1 = page.getByRole("main").getByRole("heading", { level: 1 });
		await expect(h1).toHaveText("Asserting on Agent Behavior");
		await expect(h1).toHaveCSS("font-size", "72px");
		await expect(page.locator(".post__lead")).toHaveText(/I built Aptitude — a test harness/);

		const title = await box(page, ".post__title");
		const lead = await box(page, ".post__lead");
		const mark = await box(page, ".post__mark");
		// The title from the first line; the lead from the second column's line.
		expect(Math.abs(title.x - article.x)).toBeLessThanOrEqual(1);
		expect(title.width).toBeLessThanOrEqual(3 * col + 2 * gap + 1);
		expect(Math.abs(lead.x - (article.x + col + gap))).toBeLessThanOrEqual(1);
		expect(Math.abs(lead.width - (2 * col + gap))).toBeLessThanOrEqual(1);
		// The mark fills the fourth column and rests on the lead's last line.
		expect(Math.abs(mark.x - (article.x + 3 * (col + gap)))).toBeLessThanOrEqual(1);
		expect(Math.abs(mark.width - col)).toBeLessThanOrEqual(1);
		expect(Math.abs(mark.y + mark.height + 4 - (lead.y + lead.height))).toBeLessThanOrEqual(2);

		// A mark: no plate, edge or corner, named by the title, its motion running.
		const art = page.locator(
			'.post__mark.ds-art-frame--variant-mark[role="img"][aria-label="Asserting on Agent Behavior"][data-art-play]',
		);
		await expect(art).toHaveCount(1);
		await expect(art).toHaveCSS("background-color", TRANSPARENT);
		await expect(art).toHaveCSS("border-top-width", "0px");
		await expect(art).toHaveCSS("border-top-left-radius", "0px");
		const motion = art.locator("[data-motion]");
		await expect(motion).toHaveCount(1);
		await expect(motion).toHaveCSS("animation-play-state", "running");
		// The mark is drawn in the page's ink: its colour is the title's.
		const [markInk, titleInk] = await page.evaluate(() => [
			getComputedStyle(document.querySelector(".post__mark")!).color,
			getComputedStyle(document.querySelector(".post__title")!).color,
		]);
		expect(markInk).toBe(titleInk);
	});

	test("the hero: Fig. 01 across three columns with its caption; a post without one shows no figure", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const { article, col, gap } = await columns(page);
		const hero = page.locator("[data-post-hero]");
		await expect(hero).toHaveCount(1);
		await expect(hero.locator(".ds-fig__no")).toHaveText(/fig\. 01 \//i);
		const img = hero.locator("img");
		// A built asset: the file moved beside the post and content-addressed.
		await expect(img).toHaveAttribute("src", /^\/_astro\/aptitude-pass\..*\.webp$/);
		await expect(img).toHaveAttribute("alt", /read-order test/);
		await expect(img).toHaveAttribute("width", /^\d+$/);
		// The page's largest paint: fetched first, and never held back by the
		// reveal (which keeps an armed image at opacity 0 until its module runs).
		await expect(img).toHaveAttribute("fetchpriority", "high");
		await expect(img).toHaveAttribute("loading", "eager");
		await expect(img).not.toHaveAttribute("data-reveal");
		await expect(hero.locator("figcaption")).toHaveText(/aptitude, passing — the read-order test/i);
		const image = await box(page, "[data-post-hero] img");
		expect(Math.abs(image.x - (article.x + col + gap))).toBeLessThanOrEqual(1);
		expect(Math.abs(image.x + image.width - (article.x + article.width))).toBeLessThanOrEqual(1);
		await expect(img).toHaveCSS("border-top-width", "1px");
		await expect(img).toHaveCSS("border-top-left-radius", "0px");
		// It is not in the body any more: the body's first figure is Fig. 02.
		await expect(page.locator('.ds-prose img[src*="/aptitude-pass."]')).toHaveCount(0);
		await expect(page.locator(".ds-prose .ds-fig figcaption").first()).toHaveText(/^fig\. 02 \//i);

		await page.goto(NO_HERO);
		await expect(page.locator("[data-post-hero]")).toHaveCount(0);
		await expect(page.locator(".ds-fig__no")).toHaveCount(0);
		// Nothing but the sections between the lead and the index.
		const lead = await box(page, ".post__lead");
		const first = await box(page, ".ds-prose-section");
		expect(first.y).toBeGreaterThan(lead.y + lead.height);
	});

	test("the sections: numbered 00…, 00 headed Intro, the head sticky in the first column, the text in the next two", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const { article, col, gap, text } = await columns(page);
		const sections = page.locator(".ds-prose--variant-ruled > .ds-prose-section");
		await expect(sections).toHaveCount(4);
		expect(await sections.evaluateAll((s) => s.map((el) => el.getAttribute("data-section")))).toEqual(
			["00", "01", "02", "03"],
		);
		await expect(sections.locator(".ds-prose-section__head > .ds-mono")).toHaveText([
			"00",
			"01",
			"02",
			"03",
		]);
		// 00's label is set like the heads but is not a heading: the outline is
		// the author's h2s alone.
		await expect(sections.first().locator(".ds-prose-section__head > .ds-prose-section__title")).toHaveText(
			"Intro",
		);
		await expect(page.locator("#intro")).toHaveCount(0);
		await expect(sections.locator(".ds-prose-section__head > h2")).toHaveText([
			"Old world, new world",
			"Where it breaks down",
			"Let the agent decide",
		]);
		// The heads are the page's h2s, in the UI face at the semibold, 24px.
		const h2 = sections.locator("h2").first();
		await expect(h2).toHaveCSS("font-size", "24px");
		expect(await h2.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Mondwest/);

		const head = page.locator(".ds-prose-section__head").nth(1);
		await expect(head).toHaveCSS("position", "sticky");
		const headBox = (await head.boundingBox())!;
		const body = await box(page, ".ds-prose-section:nth-child(2) .ds-prose-section__body");
		expect(Math.abs(headBox.x - article.x)).toBeLessThanOrEqual(1);
		expect(headBox.width).toBeLessThanOrEqual(col + 1);
		// The text's paragraphs sit in the second and third columns.
		const p = await box(page, ".ds-prose-section:nth-child(2) .ds-prose-section__body > .ds-body");
		expect(Math.abs(p.x - (article.x + col + gap))).toBeLessThanOrEqual(1);
		expect(Math.abs(p.width - text)).toBeLessThanOrEqual(1);
		expect(body.x + body.width).toBeLessThanOrEqual(article.x + article.width + 1);

		// Every section opens on a hairline and the head sticks while the text
		// scrolls: a section that is 900px down keeps its head in view.
		await expect(sections.nth(1)).toHaveCSS("border-top-width", "1px");
		const long = page.locator(".ds-prose-section").nth(1);
		const longBox = (await long.boundingBox())!;
		await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), longBox.y + 300);
		const stuck = (await head.boundingBox())!;
		expect(stuck.y).toBeGreaterThanOrEqual(23);
		expect(stuck.y).toBeLessThanOrEqual(25);
	});

	test("a post with no h2s is one section, 00 / Intro, its text at the same measure as a post with h2s", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const withH2s = await box(page, ".ds-prose-section__body > .ds-body");

		await page.goto(NO_H2S);
		await expect(page.locator(".post__no")).toHaveText(/txt \/ 003/i);
		await expect(page.locator("time.post__date")).toHaveText("06.04.2025");
		const sections = page.locator(".ds-prose--variant-ruled > .ds-prose-section");
		await expect(sections).toHaveCount(1);
		await expect(sections).toHaveAttribute("data-section", "00");
		await expect(sections.locator(".ds-prose-section__head > .ds-prose-section__title")).toHaveText("Intro");
		await expect(page.locator(".post__prose h2")).toHaveCount(0);
		expect(await page.locator(".ds-prose-section__body > .ds-body").count()).toBeGreaterThan(3);

		// THE FIX: the text column is the same width, and the same two columns,
		// whether or not the post has h2s — it used to fall into a 22rem column
		// meant for the contents rail when there was no rail to render.
		const { text } = await columns(page);
		const without = await box(page, ".ds-prose-section__body > .ds-body");
		expect(Math.abs(without.width - withH2s.width)).toBeLessThanOrEqual(1);
		expect(Math.abs(without.x - withH2s.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(without.width - text)).toBeLessThanOrEqual(1);

		// Its figures count on from the hero.
		await expect(page.locator(".ds-prose .ds-fig figcaption")).toHaveText([
			/^fig\. 02 \//i,
			/^fig\. 03 \//i,
			/^fig\. 04 \//i,
		]);
		await expect(page.locator('a[data-neighbour="prev"]')).toHaveAttribute("href", "/txt/why-i-joined-fisker/");
		await expect(page.locator('a[data-neighbour="next"]')).toHaveAttribute("href", "/txt/tahoe-mountain-hair/");
	});

	test("the body: links in the ink, code between hairlines under a numbered header, a captioned figure, the pull quote", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const body = page.locator(".ds-prose-section__body");

		// Links in the primary ink on a 1px underline, not the hyperlink blue.
		const link = body.locator("a").first();
		const [linkInk, ink] = await page.evaluate(() => [
			getComputedStyle(document.querySelector(".ds-prose-section__body a")!).color,
			getComputedStyle(document.querySelector(".post__title")!).color,
		]);
		expect(linkInk).toBe(ink);
		await expect(link).toHaveCSS("border-bottom-width", "1px");

		// Inline code on the first wash, no box.
		const code = body.locator(":not(pre) > code").first();
		await expect(code).toHaveCSS("border-top-width", "0px");
		await expect(code).toHaveCSS("border-top-left-radius", "0px");
		expect(await code.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(TRANSPARENT);

		// The fence: a figure with its header row, the code highlighted, no box.
		const fig = body.locator("figure.ds-prose-code");
		await expect(fig).toHaveCount(1);
		await expect(fig.locator(".ds-prose-code__head > .ds-mono")).toHaveText([
			/01\.1 \/ env-protection\.yml/i,
			/^yaml$/i,
		]);
		await expect(fig).toHaveCSS("border-top-width", "1px");
		await expect(fig).toHaveCSS("border-bottom-width", "1px");
		const pre = fig.locator("pre.astro-code");
		await expect(pre).toHaveCSS("background-color", TRANSPARENT);
		await expect(pre).toHaveCSS("border-top-width", "0px");
		await expect(pre).toHaveCSS("border-top-left-radius", "0px");
		// Shiki still colours the tokens: a key and a string are different inks.
		const inks = await pre.locator("span[style]").evaluateAll((spans) =>
			[...new Set(spans.map((s) => getComputedStyle(s).color))]
		);
		expect(inks.length).toBeGreaterThan(1);

		// The image: a figure on a hairline with its numbered caption.
		const figure = body.locator("figure.ds-fig");
		await expect(figure).toHaveCount(1);
		await expect(figure.locator("img")).toHaveAttribute("src", /^\/_astro\/aptitude-fail\..*\.webp$/);
		await expect(figure.locator("img")).toHaveCSS("border-top-width", "1px");
		await expect(figure.locator("figcaption")).toHaveText(/^fig\. 02 \/ aptitude, failing/i);

		// The quote: the accent bar, no fill, the words a step up, the attribution.
		const quote = body.locator("blockquote.ds-blockquote");
		await expect(quote).toHaveCount(1);
		await expect(quote).toHaveCSS("background-color", TRANSPARENT);
		await expect(quote).toHaveCSS("border-left-width", "2px");
		await expect(quote.locator("> p").first()).toHaveCSS("font-size", "20px");
		// The attribution is outside the quoted words: the figure's caption.
		await expect(quote.locator("footer")).toHaveCount(0);
		await expect(
			body.locator("figure.ds-prose-quote:has(> blockquote.ds-blockquote) > figcaption"),
		).toHaveText(/brace sproul \/ langchain/i);
		expect(await quote.locator("> p").first().textContent()).not.toMatch(/^\s*—/);
	});

	test("the index: the inverted header, the tags, the previous and next posts; an end says so", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const index = page.getByRole("navigation", { name: "Index" });
		await expect(index).toHaveAttribute("data-post-index", "");
		await expect(index.locator(".ds-index__row--head > .ds-mono")).toHaveText([
			/index/i,
			/no\./i,
			/title/i,
			/filed/i,
		]);
		// The header row is the ink with the page colour on it — the fill on the
		// row, so no gap between cells shows the page.
		expect(await luminance(page, ".ds-index__row--head")).toBeGreaterThan(0.8);
		expect(await luminance(page, ".ds-index__row--head > .ds-mono", "color")).toBeLessThan(0.1);
		const rowBox = await box(page, ".ds-index__row--head");
		const { article } = await columns(page);
		expect(Math.abs(rowBox.width - article.width)).toBeLessThanOrEqual(1);

		const tags = index.locator('[data-index-row="tags"]');
		await expect(tags).toHaveText(/tags\s*005\s*ai · testing · agents · developer tools/i);
		expect(
			await tags.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))),
		).toEqual(["/txt/tag/ai/", "/txt/tag/testing/", "/txt/tag/agents/", "/txt/tag/developer-tools/"]);

		const prev = index.locator('[data-index-row="prev"]');
		await expect(prev).toHaveText(/← previous\s*004\s*Tahoe Mountain Hair\s*jun 2025/i);
		await expect(prev.locator('a[data-neighbour="prev"]')).toHaveAttribute("href", "/txt/tahoe-mountain-hair/");
		await expect(prev.locator("time")).toHaveAttribute("datetime", "2025-06-13");
		await expect(prev).toHaveCSS("border-bottom-width", "1px");

		const next = index.locator('[data-index-row="next"]');
		await expect(next).toHaveClass(/ds-index__row--dim/);
		await expect(next).toHaveText(/next →\s*—\s*Nothing newer\s*—/);
		await expect(next.locator("a")).toHaveCount(0);

		await page.goto(OLDEST);
		await expect(page.locator(".post__no")).toHaveText(/txt \/ 001/i);
		await expect(page.locator('[data-index-row="prev"]')).toHaveText(/Nothing older/);
		await expect(page.locator('[data-index-row="prev"] a')).toHaveCount(0);
		await expect(page.locator('[data-index-row="next"] a[data-neighbour="next"]')).toHaveAttribute(
			"href",
			"/txt/why-i-joined-fisker/",
		);
		await expect(page.locator('[data-index-row="next"]')).toHaveText(/002/);
	});

	test("light theme: the mark is the page's dark ink on no plate, the header row inverts to the ink", async ({
		page,
	}) => {
		await page.addInitScript(() => localStorage.setItem("theme", "light"));
		await page.goto(NEWEST);
		await expect(page.locator("html")).toHaveClass(/maximeheckel-light/);
		await expect(page.locator(".post__mark")).toHaveCSS("background-color", TRANSPARENT);
		expect(await luminance(page, ".post__mark", "color")).toBeLessThan(0.05);
		expect(await luminance(page, ".ds-index__row--head")).toBeLessThan(0.05);
		expect(await luminance(page, ".ds-index__row--head > .ds-mono", "color")).toBeGreaterThan(0.85);
	});

	test("dark theme: the mark is the light ink, the header row the light fill", async ({ page }) => {
		await page.goto(NEWEST);
		await expect(page.locator("html")).toHaveClass(/maximeheckel-dark/);
		await expect(page.locator(".post__mark")).toHaveCSS("background-color", TRANSPARENT);
		// The PAGE's ink, not the art's near-white: the mark is drawn in the
		// title's colour, which on the dark theme is the light grey primary text.
		expect(await luminance(page, ".post__mark", "color")).toBeGreaterThan(0.7);
		expect(await luminance(page, ".ds-index__row--head")).toBeGreaterThan(0.7);
	});

	test("under reduced motion the mark holds its still frame", async ({ browser }) => {
		const context = await browser.newContext({
			reducedMotion: "reduce",
			viewport: { width: 1440, height: 900 },
		});
		const page = await context.newPage();
		await page.goto(NEWEST);
		const motion = page.locator(".post__mark [data-motion]");
		await expect(motion).toHaveCount(1);
		// --duration-loop is 0s under the preference: an animation with no
		// active interval, so the drawing holds at t=0 whatever the play state.
		await expect(motion).toHaveCSS("animation-duration", "0s");
		await context.close();
	});

	test("accessibility basics: one h1, a labelled index, the mark named, machine-readable dates", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
		await expect(page.getByRole("navigation", { name: "Index" })).toHaveCount(1);
		await expect(page.getByRole("img", { name: "Asserting on Agent Behavior" })).toBeVisible();
		await expect(page.getByRole("img", { name: /read-order test/ })).toBeVisible();
		const times = page.locator("article[data-post] time");
		expect(await times.count()).toBeGreaterThanOrEqual(2);
		for (const t of await times.all()) {
			await expect(t).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
		}
		// The column numbers are decoration.
		await expect(page.locator(".post__colnos")).toHaveAttribute("aria-hidden", "true");
	});

	test("at 375px: one column, no horizontal scroll, the heads over their text, the mark after the lead, the hero and the table full width", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(NEWEST);
		const overflow = await page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			client: document.documentElement.clientWidth,
		}));
		expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

		const article = await box(page, "article[data-post]");
		expect(article.x).toBeGreaterThanOrEqual(16);
		expect(article.x + article.width).toBeLessThanOrEqual(375 - 16 + 1);

		// The title steps down twice on a phone (72 → 44 → 32) and the lead
		// once (20 → 18); the strip sits right under the header, number and
		// date on its first line; the lead and the mark stack under the title,
		// the mark at a modest width; the hero and the index take the whole
		// column.
		await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCSS("font-size", "32px");
		await expect(page.locator(".post__lead")).toHaveCSS("font-size", "18px");
		const header = await box(page, ".site-header");
		const strip = await box(page, "[data-post-strip]");
		expect(strip.y - (header.y + header.height)).toBeLessThanOrEqual(40);
		const no = await box(page, ".post__no");
		const date = await box(page, ".post__date");
		expect(date.y).toBeCloseTo(no.y, 0);
		const title = await box(page, ".post__title");
		const lead = await box(page, ".post__lead");
		const mark = await box(page, ".post__mark");
		expect(lead.y).toBeGreaterThanOrEqual(title.y + title.height);
		expect(mark.y).toBeGreaterThanOrEqual(lead.y + lead.height);
		expect(mark.width).toBeLessThanOrEqual(256);
		const hero = await box(page, "[data-post-hero] img");
		expect(Math.abs(hero.width - article.width)).toBeLessThanOrEqual(1);
		await expect(page.locator(".post__colnos")).toBeHidden();

		// The section head is in flow above its text, both the full column.
		const head = page.locator(".ds-prose-section__head").nth(1);
		await expect(head).toHaveCSS("position", "static");
		const headBox = (await head.boundingBox())!;
		const bodyBox = await box(page, ".ds-prose-section:nth-child(2) .ds-prose-section__body");
		expect(headBox.y + headBox.height).toBeLessThanOrEqual(bodyBox.y + 1);
		expect(Math.abs(headBox.x - bodyBox.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(bodyBox.width - article.width)).toBeLessThanOrEqual(1);
		// The fence and the quote fit the column.
		for (const sel of ["figure.ds-prose-code", "blockquote", ".ds-fig img"]) {
			const b = await box(page, sel);
			expect(b.x + b.width).toBeLessThanOrEqual(article.x + article.width + 1);
		}

		// The index rows fit too, the title still a link, the month under it.
		const row = await box(page, '[data-index-row="prev"]');
		expect(Math.abs(row.width - article.width)).toBeLessThanOrEqual(1);
		const link = await box(page, 'a[data-neighbour="prev"]');
		const filed = await box(page, '[data-index-row="prev"] .ds-index__fold');
		expect(link.x + link.width).toBeLessThanOrEqual(article.x + article.width + 1);
		expect(filed.y).toBeGreaterThanOrEqual(link.y + link.height - 1);
		await expect(page.locator(".ds-index__row--head > .ds-index__fold")).toBeHidden();
	});

	test("with scripting off the post reads: the sections, the figures and the index are static markup", async ({
		browser,
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(NEWEST);
		await expect(
			page.getByRole("main").getByRole("heading", { level: 1, name: "Asserting on Agent Behavior" }),
		).toBeVisible();
		await expect(page.locator(".ds-prose--variant-ruled > .ds-prose-section")).toHaveCount(4);
		await expect(page.locator(".ds-prose-section__head > h2").first()).toBeVisible();
		await expect(page.locator("[data-post-hero] img")).toBeVisible();
		await expect(page.locator("figure.ds-prose-code")).toHaveCount(1);
		await expect(page.locator('a[data-neighbour="prev"]')).toHaveAttribute("href", "/txt/tahoe-mountain-hair/");
		await expect(page.locator(".post__mark[data-art-play]")).toHaveCount(1);
		await context.close();
	});
});
