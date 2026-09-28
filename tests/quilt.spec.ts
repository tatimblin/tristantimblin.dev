import { test, expect, type Page } from "@playwright/test";

/**
 * THE QUILT'S INTERACTION CONTRACT, IN THE BROWSER.
 *
 * /txt is a grid of art tiles driven by src/lib/quilt/index.ts, which asks
 * the pure engine (src/lib/quilt/engine.ts) what to paint on every state
 * change. The engine's rules — scoring, the block choice, the scatter maths,
 * the layout — are pinned in tests/quilt-engine.spec.ts without a browser.
 * This spec pins the other half: that the page PAINTS those answers onto the
 * DOM the design system defines, and that the inputs (pointer, focus, keys,
 * ?q=) reach the engine.
 *
 *   rest        every cell lit, one link per post, fillers aria-hidden and
 *               drawn faint; a full-width board inside an even gutter
 *   hover/focus the tile lit, the rest faint or gone on a stagger, the card
 *               in a block that dodges it; leaving the tile restores (the
 *               panel holds it, tile to tile never passes rest); deterministic
 *   typing      the count, ?q= via replaceState, ?q= on load
 *   results     <mark>, the why, the listbox, ↑↓ wrap, the ring, Enter
 *   single/none the card; the nothing face and its pills
 *   keys        / and ⌘K (not from another field), Esc clears then blurs
 *   viewports   the 3-column tablet grid; the phone list, panel in flow
 *   no JS       links, and the form submits ?q=
 *
 * And the INSTRUMENT around the board (the "instrument —" describes):
 *
 *   tabs        real links to ?q=<category>, set in place; aria-current on
 *               ALL at rest, on the category's tab for its query, on none
 *               for any other query; ?q= on load
 *   stepper     − older / + newer through the matching posts, newest
 *               first, wrapping; the card, the ring and the playhead follow;
 *               a step holds while the pointer is elsewhere; Escape clears
 *   timeline    one tick per month, a named link per post, the playhead on
 *               the post in focus (at rest the latest), dim ticks under a
 *               filter, a click pins
 *   card        the infra card's fields and its gauge; the big tier at 1920
 *   count       the figure and its label
 *   layouts     the frame's rows; tablet; phone; no horizontal overflow
 *
 * TEXT. The script writes the kicker and the why in capitals and everything
 * else in lowercase (CSS draws it in capitals), so assertions read the DOM's
 * textContent, not what is on screen.
 *
 * Post numbers are chronological: 001 is the dashboard (May 2023), 003 the
 * Mega Desk (Apr 2025), 005 the newest.
 */

const SEARCH = "[data-search-input]";
const PANEL = "[data-quilt-panel]";
const post = (no: string) => `[data-cell="post"][data-no="${no}"]`;

type Cell = {
	kind: string;
	no: string | null;
	state: string;
	delay: string;
	active: boolean;
	col: number;
	row: number;
};

/** Every cell's painted state, in DOM order. */
const cells = (page: Page): Promise<Cell[]> =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("[data-cell]")].map((c) => ({
			kind: c.dataset.cell!,
			no: c.dataset.no ?? null,
			state: c.dataset.state!,
			delay: c.style.getPropertyValue("--scatter-delay"),
			active: c.hasAttribute("data-active"),
			col: Number(c.style.getPropertyValue("--cell-col")),
			row: Number(c.style.getPropertyValue("--cell-row")),
		})),
	);

/** The panel's block, from the grid lines the script set. */
const block = (page: Page) =>
	page.locator(PANEL).evaluate((p: HTMLElement) => ({
		col: Number(p.style.getPropertyValue("--panel-col")),
		row: Number(p.style.getPropertyValue("--panel-row")),
	}));

/** Is (col, row) under the 3×2 block at `b`? */
const under = (b: { col: number; row: number }, col: number, row: number) =>
	col >= b.col && col < b.col + 3 && row >= b.row && row < b.row + 2;

const card = (page: Page, hook: string) => page.locator(`${PANEL} [data-card="${hook}"]`);

const rectsOverlap = (a: DOMRect, b: DOMRect) =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** A post's desktop cell. */
const cellOf = async (page: Page, no: string): Promise<[number, number]> => {
	const c = (await cells(page)).find((c) => c.no === no)!;
	return [c.col, c.row];
};

// The instrument.
const COUNT = "[data-search-count]";
/** The count cell's figure and label as one line: `2 of 5 posts`. */
const count = (page: Page) =>
	page.locator(COUNT).evaluate((el) =>
		[el.querySelector('[data-count="figure"]')?.textContent, el.querySelector('[data-count="label"]')?.textContent]
			.join(" ")
			.trim(),
	);
const expectCount = (page: Page, text: string) => expect.poll(() => count(page)).toBe(text);
const tab = (q: string) => `[data-tabs] [data-tab="${q}"]`;
const RULER = "[data-quilt-ruler]";
const mark = (no: string) => `${RULER} [data-mark][data-no="${no}"]`;
/** The playhead's --at, as the script writes it, in percent. */
const rulerAt = (page: Page) =>
	page.locator(RULER).evaluate((r: HTMLElement) => parseFloat(r.style.getPropertyValue("--at")));
/** Where the playhead should sit for a month: the centre of its column. */
const atOf = (page: Page, ym: string) =>
	page.locator(`${RULER} [data-month]`).evaluateAll((ms, ym) => {
		const k = ms.findIndex((m) => (m as HTMLElement).dataset.month === ym);
		return ((k + 0.5) / ms.length) * 100;
	}, ym);
const readout = (page: Page) => page.locator(`${RULER} [data-time-ruler="readout"]`);
const older = (page: Page) => page.getByRole("button", { name: "Previous post" });
const newer = (page: Page) => page.getByRole("button", { name: "Next post" });
const overflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: { width: 1440, height: 1000 } });

test.describe("quilt — rest", () => {
	test("a full grid, one named link per post, fillers hidden from assistive tech", async ({
		page,
	}) => {
		await page.goto("/txt");
		const all = await cells(page);
		const posts = all.filter((c) => c.kind === "post");
		expect(posts.map((c) => c.no)).toEqual(["005", "004", "003", "002", "001"]);
		expect(all.every((c) => c.state === "lit" && !c.active)).toBe(true);

		// The desktop grid is 5×3 and every cell of it is drawn.
		const visible = await page
			.locator("[data-cell]")
			.evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
		expect(visible).toBe(15);

		// Each tile is a link named by its title (the art is decorative).
		const index = await page.evaluate(
			() =>
				JSON.parse(document.querySelector("script[data-quilt-index]")!.textContent!)
					.posts as Array<{ title: string; href: string }>,
		);
		const quilt = page.locator("[data-quilt]");
		for (const p of index) {
			const link = quilt.getByRole("link", { name: p.title, exact: true });
			await expect(link).toHaveCount(1);
			await expect(link).toHaveAttribute("href", p.href);
		}

		const fillers = page.locator('[data-cell="filler"]');
		expect(await fillers.count()).toBeGreaterThan(0);
		for (const f of await fillers.all()) await expect(f).toHaveAttribute("aria-hidden", "true");
		await expect(page.locator('[data-cell="filler"] a')).toHaveCount(0);

		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		await expect(page.locator(SEARCH)).toHaveAttribute("aria-expanded", "false");
		await expectCount(page, "5 posts");
	});

	test("fillers are faint and greyscale at rest; the posts are at full strength", async ({
		page,
	}) => {
		await page.goto("/txt");
		const look = (sel: string) =>
			page.locator(sel).evaluateAll((els) =>
				els
					.filter((e) => e.checkVisibility())
					.map((e) => {
						const s = getComputedStyle(e);
						return { state: (e as HTMLElement).dataset.state, opacity: Number(s.opacity), filter: s.filter };
					}),
			);
		const faint = await page
			.locator("[data-quilt]")
			.evaluate((q) => Number(getComputedStyle(q).getPropertyValue("--quilt-faint")));
		// Settled: the cells ease in from the stylesheet's first paint.
		await expect
			.poll(async () =>
				(await look('[data-cell="filler"]')).every(
					(f) => Math.abs(f.opacity - faint) < 0.01 && f.filter === "grayscale(1)",
				),
			)
			.toBe(true);
		const fillers = await look('[data-cell="filler"]');
		expect(fillers.length).toBeGreaterThan(0);
		for (const f of fillers) {
			// Still `lit` in the state contract — it is the paint that holds it back.
			expect(f.state).toBe("lit");
			expect(f.opacity).toBeCloseTo(faint, 2);
			expect(f.filter).toBe("grayscale(1)");
		}
		for (const p of await look('[data-cell="post"]')) {
			expect(p.opacity).toBe(1);
			expect(p.filter).toBe("none");
		}
	});

	test("one instrument: four rows in a frame that spans the viewport inside one gutter", async ({
		page,
	}) => {
		await page.goto("/txt");
		const m = await page.evaluate(() => {
			const probe = document.createElement("div");
			probe.style.width = "var(--space-6)";
			document.body.append(probe);
			const gutter = probe.getBoundingClientRect().width;
			probe.remove();
			const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
			return {
				gutter,
				vw: document.documentElement.clientWidth,
				scroll: document.documentElement.scrollWidth,
				frame: rect("[data-instrument]"),
				rows: [...document.querySelectorAll("[data-instrument] > :is(.ds-panel, .ds-panels)")].map((r) =>
					r.getBoundingClientRect().toJSON(),
				),
				quilt: rect("[data-quilt]"),
				h1: rect(".blog__title"),
				tabs: rect("[data-tabs]"),
				brand: rect(".site-header__brand"),
				nav: rect(".site-header__nav"),
			};
		});
		expect(m.gutter).toBeGreaterThan(0);
		expect(m.scroll).toBe(m.vw);
		expect(m.frame.left).toBeCloseTo(m.gutter, 0);
		expect(m.frame.right).toBeCloseTo(m.vw - m.gutter, 0);
		// The site header's brand and nav sit on the frame's edges.
		expect(m.brand.left).toBeCloseTo(m.gutter, 0);
		expect(m.nav.right).toBeCloseTo(m.vw - m.gutter, 0);
		// Tabs, board, controls, timeline: each under the last, a hair apart.
		expect(m.rows).toHaveLength(4);
		for (let i = 1; i < m.rows.length; i++) {
			const gap = m.rows[i].top - m.rows[i - 1].bottom;
			expect(gap, `row ${i}`).toBeGreaterThan(0);
			expect(gap, `row ${i}`).toBeLessThanOrEqual(3);
		}
		// The h1 and the tabs are in the first row; the quilt is the second.
		expect(m.h1.top).toBeGreaterThanOrEqual(m.rows[0].top);
		expect(m.tabs.bottom).toBeLessThanOrEqual(m.rows[0].bottom + 1);
		expect(m.quilt.top).toBeGreaterThanOrEqual(m.rows[1].top);
		expect(m.quilt.bottom).toBeLessThanOrEqual(m.rows[1].bottom + 1);
		expect(m.quilt.left).toBeGreaterThan(m.frame.left);
		expect(m.quilt.right).toBeLessThan(m.frame.right);
	});
});

test.describe("quilt — hover and focus", () => {
	test("hovering a tile lights it, scatters the rest on a stagger, and shows its card", async ({
		page,
	}) => {
		await page.goto("/txt");
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");

		const all = await cells(page);
		const desk = all.find((c) => c.no === "003")!;
		expect(desk.state).toBe("lit");
		const others = all.filter((c) => c !== desk);
		expect(others.every((c) => c.state === "faint" || c.state === "gone")).toBe(true);
		// The stagger: every scattered cell waits 0–240ms, and not all the same.
		const delays = others.map((c) => parseInt(c.delay, 10));
		expect(delays.every((d) => d >= 0 && d <= 240)).toBe(true);
		expect(new Set(delays).size).toBeGreaterThan(1);
		const computedDelay = await page
			.locator('[data-cell][data-state="gone"]')
			.first()
			.evaluate((el) => getComputedStyle(el).transitionDelay);
		expect(computedDelay.split(",").some((d) => parseFloat(d) > 0)).toBe(true);

		// The block dodges the hovered tile.
		expect(under(await block(page), desk.col, desk.row)).toBe(false);

		await expect(card(page, "kicker")).toHaveText("NO. 003");
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		await expect(card(page, "category")).toHaveText("projects");
		await expect(card(page, "minutes")).toHaveText(/^\d+$/);
		await expect(card(page, "link")).toHaveAttribute("href", "/txt/mega-desk");
		await expect(card(page, "why")).toHaveText("");

		// Leaving restores every cell and hides the panel.
		await page.mouse.move(1, 1);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		expect((await cells(page)).every((c) => c.state === "lit")).toBe(true);
	});

	test("leaving a tile for anything but another tile or the panel returns to rest", async ({
		page,
	}) => {
		await page.goto("/txt");
		const center = async (sel: string) => {
			const b = (await page.locator(sel).boundingBox())!;
			return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
		};

		// Onto a filler, still inside the quilt (005's hover leaves a few of
		// them faint rather than gone, so there is one to land on).
		await page.locator(`${post("005")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		const faintFiller = '[data-cell="filler"][data-state="faint"] >> visible=true >> nth=0';
		await expect(page.locator(faintFiller)).toBeVisible();
		const f = await center(faintFiller);
		await page.mouse.move(f.x, f.y);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		expect((await cells(page)).every((c) => c.state === "lit")).toBe(true);

		// Onto empty page space below the board.
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		const q = (await page.locator("[data-quilt]").boundingBox())!;
		await page.mouse.move(q.x + q.width / 2, q.y + q.height + 40, { steps: 4 });
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		await expect(page.locator(SEARCH)).toHaveAttribute("aria-expanded", "false");
	});

	test("tile to tile across the gap never passes through rest", async ({ page }) => {
		await page.goto("/txt");
		// 005 sits beside 003 on the desktop grid and only faints under its hover.
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(post("005"))).toHaveAttribute("data-state", "faint");
		await page.evaluate(() => {
			const panel = document.querySelector<HTMLElement>("[data-quilt-panel]")!;
			const seen: string[] = [];
			(window as unknown as { __modes: string[] }).__modes = seen;
			new MutationObserver(() => seen.push(panel.dataset.mode!)).observe(panel, {
				attributes: true,
				attributeFilter: ["data-mode"],
			});
		});
		const b = (await page.locator(post("005")).boundingBox())!;
		await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
		await expect(card(page, "title")).toHaveText("Asserting on Agent Behavior");
		// Past the leave grace, and still no rest in between.
		await page.waitForTimeout(250);
		const modes = await page.evaluate(() => (window as unknown as { __modes: string[] }).__modes);
		expect(modes).not.toContain("hidden");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(post("005"))).toHaveAttribute("data-state", "lit");
	});

	test("the panel holds the hover: the card's READ link is reachable by pointer and by Tab", async ({
		page,
	}) => {
		await page.goto("/txt");
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		const read = card(page, "link");
		await read.hover();
		await page.waitForTimeout(250);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		// Off the panel onto the page: it lets go.
		await page.mouse.move(1, 1, { steps: 4 });
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");

		// Keyboard: from the last tile, Tab lands on READ and the card stays;
		// Tab on, out of the quilt (into the controls), and it lets go.
		await page.locator(`${post("001")} a`).focus();
		await expect(card(page, "title")).toHaveText("No Honey, We Have a Dashboard at Home");
		await page.keyboard.press("Tab");
		await expect(read).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(read).toHaveAttribute("href", "/txt/no-honey-we-have-a-dashboard-at-home");
		await page.keyboard.press("Tab");
		// The next stop is the search cell, so the card gives way to browse.
		await expect(page.locator(SEARCH)).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "browse");
	});

	test("the same tile scatters identically, hover after hover and load after load", async ({
		page,
	}) => {
		const scatterOf = async () => {
			await page.locator(`${post("004")} a`).hover();
			await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
			const snapshot = (await cells(page)).map((c) => `${c.state}:${c.delay}`);
			const b = await block(page);
			await page.mouse.move(1, 1);
			await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
			return { snapshot, b };
		};
		await page.goto("/txt");
		const first = await scatterOf();
		expect(await scatterOf()).toEqual(first);
		await page.reload();
		expect(await scatterOf()).toEqual(first);

		// …and a different tile scatters differently.
		await page.locator(`${post("002")} a`).hover();
		await expect(card(page, "title")).toHaveText("Your Car Knows You're Getting Sick");
		const other = (await cells(page)).map((c) => `${c.state}:${c.delay}`);
		expect(other).not.toEqual(first.snapshot);
	});

	test("keyboard focus on a tile is the same path as hover, with a visible ring", async ({
		page,
	}) => {
		await page.goto("/txt");
		// The board follows the tab row in the tab order: from the last tab,
		// Tab lands on the first tile.
		await page.locator(tab("personal")).focus();
		await page.keyboard.press("Tab");
		const link = page.locator(`${post("005")} a`);
		await expect(link).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "title")).toHaveText("Asserting on Agent Behavior");
		await expect(card(page, "kicker")).toHaveText("NO. 005");
		const ring = await link.evaluate((a) => {
			const s = getComputedStyle(a);
			return { matches: a.matches(":focus-visible"), style: s.outlineStyle, width: s.outlineWidth };
		});
		expect(ring.matches).toBe(true);
		expect(ring.style).not.toBe("none");
		expect(parseFloat(ring.width)).toBeGreaterThan(0);

		// Tab on: the next tile takes the card, even one that had scattered.
		await page.keyboard.press("Tab");
		await expect(page.locator(`${post("004")} a`)).toBeFocused();
		await expect(card(page, "kicker")).toHaveText("NO. 004");
		await expect(page.locator(post("004"))).toHaveAttribute("data-state", "lit");
	});
});

test.describe("quilt — search", () => {
	test("focused and empty: the browse face, posts lit and fillers stepped back", async ({
		page,
	}) => {
		await page.goto("/txt");
		await page.locator(SEARCH).focus();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "browse");
		await expect(page.locator(SEARCH)).toHaveAttribute("aria-expanded", "true");
		await expectCount(page, "5 posts");
		const b = await block(page);
		for (const c of await cells(page)) {
			if (under(b, c.col, c.row)) continue;
			expect(c.state, `${c.kind} ${c.no ?? ""} at ${c.col},${c.row}`).toBe(
				c.kind === "post" ? "lit" : "faint",
			);
		}
		await expect(page.locator(`${PANEL} [data-face="browse"]`)).toBeVisible();
		await expect(
			page.locator(`${PANEL} [data-face="browse"] a[href="/txt?q=programming"]`),
		).toBeVisible();
	});

	test("typing updates the count and keeps ?q= in step through replaceState", async ({
		page,
	}) => {
		await page.goto("/txt");
		const before = await page.evaluate(() => history.length);
		await page.locator(SEARCH).fill("home");
		await expectCount(page, "2 of 5 posts");
		await expect(page).toHaveURL(/\/txt\/?\?q=home$/);
		expect(await page.evaluate(() => history.length)).toBe(before);

		await page.locator(SEARCH).fill("");
		await expectCount(page, "5 posts");
		await expect(page).toHaveURL(/\/txt\/?$/);
	});

	test("?q= on load restores the search", async ({ page }) => {
		await page.goto("/txt?q=2025");
		await expect(page.locator(SEARCH)).toHaveValue("2025");
		await expectCount(page, "2 of 5 posts");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		for (const c of (await cells(page)).filter((c) => c.kind === "post")) {
			// The two 2025 posts: the Mega Desk (Apr) and Tahoe (Jun).
			if (c.no === "003" || c.no === "004") expect(c.state, `post ${c.no}`).toBe("lit");
			else expect(c.state, `post ${c.no}`).not.toBe("lit");
		}
	});

	test("results: marks, the why, the listbox, ↑↓ wrapping with the ring, Enter opens", async ({
		page,
	}) => {
		await page.goto("/txt");
		const input = page.locator(SEARCH);
		await input.fill("home");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expect(page.locator(`${PANEL} [data-results="label"]`)).toHaveText(
			"2 posts for “home”",
		);

		const listId = await input.getAttribute("aria-controls");
		const list = page.locator(`#${listId}`);
		await expect(list).toHaveAttribute("role", "listbox");
		const options = list.getByRole("option");
		await expect(options).toHaveCount(2);

		// A title hit is marked in the title and carries no why; a tag hit says why.
		await expect(options.nth(0).locator("mark")).toHaveText(["Home"]);
		await expect(options.nth(0).locator('[data-result="title"]')).toHaveText(
			"No Honey, We Have a Dashboard at Home",
		);
		await expect(options.nth(0).locator('[data-result="meta"]')).toHaveText(
			"may 2023 · programming",
		);
		await expect(options.nth(0).locator('[data-result="why"]')).toHaveText("");
		await expect(options.nth(1).locator("mark")).toHaveCount(0);
		await expect(options.nth(1).locator('[data-result="why"]')).toHaveText(
			"MATCHED TAG · HOME OFFICE",
		);
		// The separator before the why is drawn by CSS, not written.
		expect(await options.nth(1).innerText()).not.toMatch(/projects\s*·\s*·/);

		const optId = (k: number) => `quilt-panel-opt-${k}`;
		const expectActive = async (k: number, no: string) => {
			await expect(input).toHaveAttribute("aria-activedescendant", optId(k));
			await expect(page.locator(`#${optId(k)}`)).toHaveAttribute("aria-selected", "true");
			await expect(page.locator(`#${optId(1 - k)}`)).toHaveAttribute("aria-selected", "false");
			await expect(page.locator("[data-cell][data-active]")).toHaveCount(1);
			await expect(page.locator(post(no))).toHaveAttribute("data-active", "");
			// The ring is drawn: the active tile's frame outline is not transparent.
			await expect
				.poll(() =>
					page
						.locator(`${post(no)} .ds-art`)
						.evaluate((el) => getComputedStyle(el).outlineColor),
				)
				.not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
		};
		await expectActive(0, "001");
		await input.press("ArrowDown");
		await expectActive(1, "003");
		await input.press("ArrowDown"); // wraps to the top
		await expectActive(0, "001");
		await input.press("ArrowUp"); // wraps to the bottom
		await expectActive(1, "003");
		// Both matches stay lit while the ring moves.
		await expect(page.locator(post("001"))).toHaveAttribute("data-state", "lit");
		await expect(page.locator(post("003"))).toHaveAttribute("data-state", "lit");

		await input.press("Enter");
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
	});

	test("one match: the card, with the why when the title did not match", async ({ page }) => {
		await page.goto("/txt");
		const input = page.locator(SEARCH);
		await input.fill("standing");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expectCount(page, "1 of 5 posts");
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		await expect(card(page, "why")).toHaveText("MATCHED TAG · STANDING DESK");
		for (const c of (await cells(page)).filter((c) => c.kind === "post")) {
			if (c.no === "003") expect(c.state).toBe("lit");
			else expect(c.state, `post ${c.no}`).not.toBe("lit");
		}
		expect(under(await block(page), ...(await deskAt(page)))).toBe(false);

		// A title hit is the card without a why; Enter opens it too.
		await input.fill("desk");
		await expectCount(page, "1 of 5 posts");
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		await expect(card(page, "why")).toHaveText("");
		await input.press("Enter");
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
	});

	test("no match: the nothing face, and a suggestion pill searches in place", async ({ page }) => {
		await page.goto("/txt");
		const input = page.locator(SEARCH);
		await input.fill("recipes");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "none");
		await expectCount(page, "0 of 5 posts");
		await expect(input).not.toHaveAttribute("aria-activedescendant");
		await expect(page.locator(`${PANEL} [data-none="query"]`)).toHaveText("recipes");
		expect((await cells(page)).filter((c) => c.kind === "post").every((c) => c.state !== "lit")).toBe(
			true,
		);

		const pill = page.locator(`${PANEL} [data-none="suggestions"] a[href="/txt?q=programming"]`);
		await expect(pill).toBeVisible();
		await pill.click();
		await expect(input).toHaveValue("programming");
		await expect(input).toBeFocused();
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expectCount(page, "2 of 5 posts");
	});
});

/** The Mega Desk's desktop cell. */
const deskAt = (page: Page) => cellOf(page, "003");

test.describe("quilt — keys", () => {
	test("/ and ⌘K/Ctrl-K focus the search from the page", async ({ page }) => {
		await page.goto("/txt");
		const input = page.locator(SEARCH);
		await page.getByRole("heading", { level: 1, name: "Writing", exact: true }).click();
		await page.keyboard.press("/");
		await expect(input).toBeFocused();
		await expect(input).toHaveValue(""); // the slash is not typed
		await input.press("Escape");
		await expect(input).not.toBeFocused();

		await page.keyboard.press("ControlOrMeta+k");
		await expect(input).toBeFocused();
	});

	test("the shortcuts leave other fields alone, and / types in the search itself", async ({
		page,
	}) => {
		await page.goto("/txt");
		const input = page.locator(SEARCH);
		await page.evaluate(() => {
			const t = document.createElement("textarea");
			t.id = "elsewhere";
			document.body.append(t);
		});
		const other = page.locator("#elsewhere");
		await other.focus();
		await page.keyboard.press("/");
		await page.keyboard.press("ControlOrMeta+k");
		await expect(other).toBeFocused();
		await expect(other).toHaveValue("/");

		await input.focus();
		await page.keyboard.type("a/b");
		await expect(input).toHaveValue("a/b");
	});

	test("Esc clears the query, and a second Esc blurs", async ({ page }) => {
		await page.goto("/txt");
		const input = page.locator(SEARCH);
		await input.fill("home");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await input.press("Escape");
		await expect(input).toHaveValue("");
		await expect(input).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "browse");
		await expect(page).toHaveURL(/\/txt\/?$/);
		await input.press("Escape");
		await expect(input).not.toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		await expect(input).toHaveAttribute("aria-expanded", "false");
		expect((await cells(page)).every((c) => c.state === "lit")).toBe(true);
	});
});

test.describe("quilt — reduced motion", () => {
	test("the scatter is a cut: state still changes, with no duration and no stagger", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt");
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		const scattered = page.locator('[data-cell]:not([data-state="lit"])');
		expect(await scattered.count()).toBeGreaterThan(0);
		const timing = await scattered.evaluateAll((els) =>
			els.map((el) => {
				const s = getComputedStyle(el);
				return `${s.transitionDuration}|${s.transitionDelay}`;
			}),
		);
		for (const t of timing) {
			const [durations, delays] = t.split("|");
			expect(durations.split(",").every((d) => parseFloat(d) === 0), t).toBe(true);
			expect(delays.split(",").every((d) => parseFloat(d) === 0), t).toBe(true);
		}
		// The hovered tile's art holds its still frame.
		const motion = await page
			.locator(`${post("003")} [data-motion]`)
			.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDuration));
		for (const d of motion) expect(parseFloat(d)).toBe(0);
	});
});

test.describe("quilt — tablet (900px)", () => {
	test.use({ viewport: { width: 900, height: 1000 } });

	test("three columns, and the panel takes the full width clear of the hovered tile", async ({
		page,
	}) => {
		await page.goto("/txt");
		const tracks = await page
			.locator("[data-quilt]")
			.evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length);
		expect(tracks).toBe(3);
		const visible = await page
			.locator("[data-cell]")
			.evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
		expect(visible).toBe(9);

		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		const geo = await page.evaluate(() => {
			const q = document.querySelector("[data-quilt]")!.getBoundingClientRect();
			const p = document.querySelector("[data-quilt-panel]")!.getBoundingClientRect();
			const c = document.querySelector('[data-no="003"]')!.getBoundingClientRect();
			return { q: q.toJSON(), p: p.toJSON(), c: c.toJSON() };
		});
		expect(Math.abs(geo.p.left - geo.q.left)).toBeLessThanOrEqual(1);
		expect(Math.abs(geo.p.right - geo.q.right)).toBeLessThanOrEqual(1);
		expect(rectsOverlap(geo.p as DOMRect, geo.c as DOMRect)).toBe(false);
	});
});

test.describe("quilt — phone (390px)", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("a captioned two-column list, the panel in flow, and nothing vanishes", async ({
		page,
	}) => {
		await page.goto("/txt");
		const tracks = await page
			.locator("[data-quilt]")
			.evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length);
		expect(tracks).toBe(2);
		await expect(page.locator(`${post("003")} .ds-quilt-cell__caption`)).toBeVisible();
		await expect(page.locator(`${post("003")} .ds-quilt-cell__caption`)).toContainText(
			"The Mega Desk",
		);
		for (const f of await page.locator('[data-cell="filler"]').all()) await expect(f).toBeHidden();
		await expect(page.locator(PANEL)).toBeHidden();

		await page.locator(SEARCH).fill("home");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expect(page.locator(PANEL)).toBeVisible();
		expect(await page.locator(PANEL).evaluate((p) => getComputedStyle(p).position)).toBe("static");
		// In flow above the tiles.
		const panelBottom = (await page.locator(PANEL).boundingBox())!;
		const firstTile = (await page.locator('[data-cell="post"]').first().boundingBox())!;
		expect(panelBottom.y + panelBottom.height).toBeLessThanOrEqual(firstTile.y + 1);

		const states = (await cells(page)).map((c) => c.state);
		expect(states).not.toContain("gone");
		expect(states).toContain("faint");
		// Both matches stay lit. The panel covers nothing on a phone, so the
		// tablet block must not fade a match that sits under it (it did: the desk).
		await expect(page.locator(post("001"))).toHaveAttribute("data-state", "lit");
		await expect(page.locator(post("003"))).toHaveAttribute("data-state", "lit");

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});

test.describe("quilt — scripting off", () => {
	test("the quilt is links, and the form submits ?q=", async ({ browser }) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 1440, height: 1000 },
		});
		const page = await context.newPage();
		await page.goto("/txt");
		const hrefs = await page
			.locator('[data-cell="post"] a')
			.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
		expect(hrefs).toHaveLength(5);
		expect(new Set(hrefs).size).toBe(5);
		expect(hrefs.every((h) => /^\/txt\/[^/]+$/.test(h ?? ""))).toBe(true);

		await page.locator(SEARCH).fill("home");
		await page.locator(SEARCH).press("Enter");
		await expect(page).toHaveURL(/\/txt\/?\?q=home$/);

		// The tabs and the timeline's ticks are plain links too.
		await page.locator(tab("projects")).click();
		await expect(page).toHaveURL(/\/txt\/?\?q=projects$/);
		await page.locator(mark("003")).click();
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
		await context.close();
	});
});

test.describe("instrument — tabs", () => {
	test("real links to ?q=; ALL current at rest, the category's tab for its query, none otherwise", async ({
		page,
	}) => {
		await page.goto("/txt");
		const tabs = page.locator("[data-tabs] [data-tab]");
		expect(
			await tabs.evaluateAll((as) => as.map((a) => [(a as HTMLElement).dataset.tab, a.getAttribute("href")])),
		).toEqual([
			["", "/txt"],
			["programming", "/txt?q=programming"],
			["projects", "/txt?q=projects"],
			["thoughts", "/txt?q=thoughts"],
			["personal", "/txt?q=personal"],
		]);
		await expect(page.locator(tab(""))).toHaveAttribute("aria-current", "page");
		await expect(page.locator("[data-tabs] [aria-current]")).toHaveCount(1);

		// A tab is a query, set in place: no navigation, ?q= through replaceState.
		const before = await page.evaluate(() => history.length);
		await page.locator(tab("programming")).click();
		await expect(page.locator(SEARCH)).toHaveValue("programming");
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		expect(await page.evaluate(() => history.length)).toBe(before);
		await expect(page.locator(tab("programming"))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(tab(""))).not.toHaveAttribute("aria-current");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expectCount(page, "2 of 5 posts");
		for (const c of (await cells(page)).filter((c) => c.kind === "post")) {
			if (c.no === "005" || c.no === "001") expect(c.state, `post ${c.no}`).toBe("lit");
			else expect(c.state, `post ${c.no}`).not.toBe("lit");
		}

		// Any other query: no tab is current.
		await page.locator(SEARCH).fill("home");
		await expect(page.locator("[data-tabs] [aria-current]")).toHaveCount(0);

		// ALL clears the query.
		await page.locator(tab("")).click();
		await expect(page.locator(SEARCH)).toHaveValue("");
		await expect(page).toHaveURL(/\/txt\/?$/);
		await expect(page.locator(tab(""))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		await expectCount(page, "5 posts");
	});

	test("?q=<category> on load makes that tab current", async ({ page }) => {
		await page.goto("/txt?q=projects");
		await expect(page.locator(tab("projects"))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(tab(""))).not.toHaveAttribute("aria-current");
		await expectCount(page, "1 of 5 posts");
	});
});

test.describe("instrument — the stepper", () => {
	const expectStep = async (page: Page, no: string, title: string, line: RegExp) => {
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "kicker")).toHaveText(`NO. ${no}`);
		await expect(card(page, "title")).toHaveText(title);
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(1);
		await expect(page.locator(post(no))).toHaveAttribute("data-active", "");
		await expect(page.locator(post(no))).toHaveAttribute("data-state", "lit");
		await expect(readout(page)).toHaveText(line);
		expect(under(await block(page), ...(await cellOf(page, no)))).toBe(false);
	};

	test("− and + walk the posts newest first — from rest − takes the newest, + the oldest — and wrap", async ({
		page,
	}) => {
		await page.goto("/txt");
		await older(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · no\. 005/);
		await older(page).click();
		await expectStep(page, "004", "Tahoe Mountain Hair", /jun 2025 · no\. 004/);
		await newer(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · no\. 005/);
		await newer(page).click(); // past the newest: round to the oldest
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · no\. 001/);
		await older(page).click(); // past the oldest: round to the newest
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · no\. 005/);
		// The playhead followed the step to May 2023 and back.
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
	});

	test("a step holds while the pointer is elsewhere; Escape lets it go", async ({ page }) => {
		await page.goto("/txt");
		await newer(page).click();
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · no\. 001/);
		await page.mouse.move(1, 1, { steps: 4 });
		await page.waitForTimeout(250);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2023-05"), 1);

		await page.keyboard.press("Escape");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		expect((await cells(page)).every((c) => c.state === "lit" && !c.active)).toBe(true);
		await expect(readout(page)).toHaveText(/latest · feb 2026/);
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
	});

	test("a hover previews another post over the step and leaving returns to it; typing clears it", async ({
		page,
	}) => {
		await page.goto("/txt");
		await older(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · no\. 005/);
		await page.locator(`${post("003")} a`).hover();
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		await expect(readout(page)).toHaveText(/apr 2025 · no\. 003/);
		// A preview, not a step: no ring on the hovered tile.
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(0);
		await page.mouse.move(1, 1, { steps: 4 });
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · no\. 005/);
		await page.locator(SEARCH).fill("home");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(1);
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
	});

	test("under a filter the stepper walks the matches only and shows the card over the list", async ({
		page,
	}) => {
		await page.goto("/txt?q=programming");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		// The first result (005) is already the focus, so − is the older match:
		// 001 — 004, 003 and 002 are not programming.
		await older(page).click();
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · no\. 001/);
		await expect(card(page, "why")).toHaveText("MATCHED CATEGORY · PROGRAMMING");
		await newer(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · no\. 005/);
		await newer(page).click(); // round to the oldest match
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · no\. 001/);
		// Both matches stay lit; the rest are scattered.
		await expect(page.locator(post("005"))).toHaveAttribute("data-state", "lit");
		await expect(page.locator(post("003"))).not.toHaveAttribute("data-state", "lit");
		// Escape returns to the list, the query intact; Enter in the bar would open it.
		await page.keyboard.press("Escape");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expect(page.locator(SEARCH)).toHaveValue("programming");
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
	});

	test("nothing matches: the buttons are disabled", async ({ page }) => {
		await page.goto("/txt?q=recipes");
		await expect(newer(page)).toBeDisabled();
		await expect(older(page)).toBeDisabled();
		await page.locator(SEARCH).fill("");
		await expect(newer(page)).toBeEnabled();
	});
});

test.describe("instrument — the timeline", () => {
	test("a tick per month over whole years, a named link per post in its month, the playhead on the latest", async ({
		page,
	}) => {
		await page.goto("/txt");
		const months = page.locator(`${RULER} [data-month]`);
		const keys = await months.evaluateAll((ms) => ms.map((m) => (m as HTMLElement).dataset.month));
		expect(keys[0]).toBe("2023-01");
		expect(keys[keys.length - 1]).toMatch(/^\d{4}-12$/);
		expect(Number(keys[keys.length - 1]!.slice(0, 4))).toBeGreaterThanOrEqual(2026);
		expect(keys.length % 12).toBe(0);
		// Consecutive months, no gaps.
		for (let k = 1; k < keys.length; k++) {
			const [y, m] = keys[k - 1]!.split("-").map(Number);
			const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
			expect(keys[k]).toBe(next);
		}
		const marks = page.locator(`${RULER} [data-mark]`);
		expect(
			await marks.evaluateAll((as) =>
				as.map((a) => [
					a.getAttribute("href"),
					a.getAttribute("aria-label"),
					(a.parentElement as HTMLElement).dataset.month,
				]),
			),
		).toEqual([
			// In time order, left to right — the ruler's order, not the index's.
			["/txt/no-honey-we-have-a-dashboard-at-home", "No Honey, We Have a Dashboard at Home, May 2023", "2023-05"],
			["/txt/why-i-joined-fisker", "Your Car Knows You're Getting Sick, Jul 2024", "2024-07"],
			["/txt/mega-desk", "The Mega Desk, Apr 2025", "2025-04"],
			["/txt/tahoe-mountain-hair", "Tahoe Mountain Hair, Jun 2025", "2025-06"],
			["/txt/asserting-on-agent-behavior", "Asserting on Agent Behavior, Feb 2026", "2026-02"],
		]);
		for (const a of await marks.all()) await expect(a).not.toHaveAttribute("data-dim");
		// A mark is taller than a plain tick, and the year labels sit under the Januaries.
		const bar = (sel: string) =>
			page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el, "::after").height));
		const tick = (sel: string) =>
			page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el, "::before").height));
		expect(await bar(`${RULER} [data-mark]`)).toBeGreaterThan(await tick(`${RULER} [data-month][data-year]`));
		expect(await tick(`${RULER} [data-month][data-year]`)).toBeGreaterThan(
			await tick(`${RULER} [data-month]:not([data-year])`),
		);
		expect((await page.locator(`${RULER} .ds-time-ruler__year`).allTextContents()).slice(0, 4)).toEqual([
			"2023",
			"2024",
			"2025",
			"2026",
		]);
		// At rest: the playhead on the latest post's month, and the readout says so.
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
		await expect(readout(page)).toHaveText(/latest · feb 2026/);
	});

	test("the playhead glides to the post in focus: a hover, the active result, a step", async ({ page }) => {
		await page.goto("/txt");
		await page.locator(`${post("003")} a`).hover();
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2025-04"), 1);
		await expect(readout(page)).toHaveText(/apr 2025 · no\. 003/);
		await page.mouse.move(1, 1, { steps: 4 });
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
		await expect(readout(page)).toHaveText(/latest · feb 2026/);
		// It moves, not cuts: the position is transitioned.
		const transition = await page
			.locator(`${RULER} .ds-time-ruler__playhead`)
			.evaluate((el) => getComputedStyle(el).transitionProperty);
		expect(transition).toMatch(/inset-inline-start|left/);

		await page.locator(SEARCH).fill("home");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2023-05"), 1);
		await page.locator(SEARCH).press("ArrowDown");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2025-04"), 1);
		await expect(readout(page)).toHaveText(/apr 2025 · no\. 003/);
	});

	test("clicking a lit tick pins its post; under a filter the others dim and are not controls", async ({
		page,
	}) => {
		await page.goto("/txt");
		await page.locator(mark("002")).click();
		await expect(page).toHaveURL(/\/txt\/?$/);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "title")).toHaveText("Your Car Knows You're Getting Sick");
		await expect(page.locator(post("002"))).toHaveAttribute("data-active", "");
		await expect(readout(page)).toHaveText(/jul 2024 · no\. 002/);
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2024-07"), 1);

		await page.locator(SEARCH).fill("programming");
		const dim = page.locator(`${RULER} [data-mark][data-dim]`);
		expect(await dim.evaluateAll((as) => as.map((a) => (a as HTMLElement).dataset.no))).toEqual([
			"002",
			"003",
			"004",
		]);
		for (const a of await dim.all()) {
			await expect(a).toHaveAttribute("aria-disabled", "true");
			expect(await a.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
		}
		await expect(page.locator(mark("005"))).not.toHaveAttribute("data-dim");
		// A lit tick pins its post over the list.
		await page.locator(mark("001")).click();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "kicker")).toHaveText("NO. 001");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		// Clearing the filter lights every tick again.
		await page.locator(SEARCH).fill("");
		await expect(dim).toHaveCount(0);
	});
});

test.describe("instrument — the card", () => {
	test("the infra card: number, category, three stats, title, excerpt, the gauge, READ", async ({
		page,
	}) => {
		await page.goto("/txt");
		const index = await page.evaluate(
			() =>
				JSON.parse(document.querySelector("script[data-quilt-index]")!.textContent!).posts as Array<{
					no: number;
					minutes: number;
					words: number;
				}>,
		);
		const max = Math.max(...index.map((p) => p.minutes));
		const desk = index.find((p) => p.no === 3)!;

		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "kicker")).toHaveText("NO. 003");
		await expect(card(page, "category")).toHaveText("projects");
		await expect(card(page, "minutes")).toHaveText(String(desk.minutes));
		await expect(card(page, "words")).toHaveText(String(desk.words));
		await expect(card(page, "month")).toHaveText("apr");
		await expect(card(page, "year")).toHaveText("2025");
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		await expect(card(page, "blurb")).toContainText("standing desk");
		await expect(card(page, "link")).toHaveAttribute("href", "/txt/mega-desk");
		await expect(card(page, "link")).toHaveText(/read/i);

		// The gauge: minutes over the longest post's, named for a reader, and
		// the arc drawn from --ring-value (it glides, so poll).
		const pct = Math.round((desk.minutes / max) * 100);
		const gauge = card(page, "gauge");
		await expect(gauge).toHaveAttribute("aria-label", `${desk.minutes} of ${max} minutes`);
		expect(await gauge.evaluate((g: HTMLElement) => g.style.getPropertyValue("--ring-value"))).toBe(String(pct));
		await expect(card(page, "gauge-caption")).toHaveText(`${desk.minutes} of ${max} min`);
		await expect
			.poll(() => gauge.locator(".ds-ring__arc").evaluate((c) => parseFloat(getComputedStyle(c).strokeDasharray)))
			.toBeCloseTo(pct, 0);

		// On a hairlined surface with a radius, filling the block.
		const face = page.locator(`${PANEL} [data-face="card"]`);
		const s = await face.evaluate((f) => {
			const cs = getComputedStyle(f);
			return { border: cs.borderTopWidth, radius: parseFloat(cs.borderTopLeftRadius) };
		});
		expect(s.border).toBe("1px");
		expect(s.radius).toBeGreaterThan(0);
		const [faceBox, panelBox] = [await face.boundingBox(), await page.locator(PANEL).boundingBox()];
		expect(Math.abs(faceBox!.width - panelBox!.width)).toBeLessThanOrEqual(1);
		expect(Math.abs(faceBox!.height - panelBox!.height)).toBeLessThanOrEqual(1);

		// Another post refills every field.
		await page.locator(`${post("005")} a`).hover();
		await expect(card(page, "kicker")).toHaveText("NO. 005");
		await expect(card(page, "category")).toHaveText("programming");
		await expect(card(page, "month")).toHaveText("feb");
		await expect(card(page, "year")).toHaveText("2026");
	});

	test("the block grows with the board: at 1920 the card takes the big tier", async ({ page }) => {
		const measure = async (width: number, height: number) => {
			await page.setViewportSize({ width, height });
			await page.goto("/txt");
			await page.locator(`${post("003")} a`).hover();
			await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
			return page.locator(PANEL).evaluate((p) => {
				const r = p.getBoundingClientRect();
				const t = p.querySelector('[data-card="title"]')!;
				return { w: r.width, h: r.height, title: parseFloat(getComputedStyle(t).fontSize) };
			});
		};
		const a = await measure(1440, 1000);
		const b = await measure(1920, 1100);
		expect(a.w).toBeGreaterThan(780);
		expect(a.h).toBeGreaterThan(280);
		expect(b.w).toBeGreaterThan(a.w);
		expect(b.h).toBeGreaterThan(a.h);
		expect(b.title).toBeGreaterThan(a.title);
	});
});

test.describe("instrument — the count", () => {
	test("a figure over a label, live: 5 POSTS at rest, N OF 5 POSTS while filtering", async ({ page }) => {
		await page.goto("/txt");
		await expect(page.locator(COUNT)).toHaveAttribute("aria-live", "polite");
		await expect(page.locator(COUNT)).toHaveCount(1);
		await expect(page.locator(`${COUNT} [data-count="figure"]`)).toHaveText("5");
		await expect(page.locator(`${COUNT} [data-count="label"]`)).toHaveText("posts");
		await page.locator(tab("personal")).click();
		await expect(page.locator(`${COUNT} [data-count="figure"]`)).toHaveText("1");
		await expect(page.locator(`${COUNT} [data-count="label"]`)).toHaveText("of 5 posts");
		await page.locator(SEARCH).fill("zzz");
		await expectCount(page, "0 of 5 posts");
		await page.locator(SEARCH).fill("");
		await expectCount(page, "5 posts");
	});
});

test.describe("instrument — layouts", () => {
	test("tablet (900): the same rows, three columns, the stepper beside the count", async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 1100 });
		await page.goto("/txt");
		expect(await page.locator("[data-instrument] > :is(.ds-panel, .ds-panels)").count()).toBe(4);
		expect(
			await page.locator("[data-quilt]").evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length),
		).toBe(3);
		const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
		const c = await box(".blog__cell--count");
		const s = await box(".blog__cell--search");
		const steps = await page.locator(".blog__cell--step").all();
		for (const st of steps) expect(Math.abs((await st.boundingBox())!.y - c.y)).toBeLessThanOrEqual(1);
		expect(Math.abs(s.y - c.y)).toBeLessThanOrEqual(1);
		expect(await overflow(page)).toBeLessThanOrEqual(0);
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "link")).toBeVisible();
		expect(await overflow(page)).toBeLessThanOrEqual(0);
	});

	test("phone (390): the tabs scroll in their row, count and stepper on one line, the search under them, the timeline compact", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 1000 });
		await page.goto("/txt");
		const tabsNav = page.locator("[data-tabs]");
		const scroll = await tabsNav.evaluate((n) => ({
			overflowX: getComputedStyle(n).overflowX,
			scrollable: n.scrollWidth > n.clientWidth,
		}));
		expect(scroll.overflowX).toBe("auto");
		expect(scroll.scrollable).toBe(true);
		const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
		const c = await box(".blog__cell--count");
		const s = await box(".blog__cell--search");
		const controls = await box("[data-controls]");
		for (const st of await page.locator(".blog__cell--step").all()) {
			expect(Math.abs((await st.boundingBox())!.y - c.y)).toBeLessThanOrEqual(1);
		}
		expect(s.y).toBeGreaterThanOrEqual(c.y + c.height - 1);
		expect(Math.abs(s.width - controls.width)).toBeLessThanOrEqual(1);
		// The timeline is drawn shorter than on a desktop, with its years.
		const strip = await box(`${RULER} .ds-time-ruler__strip`);
		expect(strip.height).toBeLessThan(48);
		await expect(page.locator(`${RULER} .ds-time-ruler__year`).first()).toBeVisible();
		expect(await overflow(page)).toBeLessThanOrEqual(0);

		// A step shows the card in flow above the list, the stepped tile ringed.
		await newer(page).click();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(PANEL)).toBeVisible();
		await expect(card(page, "kicker")).toHaveText("NO. 001");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		expect(await overflow(page)).toBeLessThanOrEqual(0);
	});

	test("no horizontal overflow at any width, at rest and with the card open", async ({ page }) => {
		for (const width of [1920, 1440, 1280, 1024, 900, 768, 640, 480, 390, 360]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto("/txt");
			expect(await overflow(page), `${width} at rest`).toBeLessThanOrEqual(0);
			await older(page).click();
			await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
			expect(await overflow(page), `${width} stepped`).toBeLessThanOrEqual(0);
		}
	});
});

test.describe("quilt — accessibility", () => {
	test("search landmark, combobox and listbox semantics, a live count", async ({ page }) => {
		await page.goto("/txt");
		await expect(page.getByRole("search")).toHaveCount(1);
		const combo = page.getByRole("combobox", { name: /search/i });
		await expect(combo).toHaveCount(1);
		await expect(combo).toHaveAttribute("aria-autocomplete", "list");
		await expect(combo).toHaveAttribute("aria-expanded", "false");
		await expect(page.locator("[data-search-count]")).toHaveAttribute("aria-live", "polite");
		await expect(page.locator("[data-quilt]")).toHaveAttribute("role", "group");
		await expect(page.locator("[data-quilt]")).toHaveAttribute("aria-label", "Posts");

		await combo.fill("home");
		await expect(combo).toHaveAttribute("aria-expanded", "true");
		const controls = await combo.getAttribute("aria-controls");
		const listbox = page.getByRole("listbox");
		await expect(listbox).toHaveAttribute("id", controls!);
		await expect(listbox.getByRole("option")).toHaveCount(2);
		const active = await combo.getAttribute("aria-activedescendant");
		await expect(page.locator(`#${active}`)).toHaveAttribute("role", "option");
	});
});
