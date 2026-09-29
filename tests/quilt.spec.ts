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
 *               drawn faint; the ruled grid with no text on a tile; the
 *               instrument in the site container, under the site header,
 *               its edges on the header's brand and nav
 *   hover/focus the tile lit, the rest faint or gone on a stagger, the card
 *               in a block that dodges it; leaving the tile restores (the
 *               panel holds it, tile to tile never passes rest); deterministic
 *   typing      the live count, ?q= via replaceState, ?q= on load
 *   results     <mark>, the why, the listbox, ↑↓ wrap, the ring, Enter
 *   single/none the card; the nothing face and its pills
 *   keys        / and ⌘K (not from another field), Esc clears then blurs
 *   viewports   the 3-column tablet grid; the phone list, panel in flow
 *   no JS       links, and the form submits ?q=
 *
 * And the INSTRUMENT around the board (the "instrument —" describes):
 *
 *   chips       search shortcuts in the bar: real links to ?q=<category>,
 *               set in place; aria-current (the filled chip) on ALL at
 *               rest, on the category's chip for its query, on none for any
 *               other query; ?q= on load
 *   stepper     − older / + newer through the matching posts, newest
 *               first, wrapping; the card, the ring and the playhead follow;
 *               a step holds while the pointer is elsewhere; Escape clears
 *   timeline    one tick per month, a named link per post, the playhead on
 *               the post in focus (at rest the latest), dim ticks under a
 *               filter, a click pins
 *   card        the ruled card's fields and its stat strip; one size at 1440 and 1920
 *   count       the live region a reader hears; no number on screen
 *   layouts     the rows, nothing filled, the header as the homepage's; the
 *               bar at tablet and phone; no horizontal overflow
 *
 * TEXT. The script writes the why in capitals and everything else in
 * lowercase (CSS draws it in capitals), so assertions read the DOM's
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
/** The live count a reader hears: `2 of 5 posts`. */
const count = (page: Page) => page.locator(COUNT).evaluate((el) => el.textContent!.trim());
const expectCount = (page: Page, text: string) => expect.poll(() => count(page)).toBe(text);
const BAR = "[data-search-bar]";
const chip = (q: string) => `[data-search-chips] [data-chip="${q}"]`;
/** The active outline: the cell's ::after box-shadow, or null when it is transparent. */
const ring = (page: Page, no: string) =>
	page.locator(post(no)).evaluate((el) => {
		const shadow = getComputedStyle(el, "::after").boxShadow;
		return /rgba\(0, 0, 0, 0\)|transparent|^none$/.test(shadow) ? null : shadow;
	});
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

	test("fillers' art is faint and greyscale at rest; the posts are at full strength", async ({
		page,
	}) => {
		await page.goto("/txt");
		// The state is painted on the cell's contents (its art), not the cell.
		const look = (sel: string) =>
			page.locator(sel).evaluateAll((els) =>
				els
					.filter((e) => e.checkVisibility())
					.map((e) => {
						const s = getComputedStyle(e.firstElementChild!);
						const cell = getComputedStyle(e);
						return {
							state: (e as HTMLElement).dataset.state,
							opacity: Number(s.opacity),
							filter: s.filter,
							cell: { opacity: Number(cell.opacity), filter: cell.filter },
						};
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
			// The cell itself — the ruling — is never faded.
			expect(f.cell).toEqual({ opacity: 1, filter: "none" });
		}
		for (const p of await look('[data-cell="post"]')) {
			expect(p.opacity).toBe(1);
			expect(p.filter).toBe("none");
		}
	});

	test("a ruled grid: hairlines between the cells and round them, the art inset, no text on a tile", async ({
		page,
	}) => {
		await page.goto("/txt");
		const m = await page.evaluate(() => {
			const grid = document.querySelector<HTMLElement>("[data-quilt]")!;
			const gs = getComputedStyle(grid);
			const cells = [...document.querySelectorAll<HTMLElement>("[data-cell]")].filter((c) => c.checkVisibility());
			const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2"));
			return {
				gap: gs.gap,
				left: gs.borderLeftWidth,
				top: gs.borderTopWidth,
				cells: cells.map((c) => {
					const cs = getComputedStyle(c);
					const art = c.querySelector(".ds-art")!.getBoundingClientRect();
					const box = c.getBoundingClientRect();
					return {
						right: cs.borderRightWidth,
						bottom: cs.borderBottomWidth,
						radius: cs.borderTopLeftRadius,
						inset: [art.left - box.left, art.top - box.top, box.right - art.right - 1, box.bottom - art.bottom - 1],
						text: c.innerText.trim(),
						caption: c.querySelector(".ds-quilt-cell__caption")?.checkVisibility() ?? false,
					};
				}),
				step,
			};
		});
		expect(m.gap).toBe("0px");
		expect(m.left).toBe("1px");
		expect(m.top).toBe("1px");
		expect(m.cells).toHaveLength(15);
		for (const c of m.cells) {
			expect(c.right).toBe("1px");
			expect(c.bottom).toBe("1px");
			expect(c.radius).toBe("0px");
			// The art a step in from the ruling on every side.
			for (const d of c.inset) expect(d).toBeCloseTo(m.step, 0);
			// Art only: nothing is written on a tile.
			expect(c.text).toBe("");
			expect(c.caption).toBe(false);
		}
	});

	test("the ruling is constant: a filler's and a gone cell's lines are a lit post's", async ({ page }) => {
		await page.goto("/txt");
		const ruling = (sel: string) =>
			page.locator(sel).first().evaluate((el) => {
				const cs = getComputedStyle(el);
				return {
					right: cs.borderRightColor,
					bottom: cs.borderBottomColor,
					width: cs.borderRightWidth,
					opacity: cs.opacity,
					filter: cs.filter,
				};
			});
		const lit = await ruling('[data-cell="post"][data-state="lit"]');
		expect(lit.width).toBe("1px");
		expect(lit.opacity).toBe("1");
		// At rest a filler's art is faint, its lines are not.
		expect(await ruling('[data-cell="filler"]:not([hidden])')).toEqual(lit);
		// Scattered: a gone cell's art vanishes; its lines stay, and settle
		// at the same strength (nothing on the cell transitions).
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		const gone = '[data-cell][data-state="gone"]';
		expect(await page.locator(gone).count()).toBeGreaterThan(0);
		await expect
			.poll(() => page.locator(gone).first().evaluate((el) => getComputedStyle(el.firstElementChild!).opacity))
			.toBe("0");
		expect(await ruling(gone)).toEqual(lit);
		expect(await ruling('[data-cell][data-state="faint"]')).toEqual(lit);
	});

	test("one instrument: three rows on the page in the site container, under the site header, on its brand and nav", async ({
		page,
	}) => {
		await page.goto("/txt");
		const m = await page.evaluate(() => {
			const rect = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON();
			const probe = document.createElement("div");
			probe.style.cssText = "width: var(--container-max); padding-inline: var(--container-pad); box-sizing: border-box";
			document.body.append(probe);
			const cs = getComputedStyle(probe);
			const container = { max: parseFloat(cs.width), pad: parseFloat(cs.paddingLeft) };
			probe.remove();
			const frame = document.querySelector("[data-instrument]")!;
			return {
				container,
				vw: document.documentElement.clientWidth,
				space8: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-8")),
				scroll: document.documentElement.scrollWidth,
				frame: frame.getBoundingClientRect().toJSON(),
				rows: [...document.querySelectorAll("[data-instrument] > .blog__row")].map((r) =>
					r.getBoundingClientRect().toJSON(),
				),
				quilt: rect("[data-quilt]"),
				bar: rect("[data-search-bar]"),
				siteHeaders: document.querySelectorAll(".site-header").length,
				header: rect(".site-header"),
				brand: rect(".site-header__brand"),
				nav: rect(".site-header__nav"),
			};
		});
		expect(m.scroll).toBe(m.vw);
		// The site's container: --container-max, centred, inside --container-pad.
		const inset = Math.max(m.container.pad, (m.vw - m.container.max) / 2 + m.container.pad);
		expect(m.frame.left).toBeCloseTo(inset, 0);
		expect(m.frame.right).toBeCloseTo(m.vw - inset, 0);
		// The main nav, once, above the rows; its brand and nav on the rows' edges.
		expect(m.siteHeaders).toBe(1);
		expect(m.frame.top).toBeGreaterThanOrEqual(m.header.bottom - 1);
		expect(m.brand.left).toBeCloseTo(m.frame.left, 0);
		expect(m.nav.right).toBeCloseTo(m.frame.right, 0);
		// The bar, the board, the timeline: each the container's width, under
		// the last, set apart by space rather than a hairline gutter.
		expect(m.rows).toHaveLength(3);
		for (const r of m.rows) {
			expect(r.left).toBeCloseTo(m.frame.left, 0);
			expect(r.right).toBeCloseTo(m.frame.right, 0);
		}
		for (let i = 1; i < m.rows.length; i++) {
			expect(m.rows[i].top - m.rows[i - 1].bottom, `row ${i}`).toBeGreaterThanOrEqual(16);
		}
		// No dead space: the rows stack a step apart — the quilt within
		// --space-8 of the bar, the timeline within --space-8 of the quilt —
		// rather than filling the viewport and centring the board.
		for (let i = 1; i < m.rows.length; i++) {
			expect(m.rows[i].top - m.rows[i - 1].bottom, `row ${i}`).toBeLessThanOrEqual(m.space8 + 1);
		}
		expect(m.quilt.top - m.bar.bottom).toBeLessThanOrEqual(m.space8 + 1);
		// The bar is the first row, spanning the container; the quilt is the
		// second, spanning it edge to edge.
		expect(m.bar.left).toBeCloseTo(m.frame.left, 0);
		expect(m.bar.right).toBeCloseTo(m.frame.right, 0);
		expect(m.bar.bottom).toBeLessThanOrEqual(m.rows[0].bottom + 1);
		expect(m.quilt.top).toBeGreaterThanOrEqual(m.rows[1].top);
		expect(m.quilt.bottom).toBeLessThanOrEqual(m.rows[1].bottom + 1);
		expect(m.quilt.left).toBeCloseTo(m.frame.left, 0);
		expect(m.quilt.right).toBeCloseTo(m.frame.right, 0);
	});

	for (const theme of ["dark", "light"] as const) {
		test(`nothing is filled but the current chip: the rows, the bar and the grid are the page (${theme})`, async ({ page }) => {
			await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
			await page.goto("/txt");
			const m = await page.evaluate(() => {
				const bg = (el: Element) => getComputedStyle(el).backgroundColor;
				const clear = (c: string) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
				const inst = document.querySelector("[data-instrument]")!;
				const bar = document.querySelector<HTMLElement>("[data-search-bar]")!;
				const bs = getComputedStyle(bar);
				const bare = [
					inst,
					document.querySelector("main")!,
					bar,
					...document.querySelectorAll("[data-instrument] > .blog__row, [data-quilt], [data-cell]"),
				].map((el) => ({ cls: el.className, clear: clear(bg(el)) }));
				const chips = [...document.querySelectorAll<HTMLElement>("[data-search-chips] [data-chip]")].map((c) => ({
					q: c.dataset.chip,
					current: c.hasAttribute("aria-current"),
					filled: !clear(bg(c)),
					radius: getComputedStyle(c).borderTopLeftRadius,
					border: getComputedStyle(c).borderTopWidth,
				}));
				return {
					bare,
					chips,
					bar: { border: bs.borderTopWidth, radius: bs.borderTopLeftRadius, style: bs.borderTopStyle },
				};
			});
			for (const b of m.bare) expect(b.clear, b.cls).toBe(true);
			// The bar: one hairline box, square.
			expect(m.bar.border).toBe("1px");
			expect(m.bar.style).toBe("solid");
			expect(m.bar.radius).toBe("0px");
			// The chips: square hairline boxes; ALL alone is filled, being current.
			expect(m.chips.map((c) => c.q)).toEqual(["", "programming", "projects", "thoughts", "personal"]);
			for (const c of m.chips) {
				expect(c.radius).toBe("0px");
				expect(c.border).toBe("1px");
				expect(c.filled, `chip ${c.q}`).toBe(c.current);
			}
			expect(m.chips.filter((c) => c.current).map((c) => c.q)).toEqual([""]);
		});
	}

	test("the header is the homepage's: the brand and nav boxes on /txt equal those on / at 1440 and 1920", async ({
		page,
	}) => {
		const boxes = async (path: string) => {
			await page.goto(path);
			return page.evaluate(() =>
				[".site-header__brand", ".site-header__nav"].map((s) => document.querySelector(s)!.getBoundingClientRect().toJSON()),
			);
		};
		for (const [width, height] of [
			[1440, 900],
			[1920, 1100],
		]) {
			await page.setViewportSize({ width, height });
			const home = await boxes("/");
			const txt = await boxes("/txt");
			for (let i = 0; i < home.length; i++) {
				for (const k of ["x", "y", "width", "height"] as const) {
					expect(txt[i][k], `${width} ${i ? "nav" : "brand"} ${k}`).toBeCloseTo(home[i][k], 1);
				}
			}
		}
	});

	test("the site header is the banner; the bar row is in main, with the one h1, the search and its chips", async ({ page }) => {
		await page.goto("/txt");
		const banner = page.getByRole("banner");
		await expect(banner).toHaveCount(1);
		await expect(banner.getByRole("link", { name: "tristantimblin.dev" })).toHaveAttribute("href", "/");
		await expect(banner.getByRole("navigation", { name: "Primary" })).toHaveCount(1);
		const main = page.getByRole("main");
		// One h1, for a reader only: visually hidden.
		const h1 = main.getByRole("heading", { level: 1, name: "Writing" });
		await expect(h1).toHaveCount(1);
		expect(await main.locator("h1").count()).toBe(1);
		await expect(h1).toHaveClass(/ds-visually-hidden/);
		expect((await h1.boundingBox())!.width).toBeLessThanOrEqual(1);
		// Beside the hidden h1 the row holds the bar's form alone.
		expect(await page.locator(".blog__bar > :not(h1, form)").count()).toBe(0);
		// The bar: the search landmark holding the quick-filter chips nav and the stepper.
		const bar = main.getByRole("search");
		await expect(bar).toHaveCount(1);
		await expect(bar.getByRole("navigation", { name: "Quick filters" })).toHaveCount(1);
		await expect(bar.getByRole("button", { name: "Previous post" })).toBeVisible();
		await expect(bar.getByRole("button", { name: "Next post" })).toBeVisible();
		// No number is drawn: the count is a live region for a reader.
		await expect(bar.locator(COUNT)).toHaveClass(/ds-visually-hidden/);
		expect((await bar.locator(COUNT).boundingBox())!.width).toBeLessThanOrEqual(1);
		await expect(page.locator("[data-instrument]")).toHaveCount(1);
		expect(await main.locator("[data-instrument]").count()).toBe(1);
		// No tab row, no count cell, no control panels.
		await expect(page.locator(".blog__tabrow, .blog__tabs, .blog__controls, .blog__cell, .ds-panels, .ds-panel")).toHaveCount(0);
		const footer = (await page.getByRole("contentinfo").boundingBox())!;
		const frame = (await page.locator("[data-instrument]").boundingBox())!;
		expect(footer.y).toBeGreaterThanOrEqual(frame.y + frame.height);
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
			.evaluate((el) => getComputedStyle(el.firstElementChild!).transitionDelay);
		expect(computedDelay.split(",").some((d) => parseFloat(d) > 0)).toBe(true);

		// The block dodges the hovered tile.
		expect(under(await block(page), desk.col, desk.row)).toBe(false);

		await expect(card(page, "no")).toHaveText("003");
		await expect(card(page, "index")).toHaveText("[index] 000003 · log_003.txt");
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
		// Tab on, out of the quilt (into the timeline), and it lets go.
		await page.locator(`${post("001")} a`).focus();
		await expect(card(page, "title")).toHaveText("No Honey, We Have a Dashboard at Home");
		await page.keyboard.press("Tab");
		await expect(read).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(read).toHaveAttribute("href", "/txt/no-honey-we-have-a-dashboard-at-home");
		await page.keyboard.press("Tab");
		// The next stop is the timeline's first tick, so the card goes.
		await expect(page.locator(`${RULER} [data-mark]`).first()).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
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
		// The board follows the bar in the tab order: from its last control,
		// Tab lands on the first tile.
		await newer(page).focus();
		await page.keyboard.press("Tab");
		const link = page.locator(`${post("005")} a`);
		await expect(link).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "title")).toHaveText("Asserting on Agent Behavior");
		await expect(card(page, "no")).toHaveText("005");
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
		await expect(card(page, "no")).toHaveText("004");
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
			// The outline is drawn: a 1px accent line on the active cell's ruling.
			await expect.poll(() => ring(page, no)).toMatch(/inset/);
			expect(await ring(page, "005")).toBeNull();
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
		await page.locator(`${RULER} .ds-time-ruler__head`).click();
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
				// The state is drawn on the cell's contents; the ruling is constant.
				const s = getComputedStyle(el.firstElementChild!);
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

		// The chips and the timeline's ticks are plain links too: a chip is a
		// search shortcut, and ALL is the bare page.
		await expect(page.locator(chip(""))).toHaveAttribute("href", "/txt");
		await page.locator(chip("projects")).click();
		await expect(page).toHaveURL(/\/txt\/?\?q=projects$/);
		await page.locator(mark("003")).click();
		await expect(page).toHaveURL(/\/txt\/mega-desk\/?$/);
		await context.close();
	});
});

test.describe("instrument — the chips", () => {
	test("search shortcuts: real links to ?q=; ALL current at rest, the category's chip for its query, none otherwise", async ({
		page,
	}) => {
		await page.goto("/txt");
		const chips = page.locator("[data-search-chips] [data-chip]");
		expect(
			await chips.evaluateAll((as) => as.map((a) => [(a as HTMLElement).dataset.chip, a.getAttribute("href"), a.tagName])),
		).toEqual([
			["", "/txt", "A"],
			["programming", "/txt?q=programming", "A"],
			["projects", "/txt?q=projects", "A"],
			["thoughts", "/txt?q=thoughts", "A"],
			["personal", "/txt?q=personal", "A"],
		]);
		await expect(page.locator(chip(""))).toHaveAttribute("aria-current", "page");
		await expect(page.locator("[data-search-chips] [aria-current]")).toHaveCount(1);

		// A chip writes its category into the search, in place: no navigation,
		// ?q= through replaceState, and it is the one chip filled.
		const before = await page.evaluate(() => history.length);
		await page.locator(chip("programming")).click();
		await expect(page.locator(SEARCH)).toHaveValue("programming");
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		expect(await page.evaluate(() => history.length)).toBe(before);
		await expect(page.locator(chip("programming"))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(chip(""))).not.toHaveAttribute("aria-current");
		// The fill follows (it fades over --duration-swap, so poll).
		await expect
			.poll(() =>
				chips.evaluateAll((as) =>
					as.filter((a) => getComputedStyle(a).backgroundColor !== "rgba(0, 0, 0, 0)").map((a) => (a as HTMLElement).dataset.chip),
				),
			)
			.toEqual(["programming"]);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expectCount(page, "2 of 5 posts");
		for (const c of (await cells(page)).filter((c) => c.kind === "post")) {
			if (c.no === "005" || c.no === "001") expect(c.state, `post ${c.no}`).toBe("lit");
			else expect(c.state, `post ${c.no}`).not.toBe("lit");
		}

		// Typing the category by hand selects the chip too; any other query, none.
		await page.locator(SEARCH).fill("projects");
		await expect(page.locator(chip("projects"))).toHaveAttribute("aria-current", "page");
		await page.locator(SEARCH).fill("home");
		await expect(page.locator("[data-search-chips] [aria-current]")).toHaveCount(0);

		// ALL clears the query.
		await page.locator(chip("")).click();
		await expect(page.locator(SEARCH)).toHaveValue("");
		await expect(page).toHaveURL(/\/txt\/?$/);
		await expect(page.locator(chip(""))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		await expectCount(page, "5 posts");
	});

	test("?q=<category> on load makes that chip current", async ({ page }) => {
		await page.goto("/txt?q=projects");
		await expect(page.locator(chip("projects"))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(chip(""))).not.toHaveAttribute("aria-current");
		await expectCount(page, "1 of 5 posts");
	});
});

test.describe("instrument — the stepper", () => {
	const expectStep = async (page: Page, no: string, title: string, line: RegExp) => {
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "no")).toHaveText(no);
		await expect(card(page, "title")).toHaveText(title);
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(1);
		await expect(page.locator(post(no))).toHaveAttribute("data-active", "");
		await expect.poll(() => ring(page, no)).toMatch(/inset/);
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
		await expect(card(page, "no")).toHaveText("001");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		// Clearing the filter lights every tick again.
		await page.locator(SEARCH).fill("");
		await expect(dim).toHaveCount(0);
	});
});

test.describe("instrument — the card", () => {
	test("the ruled card: the top strip, the number and its readouts, title, excerpt, the stat strip, READ", async ({
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
		const desk = index.find((p) => p.no === 3)!;

		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		// The top strip: the category as a boxed chip, and the index line.
		await expect(card(page, "category")).toHaveText("projects");
		await expect(card(page, "category")).toHaveClass(/ds-chip/);
		await expect(card(page, "index")).toHaveText("[index] 000003 · log_003.txt");
		// The body: the big number, the readouts, the words.
		await expect(card(page, "no")).toHaveText("003");
		const readouts = page.locator(`${PANEL} .ds-quilt-panel__readouts`);
		await expect(readouts).toHaveText(/status: published/);
		await expect(card(page, "node")).toHaveText("projects");
		await expect(readouts).toHaveText(/node: txt\/projects/);
		await expect(card(page, "rate")).toHaveText(String(Math.round(desk.words / desk.minutes)));
		await expect(readouts).toHaveText(/rate: \d+ wpm/);
		await expect(card(page, "title")).toHaveText("The Mega Desk");
		await expect(card(page, "blurb")).toContainText("standing desk");
		// The strip: three stat cells and the accent READ cell, which is the link.
		const strip = page.locator(`${PANEL} [data-face="card"] .ds-stat-strip`);
		const stats = strip.locator(".ds-stat");
		await expect(stats).toHaveCount(3);
		await expect(stats.nth(0)).toHaveText(new RegExp(`${desk.minutes} min\\s*read`));
		await expect(stats.nth(1)).toHaveText(new RegExp(`${desk.words}\\s*words`));
		await expect(stats.nth(2)).toHaveText(/apr 2025\s*published/);
		await expect(card(page, "minutes")).toHaveText(String(desk.minutes));
		await expect(card(page, "words")).toHaveText(String(desk.words));
		await expect(card(page, "month")).toHaveText("apr");
		await expect(card(page, "year")).toHaveText("2025");
		await expect(card(page, "link")).toHaveAttribute("href", "/txt/mega-desk");
		await expect(card(page, "link")).toHaveText(/read/i);
		const accent = await page.evaluate(() => {
			const probe = document.createElement("div");
			probe.style.background = "var(--accent)";
			document.body.append(probe);
			const c = getComputedStyle(probe).backgroundColor;
			probe.remove();
			return c;
		});
		const action = strip.locator(".ds-stat-strip__action");
		expect(await action.evaluate((a) => getComputedStyle(a).backgroundColor)).toBe(accent);
		expect(await action.locator("a").evaluate((a) => a.closest(".ds-stat-strip__action") !== null)).toBe(true);
		// Cells cut by hairlines, the strip under a hairline.
		expect(await strip.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
		expect(await stats.first().evaluate((el) => getComputedStyle(el).borderRightWidth)).toBe("1px");

		// The page colour inside the strong hairline, square, filling the block.
		const face = page.locator(`${PANEL} [data-face="card"]`);
		const s = await face.evaluate((f) => {
			const cs = getComputedStyle(f);
			return { border: cs.borderTopWidth, radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor };
		});
		expect(s.border).toBe("1px");
		expect(s.radius).toBe(0);
		expect(s.bg).toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
		const [faceBox, panelBox] = [await face.boundingBox(), await page.locator(PANEL).boundingBox()];
		expect(Math.abs(faceBox!.width - panelBox!.width)).toBeLessThanOrEqual(1);
		expect(Math.abs(faceBox!.height - panelBox!.height)).toBeLessThanOrEqual(1);
		// Nothing in it is clipped: every line of the card is inside the block.
		const clipped = await face.evaluate((f) =>
			[...f.querySelectorAll<HTMLElement>("[data-card], .ds-stat")].filter((el) => {
				const r = el.getBoundingClientRect();
				const b = f.getBoundingClientRect();
				return r.width > 0 && (r.bottom > b.bottom + 1 || r.right > b.right + 1);
			}).length,
		);
		expect(clipped).toBe(0);

		// Another post refills every field.
		await page.locator(`${post("005")} a`).hover();
		await expect(card(page, "no")).toHaveText("005");
		await expect(card(page, "index")).toHaveText("[index] 000005 · log_005.txt");
		await expect(card(page, "category")).toHaveText("programming");
		await expect(card(page, "node")).toHaveText("programming");
		await expect(card(page, "month")).toHaveText("feb");
		await expect(card(page, "year")).toHaveText("2026");
	});

	test("the block is the container's: the same card at 1440 and at 1920", async ({ page }) => {
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
		// 3×2 cells of the capped board: ~678×256 at either width.
		expect(a.w).toBeGreaterThan(600);
		expect(a.h).toBeGreaterThan(230);
		expect(b.w).toBeCloseTo(a.w, 0);
		expect(b.h).toBeCloseTo(a.h, 0);
		expect(b.title).toBe(a.title);
	});
});

test.describe("instrument — the count", () => {
	test("a live region for a reader, never drawn: 5 posts at rest, N of 5 posts while filtering", async ({ page }) => {
		await page.goto("/txt");
		const live = page.locator(COUNT);
		await expect(live).toHaveCount(1);
		await expect(live).toHaveAttribute("aria-live", "polite");
		await expect(live).toHaveClass(/ds-visually-hidden/);
		expect((await live.boundingBox())!.width).toBeLessThanOrEqual(1);
		await expectCount(page, "5 posts");
		await page.locator(chip("personal")).click();
		await expectCount(page, "1 of 5 posts");
		await page.locator(SEARCH).fill("zzz");
		await expectCount(page, "0 of 5 posts");
		await page.locator(SEARCH).fill("");
		await expectCount(page, "5 posts");
	});
});

test.describe("instrument — layouts", () => {
	/** The bar's parts, as boxes. */
	const barBoxes = (page: Page) =>
		page.evaluate(() => {
			const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON();
			return {
				bar: box("[data-search-bar]"),
				input: box("[data-search-input]"),
				chips: box("[data-search-chips]"),
				older: box('[data-step="older"]'),
				newer: box('[data-step="newer"]'),
				chipsScroll: (() => {
					const n = document.querySelector<HTMLElement>("[data-search-chips]")!;
					return { overflowX: getComputedStyle(n).overflowX, scrollable: n.scrollWidth > n.clientWidth + 1 };
				})(),
			};
		});

	test("desktop (1440): one line — the input, the chips, the stepper and the hint side by side", async ({ page }) => {
		await page.goto("/txt");
		const b = await barBoxes(page);
		const mid = (r: DOMRect) => r.y + r.height / 2;
		expect(Math.abs(mid(b.chips) - mid(b.input))).toBeLessThanOrEqual(2);
		expect(Math.abs(mid(b.older) - mid(b.input))).toBeLessThanOrEqual(2);
		expect(b.chips.x).toBeGreaterThanOrEqual(b.input.x + b.input.width - 1);
		expect(b.older.x).toBeGreaterThanOrEqual(b.chips.x + b.chips.width - 1);
		expect(b.newer.x).toBeGreaterThan(b.older.x);
		// The input keeps most of the bar.
		expect(b.input.width).toBeGreaterThan(b.bar.width / 3);
		await expect(page.locator(`${BAR} .ds-search-bar__hint`)).toBeVisible();
		await expect(page.locator(`${BAR} .ds-search-bar__hint`)).toHaveText("/");
	});

	test("tablet (900): three columns, no text on a tile; the chips on their own row under the input, the stepper beside it", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 900, height: 1100 });
		await page.goto("/txt");
		expect(await page.locator("[data-instrument] > .blog__row").count()).toBe(3);
		expect(
			await page.locator("[data-quilt]").evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length),
		).toBe(3);
		const texts = await page
			.locator("[data-cell]")
			.evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => (e as HTMLElement).innerText.trim()));
		expect(texts).toHaveLength(9);
		expect(texts.every((t) => t === "")).toBe(true);
		const b = await barBoxes(page);
		expect(b.chips.y).toBeGreaterThanOrEqual(b.input.y + b.input.height - 1);
		expect(Math.abs(b.chips.width - b.bar.width)).toBeLessThanOrEqual(2);
		expect(Math.abs(b.older.y + b.older.height / 2 - (b.input.y + b.input.height / 2))).toBeLessThanOrEqual(2);
		expect(b.input.width).toBeGreaterThan(b.bar.width / 2);
		expect(await overflow(page)).toBeLessThanOrEqual(0);
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "link")).toBeVisible();
		expect(await overflow(page)).toBeLessThanOrEqual(0);
	});

	test("phone (390): the chips scroll sideways under the input, the stepper beside it, captions on the tiles, the timeline compact", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 1000 });
		await page.goto("/txt");
		const b = await barBoxes(page);
		expect(b.chips.y).toBeGreaterThanOrEqual(b.input.y + b.input.height - 1);
		expect(b.chipsScroll.overflowX).toBe("auto");
		expect(b.chipsScroll.scrollable).toBe(true);
		expect(Math.abs(b.older.y + b.older.height / 2 - (b.input.y + b.input.height / 2))).toBeLessThanOrEqual(2);
		expect(b.older.x).toBeGreaterThanOrEqual(b.input.x + b.input.width - 1);
		// A tap-list needs its titles: the phone tiles keep a small caption.
		await expect(page.locator(`${post("003")} .ds-quilt-cell__caption`)).toBeVisible();
		// The timeline is drawn shorter than on a desktop, with its years.
		const strip = (await page.locator(`${RULER} .ds-time-ruler__strip`).boundingBox())!;
		expect(strip.height).toBeLessThan(48);
		await expect(page.locator(`${RULER} .ds-time-ruler__year`).first()).toBeVisible();
		// The head's label and readout never collide: on a phone the readout
		// takes its own line under the label.
		const head = await page.locator(`${RULER} .ds-time-ruler__head`).evaluate((h) => {
			const [label, readout] = [...h.children].map((c) => c.getBoundingClientRect());
			return { labelBottom: label.bottom, readoutTop: readout.top, readoutRight: readout.right, right: h.getBoundingClientRect().right };
		});
		expect(head.readoutTop).toBeGreaterThanOrEqual(head.labelBottom - 1);
		expect(head.readoutRight).toBeLessThanOrEqual(head.right + 1);
		expect(await overflow(page)).toBeLessThanOrEqual(0);

		// A step shows the card in flow above the list, the stepped tile outlined.
		await newer(page).click();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(PANEL)).toBeVisible();
		await expect(card(page, "no")).toHaveText("001");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		await expect(card(page, "link")).toBeVisible();
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
