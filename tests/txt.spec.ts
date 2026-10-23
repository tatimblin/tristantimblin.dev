import { test, expect, chromium, type Page } from "./fixtures/test";

/**
 * THE BLOG: /txt, ITS TAG PAGES, AND A POST.
 *
 * /txt is the POST STACK (src/components/txt/PostStack.astro): a ruled two-
 * column list, the date on the left and the title on the right, one post
 * open at a time — the newest on load, the pointed-at one after. The tag
 * pages keep the plain DS PostList, grouped by year. Categories are a closed
 * set: /txt/category/<id> is simply gone (404), and /txt/categories is a 301
 * in public/_redirects (Cloudflare Pages only). The properties worth pinning:
 *
 *  1. EXACTLY ONE LINK PER POST on the index, newest first; ONE post open.
 *  2. NO POINTER JUMP: opening a post never moves a different post under a
 *     still pointer, and the list's height never changes — every post opens
 *     by the same measured height, so the posts below stay put and the one
 *     under the pointer only grows around it. At 1440 and at 375.
 *  3. INTENT: a still pointer opens nothing; a click or tap on a post that
 *     was closed when it began only opens it, the open title (underlined)
 *     is the link; focus opens. The newest is open after every arrival — a
 *     load, a client-router swap, back/forward, a bfcache restore.
 *  4. IT WORKS WITH SCRIPTING OFF: the first post is open, every title a link.
 *  5. NO CATEGORY PAGES are built; TAG PAGES STILL RESOLVE.
 *  6. A POST (the block at the foot of this file) is the RULED page: one
 *     four-column grid — the status strip, the title and lead, the hero as
 *     Fig. 01, the body cut into numbered sections with sticky heads, and an
 *     index table naming the tags and the neighbours. No reading ruler, no
 *     contents rail, and the same measure with or without h2s.
 */

/** The post links on a list page, in DOM order: the stack's titles on /txt,
 *  the PostRows on a tag page. */
const postLinks = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLAnchorElement>("a.stack__title, a.ds-post-row__link"))
			.map((a) => a.getAttribute("href"))
			.filter((h) => h && /^\/txt\/[^/]+\/$/.test(h))
	);

const POST = ".stack__post";
const OPEN = ".stack__post[data-open]";

/** The href of the nth row's title on /txt, read off the page: the rows are
 *  the posts and the demos interleaved by date, so which entry sits at a
 *  given index is content, not something these tests pin. */
const hrefAt = async (page: Page, n: number) =>
	(await page.locator(`${POST} a.stack__title`).nth(n).getAttribute("href"))!;
/** A URL ending in that href. */
const endsWith = (href: string) => new RegExp(`${href.replace(/[/.]/g, "\\$&")}$`);

/** The hrefs of the open posts (there should be exactly one). */
const openPosts = (page: Page) =>
	page.locator(`${OPEN} a.stack__title`).evaluateAll((as) => as.map((a) => a.getAttribute("href")));

/** The list's height and every body's height, in px. */
const geometry = (page: Page) =>
	page.evaluate(() => ({
		list: document.querySelector("[data-stack]")!.getBoundingClientRect().height,
		bodies: Array.from(document.querySelectorAll(".stack__body")).map(
			(el) => el.getBoundingClientRect().height,
		),
		open: parseFloat(getComputedStyle(document.querySelector("[data-stack]")!).getPropertyValue("--stack-open")),
	}));

/** Which post (its index in the list) is under the viewport point. */
const postAt = (page: Page, x: number, y: number) =>
	page.evaluate(
		([x, y]) => {
			const el = document.elementFromPoint(x, y);
			const post = el?.closest(".stack__post");
			return post ? Array.from(document.querySelectorAll(".stack__post")).indexOf(post) : -1;
		},
		[x, y] as const,
	);

/** Wait for every swap animation on the bodies to end. */
const settle = (page: Page) =>
	page.waitForFunction(
		() =>
			Array.from(document.querySelectorAll(".stack__body")).every(
				(el) => el.getAnimations().length === 0,
			),
		undefined,
		{ timeout: 5000 },
	);

/** The centre of the nth post's title, in viewport coordinates. */
const titleCentre = async (page: Page, n: number) => {
	const b = (await page.locator(`${POST} a.stack__title`).nth(n).boundingBox())!;
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/**
 * Move the pointer onto the nth post's title and wait out the swap without
 * moving again; then the post under the pointer must still be that one, it
 * must be the open one, and the list must be the height it was.
 */
async function moveAndCheck(page: Page, n: number) {
	const before = await geometry(page);
	const { x, y } = await titleCentre(page, n);
	// A few steps, as a real hand moves: the intermediate posts open and
	// close along the way, which is the retargeting case worth exercising.
	await page.mouse.move(x, y, { steps: 4 });
	await settle(page);
	expect(await postAt(page, x, y), `post ${n} should still be under the pointer`).toBe(n);
	expect(await page.locator(OPEN).count()).toBe(1);
	expect(await page.locator(POST).nth(n).getAttribute("data-open")).not.toBeNull();
	const after = await geometry(page);
	expect(Math.abs(after.list - before.list)).toBeLessThanOrEqual(1);
	// Exactly one body is H tall, the rest are closed.
	expect(after.bodies.filter((h) => Math.abs(h - after.open) <= 1)).toHaveLength(1);
	expect(after.bodies.filter((h) => h === 0)).toHaveLength(after.bodies.length - 1);
}

test.describe("/txt/", () => {
	test("every post is linked exactly once, newest first; the first is open, and only it", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const links = await postLinks(page);
		expect(links.length, "the index should link some posts").toBeGreaterThan(0);
		expect(new Set(links).size, `duplicate post links: ${links}`).toBe(links.length);
		expect(links.slice(0, 2)).toEqual(["/txt/subhumans/", "/txt/asserting-on-agent-behavior/"]);
		// No year groups, no PostList: the stack alone.
		await expect(page.locator(".ds-post-group, .ds-post-list")).toHaveCount(0);
		// The first row (the newest entry, a post or a demo: demos are
		// interleaved, tests/demo.spec.ts) is the open one.
		const first = await page.locator(`${POST} a.stack__title`).first().getAttribute("href");
		expect(await openPosts(page)).toEqual([first]);
		await expect(page.locator(`${OPEN} .stack__body`)).toBeVisible();
		// The date column reads month / year.
		const row = page.locator(POST).filter({ has: page.locator('a[href="/txt/asserting-on-agent-behavior/"]') });
		await expect(row.locator("time.stack__date")).toHaveText("02 / 26");
		await expect(row.locator("time.stack__date")).toHaveAttribute("datetime", "2026-02-02");
		// A post's body: category · words, the excerpt, READ to the same
		// place — no reading-time numeral.
		const body = row.locator(".stack__body");
		await expect(body.locator(".stack__time, .ds-figure")).toHaveCount(0);
		// The reads follow once the post has 10 or more (src/data/pageviews.json).
		await expect(body.locator(".stack__text .stack__meta")).toHaveText(
			/^Programming · [\d,]+ words( · [\d,]+ reads)?$/,
		);
		await expect(body.locator(".stack__rail .stack__meta")).toHaveCount(0);
		await expect(body.locator(".stack__excerpt")).toHaveText(/\S/);
		const read = body.locator("a.stack__read");
		await expect(read).toHaveAttribute("href", "/txt/asserting-on-agent-behavior/");
		await expect(read).toHaveAttribute("tabindex", "-1");
		await expect(read).toHaveAttribute("aria-hidden", "true");
		// Closed bodies are hidden, and the script has measured H.
		await expect(page.locator(`${POST}:not([data-open]) .stack__body`).first()).toBeHidden();
		const g = await geometry(page);
		expect(g.open).toBeGreaterThan(0);
		expect(Math.abs(g.bodies[0] - g.open)).toBeLessThanOrEqual(1);
	});

	for (const width of [1440, 375]) {
		test(`no pointer jump at ${width}: a post below the open one, then one above`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: width < 640 ? 812 : 900 });
			await page.goto("/txt/");
			await page.locator("[data-stack]").scrollIntoViewIfNeeded();
			await settle(page);
			// Every title is laid out the same open and closed: pin the header
			// geometry before any swap, then compare after.
			const heads = () =>
				page.locator(`${POST} a.stack__title`).evaluateAll((as) =>
					as.map((a) => a.getBoundingClientRect().height),
				);
			const headsBefore = await heads();
			// Prime the intent gate (the first move only records coordinates)
			// from a point outside the list.
			await page.mouse.move(1, 1);
			// Down to the third post (two below the open first one).
			await moveAndCheck(page, 2);
			// Up to the second: the one between the open one and the top.
			await moveAndCheck(page, 1);
			// And up past it to the first.
			await moveAndCheck(page, 0);
			expect(await heads()).toEqual(headsBefore);
		});
	}

	for (const width of [1440, 375]) {
		test(`the meta and READ's label start on the title's and the excerpt's x at ${width}${width < 640 ? ", READ bleeding to the viewport edge" : ""}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: width < 640 ? 812 : 900 });
			await page.goto("/txt/");
			const m = await page.evaluate(() => {
				/** The left x of an element's first non-blank text node. */
				const textX = (el: Element) => {
					const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
						acceptNode: (n) => (n.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
					});
					const range = document.createRange();
					range.selectNodeContents(walker.nextNode()!);
					return range.getClientRects()[0].left;
				};
				const post = document.querySelector(".stack__post[data-open]")!;
				const box = post.getBoundingClientRect();
				const read = post.querySelector(".stack__read")!;
				// A demo row has no meta line (its DEMO chip says what it is).
				const meta = post.querySelector(".stack__meta");
				return {
					title: textX(post.querySelector(".stack__title")!),
					excerpt: textX(post.querySelector(".stack__excerpt")!),
					label: textX(read),
					readLeft: read.getBoundingClientRect().left,
					hasMeta: meta !== null,
					meta: meta ? textX(meta) : 0,
					titleBottom: post.querySelector(".stack__title")!.getBoundingClientRect().bottom,
					metaTop: meta ? meta.getBoundingClientRect().top : 0,
					metaBottom: meta ? meta.getBoundingClientRect().bottom : 0,
					excerptTop: post.querySelector(".stack__excerpt")!.getBoundingClientRect().top,
					readBottom: read.getBoundingClientRect().bottom,
					nextTop: post.nextElementSibling!.getBoundingClientRect().top,
					rule: box.left + box.width / 2,
					scrollWidth: document.documentElement.scrollWidth,
					clientWidth: document.documentElement.clientWidth,
				};
			});
			expect(Math.abs(m.excerpt - m.title)).toBeLessThanOrEqual(1);
			expect(Math.abs(m.label - m.title)).toBeLessThanOrEqual(1);
			// READ sits on the column rule (desktop) or the viewport's edge
			// (phone), its foot on the next post's top.
			expect(Math.abs(m.readLeft - (width < 640 ? 0 : m.rule))).toBeLessThanOrEqual(1);
			expect(Math.abs(m.readBottom - m.nextTop)).toBeLessThanOrEqual(1);
			// The meta sits on its own line between the title and the excerpt,
			// on their x.
			if (m.hasMeta) {
				expect(Math.abs(m.meta - m.title)).toBeLessThanOrEqual(1);
				expect(m.metaTop).toBeGreaterThanOrEqual(m.titleBottom - 1);
				expect(m.metaBottom).toBeLessThanOrEqual(m.excerptTop + 1);
			}
			// The bleed never scrolls the page sideways.
			expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
		});
	}

	test("a still pointer opens nothing: the open post changes only when the pointer moves", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/txt/");
		await page.mouse.move(1, 1);
		await moveAndCheck(page, 1);
		// Open the fourth post from the keyboard while the pointer rests on the
		// second: the second slides (its body closes, the fourth's opens below
		// the pointer, which is above both). Nothing moved the pointer, so the
		// fourth stays open — no pointerenter / mouseover reopens the second.
		const fourth = await hrefAt(page, 3);
		await page.locator(`${POST} a.stack__title`).nth(3).focus();
		await settle(page);
		expect(await openPosts(page)).toEqual([fourth]);
		// Give a synthetic hover update every chance to fire.
		await page.waitForTimeout(400);
		expect(await openPosts(page)).toEqual([fourth]);
		// The pointer never left the second post, which is now closed.
		const { x, y } = await titleCentre(page, 1);
		expect(await postAt(page, x, y)).toBe(1);
	});

	test("touch: a tap on a closed post opens it; a second tap on its title navigates", async ({
		browser,
	}) => {
		const context = await browser.newContext({
			viewport: { width: 375, height: 812 },
			hasTouch: true,
			isMobile: true,
		});
		const page = await context.newPage();
		await page.goto("/txt/");
		await page.locator("[data-stack]").scrollIntoViewIfNeeded();
		const second = await hrefAt(page, 1);
		let { x, y } = await titleCentre(page, 1);
		await page.touchscreen.tap(x, y);
		await settle(page);
		await expect(page).toHaveURL(/\/txt\/$/);
		expect(await openPosts(page)).toEqual([second]);
		// The title may have moved up (the first post's body closed above it):
		// tap where it is now.
		({ x, y } = await titleCentre(page, 1));
		await page.touchscreen.tap(x, y);
		await expect(page).toHaveURL(endsWith(second));
		await context.close();
	});

	test("keyboard: tabbing to the second title opens it", async ({ page }) => {
		await page.goto("/txt/");
		await page.locator(`${POST} a.stack__title`).first().focus();
		// READ is tabindex -1, so the next stop is the second post's title.
		await page.keyboard.press("Tab");
		await expect(page.locator(`${POST} a.stack__title`).nth(1)).toBeFocused();
		await settle(page);
		expect(await openPosts(page)).toEqual([await hrefAt(page, 1)]);
	});

	test("reduced motion: the swap is instant", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/txt/");
		await page.mouse.move(1, 1);
		const { x, y } = await titleCentre(page, 2);
		await page.mouse.move(x, y, { steps: 2 });
		// No wait: the end state is simply present, with nothing animating.
		const g = await geometry(page);
		expect(Math.abs(g.bodies[2] - g.open)).toBeLessThanOrEqual(1);
		expect(g.bodies.filter((h) => h === 0)).toHaveLength(g.bodies.length - 1);
		expect(
			await page.evaluate(() =>
				Array.from(document.querySelectorAll(".stack__body")).reduce((n, el) => n + el.getAnimations().length, 0),
			),
		).toBe(0);
		expect(await openPosts(page)).toEqual([await hrefAt(page, 2)]);
	});

	for (const width of [375, 320]) {
		test(`phone at ${width}: the rules run edge to edge, the text keeps the gutter, nothing scrolls sideways`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 812 });
			await page.goto("/txt/");
			const m = await page.evaluate(() => {
				const vw = document.documentElement.clientWidth;
				const stack = document.querySelector("[data-stack]")!;
				const s = stack.getBoundingClientRect();
				const posts = Array.from(document.querySelectorAll(".stack__post")).map((p) => {
					const r = p.getBoundingClientRect();
					return { left: r.left, right: r.right, top: getComputedStyle(p).borderTopWidth };
				});
				const header = document.querySelector(".blog__main h1, h1")!.getBoundingClientRect().left;
				const title = document.querySelector(".stack__title")!.getBoundingClientRect().left;
				return {
					vw,
					stack: { left: s.left, right: s.right, border: getComputedStyle(stack).borderTopWidth },
					posts,
					header,
					title,
					scrollWidth: document.documentElement.scrollWidth,
				};
			});
			expect(m.stack.left).toBe(0);
			expect(Math.abs(m.stack.right - m.vw)).toBeLessThanOrEqual(1);
			expect(m.stack.border).toBe("1px");
			for (const [i, p] of m.posts.entries()) {
				expect(p.left).toBe(0);
				expect(Math.abs(p.right - m.vw)).toBeLessThanOrEqual(1);
				if (i > 0) expect(p.top).toBe("1px");
			}
			// The title stays on the page's gutter, under the page heading.
			expect(Math.abs(m.title - m.header)).toBeLessThanOrEqual(1);
			expect(m.title).toBeGreaterThan(0);
			expect(m.scrollWidth).toBeLessThanOrEqual(m.vw);
		});
	}

	test("desktop rules stay in the container", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/txt/");
		const m = await page.evaluate(() => {
			const s = document.querySelector("[data-stack]")!.getBoundingClientRect();
			const h = document.querySelector("h1")!.getBoundingClientRect();
			return { left: s.left, headerLeft: h.left };
		});
		expect(m.left).toBeGreaterThan(0);
		expect(Math.abs(m.left - m.headerLeft)).toBeLessThanOrEqual(1);
	});

	test("the open title is underlined (a link); closed titles are not", async ({ page }) => {
		for (const width of [1440, 375]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto("/txt/");
			const lines = await page
				.locator(`${POST} a.stack__title`)
				.evaluateAll((as) => as.map((a) => getComputedStyle(a).textDecorationLine));
			expect(lines[0]).toBe("underline");
			expect(lines.slice(1).every((l) => l === "none"), `closed titles: ${lines}`).toBe(true);
			// Keyboard-open the third: the underline moves with it, and the
			// header box does not change.
			const before = await page.locator(`${POST} a.stack__title`).nth(2).boundingBox();
			await page.locator(`${POST} a.stack__title`).nth(2).focus();
			await settle(page);
			const after = await page
				.locator(`${POST} a.stack__title`)
				.evaluateAll((as) => as.map((a) => getComputedStyle(a).textDecorationLine));
			expect(after).toEqual(after.map((_, i) => (i === 2 ? "underline" : "none")));
			expect((await page.locator(`${POST} a.stack__title`).nth(2).boundingBox())!.height).toBe(before!.height);
		}
	});

	test("mouse: a click on a closed post with no movement first only opens it; a second click navigates", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/txt/");
		// No prior move: the first pointer event the page sees is this press,
		// so the hover gate has not opened anything.
		const third = await hrefAt(page, 2);
		let { x, y } = await titleCentre(page, 2);
		await page.mouse.click(x, y);
		await settle(page);
		await expect(page).toHaveURL(/\/txt\/$/);
		expect(await openPosts(page)).toEqual([third]);
		({ x, y } = await titleCentre(page, 2));
		await page.mouse.click(x, y);
		await expect(page).toHaveURL(endsWith(third));
	});

	test("mouse: a click on a closed post's date opens it and goes nowhere", async ({ page }) => {
		for (const width of [1440, 375]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto("/txt/");
			await page.locator(`${POST} time.stack__date`).nth(1).click();
			await settle(page);
			await expect(page).toHaveURL(/\/txt\/$/);
			expect(await openPosts(page)).toEqual([await hrefAt(page, 1)]);
		}
	});

	test("mouse: hovering opens a post, so a click on its title navigates at once", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/txt/");
		await page.mouse.move(1, 1);
		await moveAndCheck(page, 1);
		const second = await hrefAt(page, 1);
		const { x, y } = await titleCentre(page, 1);
		await page.mouse.click(x, y);
		await expect(page).toHaveURL(endsWith(second));
	});

	test("keyboard: Enter on a focused title navigates (focus has opened it)", async ({ page }) => {
		await page.goto("/txt/");
		const second = await hrefAt(page, 1);
		await page.locator(`${POST} a.stack__title`).nth(1).focus();
		await settle(page);
		expect(await openPosts(page)).toEqual([second]);
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(endsWith(second));
	});

	for (const width of [1440, 375]) {
		test(`the newest post is open after every arrival at ${width}`, async ({ page }) => {
			await page.setViewportSize({ width, height: width < 640 ? 812 : 900 });
			const writing = page.locator('.site-header a[href="/txt/"]').first();
			const arrived = async (how: string) => {
				await expect(page).toHaveURL(/\/txt\/$/);
				// The router moves the URL before it swaps the DOM, and draws the
				// swap as a view transition: wait out both.
				await page.waitForFunction(
					() =>
						document.querySelector("[data-stack]") &&
						!document.documentElement.hasAttribute("data-astro-transition"),
				);
				await settle(page);
				expect(await openPosts(page), how).toEqual([await hrefAt(page, 0)]);
				const g = await geometry(page);
				expect(Math.abs(g.bodies[0] - g.open), how).toBeLessThanOrEqual(1);
			};
			// The client router, from the homepage and from a post.
			await page.goto("/");
			await writing.click();
			await arrived("from / by the header link");
			await page.goto(NO_H2S);
			await writing.click();
			await arrived("from a post by the header link");
			// Back to the list after opening another post and following it.
			const third = await hrefAt(page, 2);
			await page.locator(`${POST} time.stack__date`).nth(2).click();
			await settle(page);
			expect(await openPosts(page)).toEqual([third]);
			await page.locator(`${OPEN} a.stack__title`).click();
			await expect(page).toHaveURL(endsWith(third));
			await page.goBack();
			await arrived("back from a post");
			// A reload with the pointer resting on a later post: nothing has moved.
			await page.mouse.move(1, 1);
			await moveAndCheck(page, 3);
			await page.reload();
			await arrived("a reload under a resting pointer");
			await page.waitForTimeout(400);
			expect(await openPosts(page)).toEqual([await hrefAt(page, 0)]);
		});
	}

	test("there are no category pages", async ({ page }) => {
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

	test("the stack and nav are reachable with scripting off: the first post open, every title a link", async ({
		browser,
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt/tag/diy/");
		await page.locator('.site-header a[href="/txt/"]').click();
		await expect(page).toHaveURL(/\/txt\/?$/);
		// The server renders the first post open, its body at its natural height.
		expect(await openPosts(page)).toEqual([await hrefAt(page, 0)]);
		await expect(page.locator(`${OPEN} .stack__body`)).toBeVisible();
		await expect(page.locator(`${OPEN} .stack__excerpt`)).toBeVisible();
		expect((await geometry(page)).bodies[0]).toBeGreaterThan(0);
		// Every title is a plain link, open or not.
		const links = await postLinks(page);
		expect(links.length).toBeGreaterThan(1);
		await page.locator('a.stack__title[href="/txt/mega-desk/"]').click();
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
		await expect(page.locator("h1")).toHaveText("The Mega Desk");
		await context.close();
	});
});

/* A bfcache restore brings a page back exactly as it was left — the post the
   pointer had opened, still open — and fires no astro:page-load. Playwright's
   Chromium runs with the bfcache off, and a worker's launch options cannot be
   changed from a describe, so this test launches its own: the full (new-
   headless) Chromium, which supports it, with the cache left on. */
test("/txt/ — a bfcache restore reopens the newest post", async ({ baseURL }) => {
	const browser = await chromium.launch({
		channel: "chromium",
		ignoreDefaultArgs: ["--disable-back-forward-cache"],
	});
	try {
		const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 900 } });
		await page.goto("/txt/");
		await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
		await page.mouse.move(1, 1);
		await moveAndCheck(page, 3);
		// Leave by a full navigation (not the client router), then come back.
		await page.goto("about:blank");
		await page.goBack({ waitUntil: "commit" });
		await expect(page).toHaveURL(/\/txt\/$/);
		// It really was the bfcache: the old document, its globals intact.
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept ?? false))
			.toBe(true);
		await settle(page);
		expect(await openPosts(page)).toEqual([await hrefAt(page, 0)]);
	} finally {
		await browser.close();
	}
});

/**
 * THE POST PAGE (src/layouts/PostLayout.astro) — the ruled page.
 *
 * Numbers are chronological: 001 the dashboard (May 2023, the oldest), 002
 * Fisker, 003 the Mega Desk, 004 Tahoe, 005 Asserting on Agent Behavior, 006
 * sub-human (the latest). Most checks run on Asserting (NEWEST, from when it
 * was); the ends are checked on LATEST and OLDEST. `prev` is the older
 * neighbour, `next` the newer. The Mega Desk has
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
const LATEST = "/txt/subhumans/";
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

	test("the status strip: the number, the category, the stats, the date", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const strip = page.locator("[data-post-strip]");
		await expect(strip.locator(".post__no")).toHaveText(/txt \/ 005/i);
		await expect(strip.locator(".post__category")).toHaveText(/Programming/);
		// The reads follow once the post has 10 or more (src/data/pageviews.json).
		await expect(strip.locator(".post__stats")).toHaveText(
			/^\s*3 min · \d{3} words( · [\d,]+ reads)?\s*$/i,
		);
		await expect(strip.locator("time.post__date")).toHaveText("02.02.2026");
		await expect(strip.locator("time.post__date")).toHaveAttribute("datetime", "2026-02-02");
		// The date sits on the right edge of the row, the number on the left.
		const row = await box(page, "[data-post-strip]");
		const date = await box(page, "time.post__date");
		const no = await box(page, ".post__no");
		expect(Math.abs(date.x + date.width - (row.x + row.width))).toBeLessThanOrEqual(2);
		expect(Math.abs(no.x - row.x)).toBeLessThanOrEqual(1);
	});

	test("no reading ruler, no contents rail, no neighbour cards", async ({ page }) => {
		await page.goto(NEWEST);
		await expect(page.locator("[data-post-ruler], .ds-tick-ruler")).toHaveCount(0);
		await expect(page.locator("[data-post-rail]")).toHaveCount(0);
		await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(0);
		await expect(page.locator(".post__neighbour, .post__neighbours")).toHaveCount(0);
		// No stat pairs or pills.
		await expect(page.locator(".post__meta, .ds-pill")).toHaveCount(0);
	});

	test("the title across three columns, the lead in two", async ({
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
		// The title from the first line; the lead from the second column's line.
		expect(Math.abs(title.x - article.x)).toBeLessThanOrEqual(1);
		expect(title.width).toBeLessThanOrEqual(3 * col + 2 * gap + 1);
		expect(Math.abs(lead.x - (article.x + col + gap))).toBeLessThanOrEqual(1);
		expect(Math.abs(lead.width - (2 * col + gap))).toBeLessThanOrEqual(1);
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
		// Framed like every box: the dashed edge and the one corner.
		await expect(img).toHaveCSS("border-top-width", "1px");
		await expect(img).toHaveCSS("border-top-style", "dashed");
		await expect(img).toHaveCSS("border-top-left-radius", "2.5px");
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
		// The heads are the page's h2s, in the heading face at its Medium, 24px.
		const h2 = sections.locator("h2").first();
		await expect(h2).toHaveCSS("font-size", "24px");
		await expect(h2).toHaveCSS("font-weight", "500");
		expect(await h2.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"DM Sans"/);

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

	test("the body: links in the link blue, code between hairlines under a numbered header, a captioned figure, the pull quote", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const body = page.locator(".ds-prose-section__body");

		// Links in the link token (the hyperlink blue), not the ink, underlined at
		// rest by text-decoration — no border drawn under them — and plain under
		// the pointer.
		const link = body.locator("a").first();
		const [linkInk, token, ink] = await page.evaluate(() => {
			const probe = document.createElement("span");
			probe.style.color = "var(--link-color)";
			document.body.append(probe);
			const resolved = getComputedStyle(probe).color;
			probe.remove();
			return [
				getComputedStyle(document.querySelector(".ds-prose-section__body a")!).color,
				resolved,
				getComputedStyle(document.querySelector(".post__title")!).color,
			];
		});
		expect(linkInk).toBe(token);
		expect(linkInk).toBe("rgb(2, 118, 253)");
		expect(linkInk).not.toBe(ink);
		await expect(link).toHaveCSS("text-decoration-line", "underline");
		await expect(link).toHaveCSS("text-underline-offset", "2px");
		await expect(link).toHaveCSS("border-bottom-width", "0px");
		await link.hover();
		await expect(link).toHaveCSS("text-decoration-line", "none");
		await page.mouse.move(0, 0);

		// Inline code on the first wash, no edge, the box's corner.
		const code = body.locator(":not(pre) > code").first();
		await expect(code).toHaveCSS("border-top-width", "0px");
		await expect(code).toHaveCSS("border-top-left-radius", "2.5px");
		await expect(code).toHaveCSS("background-color", "rgb(241, 244, 247)");

		// The fence: a figure with its header row, the code highlighted, no box.
		const fig = body.locator("figure.ds-prose-code");
		await expect(fig).toHaveCount(1);
		await expect(fig.locator(".ds-prose-code__head > .ds-mono")).toHaveText([
			/01\.1 \/ env-protection\.yml/i,
			/^yaml$/i,
		]);
		await expect(fig).toHaveCSS("border-top-width", "1px");
		await expect(fig).toHaveCSS("border-bottom-width", "1px");
		await expect(fig).toHaveCSS("border-top-style", "dashed");
		// The code on its slab: --code-bg / --code-fg (the near-black block on
		// cream), the box's corner, no edge on the light page.
		const pre = fig.locator("pre.astro-code");
		await expect(pre).toHaveCSS("background-color", "rgb(25, 25, 24)");
		await expect(pre).toHaveCSS("color", "rgb(245, 245, 243)");
		await expect(pre).toHaveCSS("border-top-width", "0px");
		await expect(pre).toHaveCSS("border-top-left-radius", "2.5px");
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
		// It bleeds: the text's two columns and the air beside them, where a paragraph stays in two.
		const { col, gap, text } = await columns(page);
		const bled = await box(page, ".ds-prose-section__body > figure.ds-fig");
		const para = await box(page, ".ds-prose-section__body > p");
		expect(Math.abs(bled.width - (3 * col + 2 * gap))).toBeLessThanOrEqual(1);
		expect(Math.abs(para.width - text)).toBeLessThanOrEqual(1);
		expect(Math.abs(bled.x - para.x)).toBeLessThanOrEqual(1);

		// The quote: the accent bar, no fill, the words a step up, the attribution.
		const quote = body.locator("blockquote.ds-blockquote");
		await expect(quote).toHaveCount(1);
		await expect(quote).toHaveCSS("background-color", TRANSPARENT);
		await expect(quote).toHaveCSS("border-left-width", "2px");
		// A step up from the 14px body: --font-size-4 (the mono reads larger
		// than the old grotesk did at a size).
		await expect(quote.locator("> p").first()).toHaveCSS("font-size", "18px");
		// The attribution is outside the quoted words: the figure's caption.
		await expect(quote.locator("footer")).toHaveCount(0);
		await expect(
			body.locator("figure.ds-prose-quote:has(> blockquote.ds-blockquote) > figcaption"),
		).toHaveText(/brace sproul \/ langchain/i);
		expect(await quote.locator("> p").first().textContent()).not.toMatch(/^\s*—/);
	});

	test("a full bleed takes every column: the fleet demo, edge to edge, its launch the DS button", async ({
		page,
	}) => {
		await page.goto(OLDEST);
		const { article } = await columns(page);
		const demo = await box(page, "fleet-demo[data-prose-bleed='full']");
		expect(Math.abs(demo.x - article.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(demo.width - article.width)).toBeLessThanOrEqual(1);
		// The Button's box, not element.css's fallback dress.
		const launch = page.locator("fleet-demo [data-launch]");
		await expect(launch).toHaveClass(/ds-button--variant-primary/);
		const [height, token] = await launch.evaluate((el) => [
			getComputedStyle(el).height,
			getComputedStyle(document.documentElement).getPropertyValue("--space-6").trim(),
		]);
		expect(height).toBe(token);
	});

	test("the foot card: keep reading, older and newer side by side, the tags; an end says so", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		const card = page.getByRole("navigation", { name: "Keep reading" });
		await expect(card).toHaveAttribute("data-post-more", "");
		// A panel: the card's dashed edge, radius and gradient header.
		await expect(card).toHaveCSS("border-top-style", "dashed");
		await expect(card).toHaveCSS("border-top-left-radius", "2.5px");
		await expect(card.locator(".ds-card-header")).toHaveText(/keep reading\s*txt \/ 005 of 006/i);
		await expect(card.locator(".ds-card-header")).toHaveCSS("background-image", /linear-gradient/);
		const cardBox = await box(page, ".post-more");
		const { article } = await columns(page);
		expect(Math.abs(cardBox.width - article.width)).toBeLessThanOrEqual(1);

		const tags = card.locator('[data-half="tags"]');
		await expect(tags).toHaveText(/tagged\s*ai\s*testing\s*agents\s*developer tools/i);
		expect(
			await tags.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))),
		).toEqual(["/txt/tag/ai/", "/txt/tag/testing/", "/txt/tag/agents/", "/txt/tag/developer-tools/"]);

		// The older half is one link, title and month inside it.
		const prev = card.locator('a[data-neighbour="prev"]');
		await expect(prev).toHaveText(/← older\s*Tahoe Mountain Hair\s*jun 2025/i);
		await expect(prev).toHaveAttribute("href", "/txt/tahoe-mountain-hair/");
		await expect(prev.locator("time")).toHaveAttribute("datetime", "2025-06-13");

		// Side by side at desktop, a dashed rule between; the newer half reads
		// from the right edge.
		const next = card.locator('[data-half="next"]');
		const prevBox = (await prev.boundingBox())!;
		const nextBox = (await next.boundingBox())!;
		expect(Math.abs(prevBox.y - nextBox.y)).toBeLessThanOrEqual(1);
		expect(nextBox.x).toBeGreaterThan(prevBox.x + prevBox.width - 1);
		await expect(next).toHaveCSS("border-left-style", "dashed");
		await expect(next).toHaveCSS("text-align", "end");

		await expect(card.locator('a[data-neighbour="next"]')).toHaveAttribute("href", LATEST);

		// The latest post has no newer: the half says so and links nowhere.
		await page.goto(LATEST);
		await expect(page.locator(".post__no")).toHaveText(/txt \/ 006/i);
		await expect(page.locator('[data-half="next"]')).toHaveText(/newer →\s*This is the latest post/i);
		await expect(page.locator('[data-half="next"] a')).toHaveCount(0);
		await expect(page.locator("a.post-more__half--next")).toHaveCount(0);

		await page.goto(OLDEST);
		await expect(page.locator(".post__no")).toHaveText(/txt \/ 001/i);
		await expect(page.locator('[data-half="prev"]')).toHaveText(/This is the first post/);
		await expect(page.locator("a.post-more__half--prev")).toHaveCount(0);
		await expect(page.locator('a[data-neighbour="next"]')).toHaveAttribute("href", "/txt/why-i-joined-fisker/");
	});

	test("light theme: the foot card is a pale panel with dark header ink", async ({
		page,
	}) => {
		await page.addInitScript(() => localStorage.setItem("theme", "light"));
		await page.goto(NEWEST);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		expect(await luminance(page, ".post-more")).toBeGreaterThan(0.85);
		expect(await luminance(page, ".post-more .ds-card-header__title", "color")).toBeLessThan(0.3);
	});

	test("dark theme: the foot card is a dark panel with light header ink, and the code block is edged", async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem("theme", "dark"));
		await page.goto(NEWEST);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		// A fill, not a hole: transparent would read back as black (0) too.
		await expect(page.locator(".post-more")).not.toHaveCSS("background-color", TRANSPARENT);
		expect(await luminance(page, ".post-more")).toBeLessThan(0.05);
		expect(await luminance(page, ".post-more .ds-card-header__title", "color")).toBeGreaterThan(0.3);
		// The slab sinks below the dark page, so the dashed edge is drawn round it
		// (--code-border) to hold its shape; on cream it has none.
		const preSel = ".ds-prose-section__body figure.ds-prose-code pre.astro-code";
		const pre = page.locator(preSel);
		await expect(pre).toHaveCSS("border-top-width", "1px");
		await expect(pre).toHaveCSS("border-top-style", "dashed");
		expect(await luminance(page, preSel)).toBeLessThan(await luminance(page, "body"));
		// The link lifted for the dark page, still the link token.
		await expect(page.locator(".ds-prose-section__body a").first()).toHaveCSS("color", "rgb(92, 165, 255)");
	});

	test("accessibility basics: one h1, a labelled index, machine-readable dates", async ({
		page,
	}) => {
		await page.goto(NEWEST);
		await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
		await expect(page.getByRole("navigation", { name: "Keep reading" })).toHaveCount(1);
		await expect(page.getByRole("img", { name: /read-order test/ })).toBeVisible();
		const times = page.locator("article[data-post] time");
		expect(await times.count()).toBeGreaterThanOrEqual(2);
		for (const t of await times.all()) {
			await expect(t).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/);
		}
		// The column numbers are decoration.
		await expect(page.locator(".post__colnos")).toHaveAttribute("aria-hidden", "true");
	});

	test("at 375px: one column, no horizontal scroll, the heads over their text, the hero and the table full width", async ({
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
		// date on its first line; the lead stacks under the title; the hero and the index take the whole
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
		expect(lead.y).toBeGreaterThanOrEqual(title.y + title.height);
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

		// The foot card spans the column; its halves stack, older on top, both
		// on the left edge.
		const panel = await box(page, ".post-more");
		expect(Math.abs(panel.width - article.width)).toBeLessThanOrEqual(1);
		const older = await box(page, '[data-half="prev"]');
		const newer = await box(page, '[data-half="next"]');
		expect(older.x + older.width).toBeLessThanOrEqual(article.x + article.width + 1);
		expect(newer.y).toBeGreaterThanOrEqual(older.y + older.height - 1);
		await expect(page.locator('[data-half="next"]')).toHaveCSS("text-align", "start");
	});

	test("with scripting off the post reads: the sections, the figures and the foot card are static markup", async ({
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
		await context.close();
	});
});
