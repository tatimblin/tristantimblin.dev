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
 *               drawn a step back; entries cut by gaps, no ruling — a
 *               numbered caps label over a dotted rule, the art bare under
 *               it; the newest post the 2×2 lead with its excerpt; the
 *               instrument across the full page (to the container's
 *               gutter), under the site header, which keeps the container
 *   hover/focus the tile lit, the rest faint or gone on a stagger, the card
 *               in a block that dodges it; leaving the tile restores (the
 *               panel holds it, tile to tile never passes rest); deterministic
 *   typing      the live count, ?q= via replaceState, ?q= on load
 *   results     <mark>, the why, the listbox, ↑↓ wrap, the ring, Enter
 *   single/none the card; the nothing face and its pills
 *   keys        / and ⌘K (not from another field), Esc clears then blurs
 *   viewports   the 3-column tablet grid (four rows, the lead's and the
 *               panel's); the phone list — the lead full width, the rest
 *               2-up — panel in flow
 *   no JS       links, and the form submits ?q=
 *
 * And the INSTRUMENT around the board (the "instrument —" describes):
 *
 *   chips       search shortcuts in the bar: real links to ?q=<category>,
 *               set in place; aria-current (the accent-underlined tab) on ALL at
 *               rest, on the category's chip for its query, on none for any
 *               other query; ?q= on load
 *   stepper     − older / + newer through the matching posts, newest
 *               first, wrapping; the card, the ring and the focused bar
 *               follow; a step holds while the pointer is elsewhere; Escape
 *               clears. Circled, beside the in-focus readout at the foot —
 *               and on a phone in the dock instead; one drawn per viewport
 *   timeline    one slot per month, a bar per post its words tall (a named
 *               link), the post in focus filled with the accent (at rest
 *               the latest), dim bars under a filter, a click pins
 *   foot        the topic key (a link per category, set in place), the
 *               timeline, the in-focus readout (the two-digit number, the
 *               title, the month and words, the post's place among the
 *               posts, the progress bar); docked to the window's bottom edge
 *               on a desktop while the quilt scrolls under it, at rest after
 *               it before the footer; in the flow below 1024; the phone's
 *               DOCK (the progress line, −, the post in focus, +) stuck to
 *               the window's bottom instead
 *   card        the ruled card's fields and its stat strip; one size at 1440 and 1920
 *   count       the live region a reader hears, in full; the readout drawn
 *               beside the input, short (`05`, `2 / 5`)
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
const READOUT = "[data-search-readout]";
/** The count as drawn, beside the input: `05`, `2 / 5`. */
const expectReadout = (page: Page, text: string) =>
	expect.poll(() => page.locator(READOUT).evaluate((el) => el.textContent!.trim())).toBe(text);
const BAR = "[data-search-bar]";
const chip = (q: string) => `[data-search-chips] [data-chip="${q}"]`;
/** The active outline: the art box's ::after box-shadow, or null when it is transparent. */
const ring = (page: Page, no: string) =>
	page.locator(`${post(no)} .ds-quilt-cell__art`).evaluate((el) => {
		const shadow = getComputedStyle(el, "::after").boxShadow;
		return /rgba\(0, 0, 0, 0\)|transparent|^none$/.test(shadow) ? null : shadow;
	});
/** A cell's label row, as drawn: `05 ASSERTING ON AGENT BEHAVIOR` (the gap
 *  after the number is a margin, so innerText runs them together), `F_07`. */
const LABEL = /^(\d{2}\s*[A-Z].*|F_\d{2})$/s;
/** The custom property `name` on `sel`, as a number of px. */
const prop = (page: Page, sel: string, name: string) =>
	page.locator(sel).first().evaluate((el, n) => parseFloat(getComputedStyle(el).getPropertyValue(n)), name);
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
const FOOT = "[data-quilt-foot]";
const DOCK = "[data-quilt-dock]";
/** The in-focus readout's hook, in the foot. */
const focus = (page: Page, hook: string) => page.locator(`${FOOT} [data-focus="${hook}"]`);
/** The readout names the post in focus: `05`, the title, `feb 2026 · 554 w`. */
const expectFocus = async (page: Page, no: string, title: string, meta?: RegExp) => {
	await expect(focus(page, "no")).toHaveText(no);
	await expect(focus(page, "title")).toHaveText(title);
	if (meta) await expect(focus(page, "meta")).toHaveText(meta);
};
/** The one visible stepper: getByRole leaves out the display: none copy. */
const older = (page: Page) => page.getByRole("button", { name: "Previous post" });
const newer = (page: Page) => page.getByRole("button", { name: "Next post" });
const overflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: { width: 1440, height: 1000 } });

test.describe("quilt — rest", () => {
	test("a full grid, one named link per post, fillers hidden from assistive tech", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const all = await cells(page);
		const posts = all.filter((c) => c.kind === "post");
		expect(posts.map((c) => c.no)).toEqual(["005", "004", "003", "002", "001"]);
		expect(all.every((c) => c.state === "lit" && !c.active)).toBe(true);

		// The desktop grid is 5×3 and every cell of it is drawn: the lead's
		// four as one entry, the other four posts, seven fillers.
		const visible = await page
			.locator("[data-cell]")
			.evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
		expect(visible).toBe(12);
		await expect(page.locator('[data-cell="post"][data-span]')).toHaveCount(1);
		await expect(page.locator(post("005"))).toHaveAttribute("data-span", "2x2");

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

	test("fillers' art is a step back and grey at rest, their tag dim; the posts are at full strength", async ({
		page,
	}) => {
		await page.goto("/txt/");
		// The state is painted on the cell's contents — a filler's label and
		// its art, a post's link — not the cell.
		const look = (sel: string) =>
			page.locator(sel).evaluateAll((els) =>
				els
					.filter((e) => e.checkVisibility())
					.map((e) => {
						const art = getComputedStyle(e.querySelector(".ds-quilt-cell__art")!);
						const label = getComputedStyle(e.querySelector(".ds-quilt-cell__label")!);
						const first = getComputedStyle(e.firstElementChild!);
						const cell = getComputedStyle(e);
						return {
							state: (e as HTMLElement).dataset.state,
							opacity: Number(art.opacity),
							filter: art.filter,
							label: { color: label.color, opacity: Number(label.opacity) },
							first: { opacity: Number(first.opacity), filter: first.filter },
							cell: { opacity: Number(cell.opacity), filter: cell.filter },
						};
					}),
			);
		const dim = await prop(page, "[data-quilt]", "--quilt-dim");
		const tertiary = await page.evaluate(() => {
			const probe = document.createElement("div");
			probe.style.color = "var(--text-tertiary)";
			document.body.append(probe);
			const c = getComputedStyle(probe).color;
			probe.remove();
			return c;
		});
		// Settled: the cells ease in from the stylesheet's first paint.
		await expect
			.poll(async () =>
				(await look('[data-cell="filler"]')).every(
					(f) => Math.abs(f.opacity - dim) < 0.01 && f.filter === "grayscale(1)",
				),
			)
			.toBe(true);
		const fillers = await look('[data-cell="filler"]');
		expect(fillers.length).toBeGreaterThan(0);
		for (const f of fillers) {
			// Still `lit` in the state contract — it is the paint that holds it back.
			expect(f.state).toBe("lit");
			expect(f.opacity).toBeCloseTo(dim, 2);
			expect(f.filter).toBe("grayscale(1)");
			// The tag is the tertiary ink at full strength: dim by colour, not faded.
			expect(f.label.color).toBe(tertiary);
			expect(f.label.opacity).toBe(1);
			// The cell itself is never faded.
			expect(f.cell).toEqual({ opacity: 1, filter: "none" });
		}
		for (const p of await look('[data-cell="post"]')) {
			expect(p.first).toEqual({ opacity: 1, filter: "none" });
			expect(p.opacity).toBe(1);
			expect(p.filter).toBe("none");
			expect(p.label.color).not.toBe(tertiary);
		}
	});

	test("no ruling: entries on the page cut by the gap tokens, a label over each art, the art bare", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const m = await page.evaluate(() => {
			const grid = document.querySelector<HTMLElement>("[data-quilt]")!;
			const gs = getComputedStyle(grid);
			const cells = [...document.querySelectorAll<HTMLElement>("[data-cell]")].filter((c) => c.checkVisibility());
			const borders = (cs: CSSStyleDeclaration) =>
				[cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
			return {
				rowGap: parseFloat(gs.rowGap),
				colGap: parseFloat(gs.columnGap),
				gapToken: parseFloat(gs.getPropertyValue("--quilt-gap")),
				rowGapToken: parseFloat(gs.getPropertyValue("--quilt-row-gap")),
				grid: borders(gs),
				cells: cells.map((c) => {
					const cs = getComputedStyle(c);
					const frame = c.querySelector<HTMLElement>(".ds-art-frame")!;
					const fs = getComputedStyle(frame);
					const label = c.querySelector<HTMLElement>(".ds-quilt-cell__label")!;
					const ls = getComputedStyle(label);
					return {
						kind: c.dataset.cell,
						span: c.dataset.span ?? null,
						borders: borders(cs),
						padding: cs.padding,
						box: c.getBoundingClientRect().toJSON(),
						art: frame.getBoundingClientRect().toJSON(),
						frame: { borders: borders(fs), bg: fs.backgroundColor, radius: fs.borderTopLeftRadius },
						label: {
							box: label.getBoundingClientRect().toJSON(),
							text: label.innerText.trim(),
							ruleStyle: ls.borderTopStyle,
							ruleWidth: ls.borderTopWidth,
							transform: ls.textTransform,
							family: ls.fontFamily,
						},
						noColor: c.querySelector(".ds-rule-label__no") ? getComputedStyle(c.querySelector(".ds-rule-label__no")!).color : null,
					};
				}),
			};
		});
		const accent = await page.evaluate(() => {
			const probe = document.createElement("div");
			probe.style.color = "var(--accent)";
			document.body.append(probe);
			const c = getComputedStyle(probe).color;
			probe.remove();
			return c;
		});
		// The gaps are the quilt's tokens — columns a step, rows a wider one
		// — and no line round the grid.
		expect(m.colGap).toBeCloseTo(m.gapToken, 1);
		expect(m.rowGap).toBeCloseTo(m.rowGapToken, 1);
		expect(m.rowGap).toBeGreaterThan(m.colGap);
		expect(m.grid).toEqual(["0px", "0px", "0px", "0px"]);
		expect(m.cells).toHaveLength(12);
		for (const c of m.cells) {
			// No line on a cell, none on the art: no plate, edge or corner.
			expect(c.borders).toEqual(["0px", "0px", "0px", "0px"]);
			expect(c.padding).toBe("0px");
			expect(c.frame.borders).toEqual(["0px", "0px", "0px", "0px"]);
			expect(c.frame.bg).toBe("rgba(0, 0, 0, 0)");
			expect(c.frame.radius).toBe("0px");
			// The label row over the art: a caps line on a dotted rule, the
			// number in the accent (a post) or none (a filler's F_NN); the art
			// fills the cell's width under it.
			expect(c.label.text).toMatch(LABEL);
			expect(c.label.ruleStyle).toBe("dotted");
			expect(c.label.ruleWidth).toBe("1px");
			expect(c.label.transform).toBe("uppercase");
			expect(c.label.box.top).toBeCloseTo(c.box.top, 0);
			expect(c.art.top).toBeGreaterThanOrEqual(c.label.box.bottom);
			expect(c.art.left).toBeCloseTo(c.box.left, 0);
			expect(c.art.right).toBeCloseTo(c.box.right, 0);
			if (c.kind === "post") {
				expect(c.label.text).toMatch(/^\d{2}/);
				expect(c.noColor).toBe(accent);
			} else {
				expect(c.label.text).toMatch(/^F_\d{2}$/);
			}
		}
		// The lead: the top-left entry, two columns and two rows of the
		// grid; its right neighbour a column gap away, the entry under it a
		// row gap away.
		const boxes = [...m.cells].sort((p, q) => p.box.top - q.box.top || p.box.left - q.box.left);
		const lead = boxes[0];
		expect(lead.kind).toBe("post");
		expect(lead.span).toBe("2x2");
		const single = boxes.find((c) => c.span === null)!;
		expect(lead.box.width).toBeCloseTo(2 * single.box.width + m.colGap, 0);
		const right = boxes.filter((c) => Math.abs(c.box.top - lead.box.top) < 1 && c.box.left > lead.box.left).sort((p, q) => p.box.left - q.box.left)[0];
		const below = boxes.filter((c) => Math.abs(c.box.left - lead.box.left) < 1 && c.box.top > lead.box.top).sort((p, q) => p.box.top - q.box.top)[0];
		expect(right.box.left - lead.box.right).toBeCloseTo(m.colGap, 0);
		expect(below.box.top - lead.box.bottom).toBeCloseTo(m.rowGap, 0);
		// The lead's bottom is where the second row ends: the entry beside its
		// lower half sits inside its height.
		const beside = boxes.filter((c) => c.box.top > lead.box.top && c.box.top < lead.box.bottom && c.box.left > lead.box.left);
		expect(beside.length).toBeGreaterThan(0);
		for (const c of beside) expect(c.box.bottom).toBeLessThanOrEqual(lead.box.bottom + 1);
		// A row's arts line up: every cell in the lead's first row starts its
		// art on one line, whether its title wrapped or not.
		const rowOne = boxes.filter((c) => Math.abs(c.box.top - lead.box.top) < 1);
		expect(rowOne.length).toBeGreaterThan(2);
		for (const c of rowOne) expect(c.art.top, c.label.text).toBeCloseTo(lead.art.top, 0);
	});

	for (const [width, height] of [
		[1440, 1000],
		[768, 1100],
	] as const) {
		test(`the lead at ${width}: the newest post 2×2 at the top-left, its excerpt in the body voice under the art`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			await page.goto("/txt/");
			const lead = page.locator(post("005"));
			await expect(lead).toHaveAttribute("data-span", "2x2");
			await expect(lead.locator(".ds-quilt-cell__label")).toHaveText(/05\s*Asserting on Agent Behavior/);
			const excerpt = lead.locator(".ds-quilt-cell__excerpt");
			await expect(excerpt).toBeVisible();
			await expect(excerpt).toHaveText(/I built Aptitude — a test harness/);
			// No other entry says more than its label.
			await expect(page.locator(".ds-quilt-cell__excerpt")).toHaveCount(1);
			const m = await page.evaluate(() => {
				const lead = document.querySelector<HTMLElement>('[data-cell="post"][data-span]')!;
				const ex = lead.querySelector<HTMLElement>(".ds-quilt-cell__excerpt")!;
				const art = lead.querySelector<HTMLElement>(".ds-quilt-cell__art")!;
				const cs = getComputedStyle(ex);
				const probe = document.createElement("div");
				probe.style.cssText = "color: var(--text-secondary); font-family: var(--font-body)";
				document.body.append(probe);
				const ps = getComputedStyle(probe);
				const token = { color: ps.color, family: ps.fontFamily };
				probe.remove();
				const quilt = document.querySelector("[data-quilt]")!.getBoundingClientRect();
				const single = document.querySelector<HTMLElement>('[data-cell="post"]:not([data-span])')!.getBoundingClientRect();
				const rowArts = [...document.querySelectorAll<HTMLElement>("[data-cell]")]
					.filter((c) => c.checkVisibility() && Math.abs(c.getBoundingClientRect().top - lead.getBoundingClientRect().top) < 1)
					.map((c) => ({
						label: c.querySelector<HTMLElement>(".ds-quilt-cell__label")!.innerText.trim(),
						artTop: c.querySelector(".ds-quilt-cell__art")!.getBoundingClientRect().top,
					}));
				return {
					token,
					rowArts,
					color: cs.color,
					family: cs.fontFamily,
					maxWidth: parseFloat(cs.maxWidth),
					fontSize: parseFloat(cs.fontSize),
					// 52ch in the excerpt's own face and size (the `font` shorthand
					// does not serialise from a computed style; the longhands do).
					ch: (() => {
						const c = document.createElement("span");
						c.style.cssText = `position:absolute; width: 52ch; font-family: ${cs.fontFamily}; font-size: ${cs.fontSize}; font-weight: ${cs.fontWeight}`;
						document.body.append(c);
						const w = c.getBoundingClientRect().width;
						c.remove();
						return w;
					})(),
					ex: ex.getBoundingClientRect().toJSON(),
					art: art.getBoundingClientRect().toJSON(),
					lead: lead.getBoundingClientRect().toJSON(),
					quilt: quilt.toJSON(),
					single,
					colGap: parseFloat(getComputedStyle(document.querySelector("[data-quilt]")!).columnGap),
					rows: getComputedStyle(document.querySelector("[data-quilt]")!).gridTemplateRows.split(" ").length,
				};
			});
			// The body face in the secondary ink, a step down, held to ~52ch.
			expect(m.family).toBe(m.token.family);
			expect(m.color).toBe(m.token.color);
			expect(m.fontSize).toBeLessThan(16);
			expect(m.maxWidth).toBeCloseTo(m.ch, 0);
			// Under the art, inside the lead.
			expect(m.ex.top).toBeGreaterThanOrEqual(m.art.bottom);
			expect(m.ex.bottom).toBeLessThanOrEqual(m.lead.bottom + 1);
			// Top-left, two columns wide: two cells and the gap between (two
			// fifths of the desktop board, two thirds of the tablet's).
			expect(m.lead.left).toBeCloseTo(m.quilt.left, 0);
			expect(m.lead.top).toBeCloseTo(m.quilt.top, 0);
			expect(m.lead.width).toBeCloseTo(2 * m.single.width + m.colGap, 0);
			// The grid's rows: three on the desktop; four on the tablet, where the
			// panel needs two rows of its own under the lead.
			expect(m.rows).toBe(width >= 1024 ? 3 : 4);
			// The lead's row: every entry starts its art on the lead's line, the
			// label reserving two lines whether the title took one or both (at
			// 768 the car's two-line title sits beside the lead's one).
			expect(m.rowArts.length).toBeGreaterThan(1);
			for (const c of m.rowArts) expect(c.artTop, c.label).toBeCloseTo(m.art.top, 0);
			if (width < 1024) expect(m.rowArts.map((c) => c.label)).toContain("02YOUR CAR KNOWS YOU'RE GETTING SICK");
		});
	}

	test("no ruling in any state: a filler, a faint and a gone cell draw no line either", async ({ page }) => {
		await page.goto("/txt/");
		const lines = (sel: string) =>
			page.locator(sel).first().evaluate((el) => {
				const cs = getComputedStyle(el);
				return [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth, cs.outlineStyle];
			});
		const none = ["0px", "0px", "0px", "0px", "none"];
		expect(await lines('[data-cell="post"][data-state="lit"]')).toEqual(none);
		expect(await lines('[data-cell="filler"]:not([hidden])')).toEqual(none);
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		expect(await page.locator('[data-cell][data-state="gone"]').count()).toBeGreaterThan(0);
		expect(await lines('[data-cell][data-state="gone"]')).toEqual(none);
		expect(await lines('[data-cell][data-state="faint"]')).toEqual(none);
	});

	test("one instrument: three rows across the full page, under the site header, which keeps the container", async ({
		page,
	}) => {
		await page.goto("/txt/");
		// At the end of the page: the foot is docked on a desktop, and at
		// rest in its own row only once the quilt has scrolled past.
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
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
				space3: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-3")),
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
		// The rows: the full page, inside only the container's gutter.
		expect(m.frame.left).toBeCloseTo(m.container.pad, 0);
		expect(m.frame.right).toBeCloseTo(m.vw - m.container.pad, 0);
		// The main nav, once, above the rows, still in the site's container:
		// --container-max, centred, inside --container-pad.
		const inset = Math.max(m.container.pad, (m.vw - m.container.max) / 2 + m.container.pad);
		expect(m.siteHeaders).toBe(1);
		expect(m.frame.top).toBeGreaterThanOrEqual(m.header.bottom - 1);
		expect(m.brand.left).toBeCloseTo(inset, 0);
		expect(m.nav.right).toBeCloseTo(m.vw - inset, 0);
		// The bar, the board, the foot: each the page's width, under the
		// last, set apart by space rather than a hairline gutter.
		expect(m.rows).toHaveLength(3);
		for (const r of m.rows) {
			expect(r.left).toBeCloseTo(m.frame.left, 0);
			expect(r.right).toBeCloseTo(m.frame.right, 0);
		}
		// No dead space: the rows stack a --space-3 apart — the quilt right
		// under the bar, the foot's row right under the quilt — rather than
		// filling the viewport and centring the board.
		for (let i = 1; i < m.rows.length; i++) {
			expect(m.rows[i].top - m.rows[i - 1].bottom, `row ${i}`).toBeCloseTo(m.space3, 0);
		}
		expect(m.quilt.top - m.bar.bottom).toBeCloseTo(m.space3, 0);
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
		test(`nothing is filled: the rows, the open bar, its tabs and the grid are the page (${theme})`, async ({ page }) => {
			await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
			await page.goto("/txt/");
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
					...document.querySelectorAll("[data-instrument] > .blog__row:not(.blog__foot), [data-quilt], [data-cell]"),
				].map((el) => ({ cls: el.className, clear: clear(bg(el)) }));
				// The docked foot alone carries a colour: the page's own, so the
				// tiles scrolling under it do not show through.
				const probe = document.createElement("div");
				probe.style.background = "var(--background)";
				document.body.append(probe);
				const page = bg(probe);
				probe.remove();
				const dock = { bg: bg(document.querySelector(".blog__foot")!), page };
				const accentProbe = document.createElement("div");
				accentProbe.style.color = "var(--accent)";
				document.body.append(accentProbe);
				const accent = getComputedStyle(accentProbe).color;
				accentProbe.remove();
				const chips = [...document.querySelectorAll<HTMLElement>("[data-search-chips] [data-chip]")].map((c) => {
					const cs = getComputedStyle(c);
					return {
						q: c.dataset.chip,
						current: c.hasAttribute("aria-current"),
						filled: !clear(bg(c)),
						top: cs.borderTopWidth,
						side: cs.borderLeftWidth,
						under: cs.borderBottomWidth,
						underColor: cs.borderBottomColor,
						count: c.querySelector("sup")?.textContent,
					};
				});
				const input = getComputedStyle(document.querySelector("[data-search-input]")!);
				const ring = getComputedStyle(document.querySelector(".ds-search-bar__ring")!);
				return {
					bare,
					dock,
					chips,
					accent,
					bar: { border: bs.borderTopWidth, bottom: bs.borderBottomWidth },
					input: { top: input.borderTopWidth, under: input.borderBottomWidth, style: input.borderBottomStyle },
					ring: { border: ring.borderTopWidth, radius: ring.borderTopLeftRadius, width: ring.width, clear: clear(ring.backgroundColor) },
				};
			});
			for (const b of m.bare) expect(b.clear, b.cls).toBe(true);
			expect(m.dock.bg).toBe(m.dock.page);
			// The bar: no box. The input sits on a single underline; the icon
			// in an outlined ring, unfilled.
			expect(m.bar.border).toBe("0px");
			expect(m.bar.bottom).toBe("0px");
			expect(m.input.top).toBe("0px");
			expect(m.input.under).toBe("1px");
			expect(m.input.style).toBe("solid");
			expect(m.ring.border).toBe("1px");
			expect(m.ring.clear).toBe(true);
			expect(parseFloat(m.ring.radius)).toBeGreaterThanOrEqual(parseFloat(m.ring.width) / 2);
			// The chips: text tabs, no box and no fill, each with its count
			// (ALL the total); ALL alone, being current, underlined in the accent.
			expect(m.chips.map((c) => c.q)).toEqual(["", "programming", "projects", "thoughts", "personal"]);
			expect(m.chips.map((c) => c.count)).toEqual(["5", "2", "1", "1", "1"]);
			for (const c of m.chips) {
				expect(c.filled, `chip ${c.q}`).toBe(false);
				expect(c.top, `chip ${c.q}`).toBe("0px");
				expect(c.side, `chip ${c.q}`).toBe("0px");
				expect(c.under === "1px" && c.underColor === m.accent, `chip ${c.q} underline`).toBe(c.current);
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
			const txt = await boxes("/txt/");
			for (let i = 0; i < home.length; i++) {
				for (const k of ["x", "y", "width", "height"] as const) {
					expect(txt[i][k], `${width} ${i ? "nav" : "brand"} ${k}`).toBeCloseTo(home[i][k], 1);
				}
			}
		}
	});

	test("the site header is the banner; the bar row is in main, with the one h1, the search and its chips", async ({ page }) => {
		await page.goto("/txt/");
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
		// The bar: the search landmark holding the quick-filter chips nav; the
		// stepper is not in it — it sits in main, at the foot, in the region
		// named "In focus".
		const bar = main.getByRole("search");
		await expect(bar).toHaveCount(1);
		await expect(bar.getByRole("navigation", { name: "Quick filters" })).toHaveCount(1);
		expect(await bar.locator("[data-step]").count()).toBe(0);
		await expect(main.getByRole("region", { name: "In focus" }).getByRole("button", { name: "Previous post" })).toBeVisible();
		await expect(main.getByRole("region", { name: "In focus" }).getByRole("button", { name: "Next post" })).toBeVisible();
		await expect(main.getByRole("region", { name: "Topic key" })).toHaveCount(1);
		// The count twice: in full, a live region for a reader (visually
		// hidden), and short, drawn beside the input and hidden from a reader.
		await expect(bar.locator(COUNT)).toHaveClass(/ds-visually-hidden/);
		expect((await bar.locator(COUNT).boundingBox())!.width).toBeLessThanOrEqual(1);
		await expect(bar.locator(READOUT)).toBeVisible();
		await expect(bar.locator(READOUT)).toHaveText("05");
		await expect(bar.locator(READOUT)).toHaveAttribute("aria-hidden", "true");
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
		await page.goto("/txt/");
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
		await expect(card(page, "link")).toHaveAttribute("href", "/txt/mega-desk/");
		await expect(card(page, "why")).toHaveText("");

		// Leaving restores every cell and hides the panel.
		await page.mouse.move(1, 1);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		expect((await cells(page)).every((c) => c.state === "lit")).toBe(true);
	});

	test("leaving a tile for anything but another tile or the panel returns to rest", async ({
		page,
	}) => {
		await page.goto("/txt/");
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
		await page.goto("/txt/");
		// 001 sits right under the lead (005) on the desktop grid and only
		// faints under its hover (a gone tile takes no pointer).
		await page.locator(`${post("005")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(post("001"))).toHaveAttribute("data-state", "faint");
		await page.evaluate(() => {
			const panel = document.querySelector<HTMLElement>("[data-quilt-panel]")!;
			const seen: string[] = [];
			(window as unknown as { __modes: string[] }).__modes = seen;
			new MutationObserver(() => seen.push(panel.dataset.mode!)).observe(panel, {
				attributes: true,
				attributeFilter: ["data-mode"],
			});
		});
		const b = (await page.locator(post("001")).boundingBox())!;
		await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
		await expect(card(page, "title")).toHaveText("No Honey, We Have a Dashboard at Home");
		// Past the leave grace, and still no rest in between.
		await page.waitForTimeout(250);
		const modes = await page.evaluate(() => (window as unknown as { __modes: string[] }).__modes);
		expect(modes).not.toContain("hidden");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(post("001"))).toHaveAttribute("data-state", "lit");
	});

	test("the panel holds the hover: the card's READ link is reachable by pointer and by Tab", async ({
		page,
	}) => {
		await page.goto("/txt/");
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
		// Tab on, out of the quilt (into the foot), and it lets go.
		await page.locator(`${post("001")} a`).focus();
		await expect(card(page, "title")).toHaveText("No Honey, We Have a Dashboard at Home");
		await page.keyboard.press("Tab");
		await expect(read).toBeFocused();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(read).toHaveAttribute("href", "/txt/no-honey-we-have-a-dashboard-at-home/");
		await page.keyboard.press("Tab");
		// The next stop is the topic key's first row, so the card goes.
		await expect(page.locator("[data-quilt-key] a").first()).toBeFocused();
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
		await page.goto("/txt/");
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
		await page.goto("/txt/");
		// The board follows the bar in the tab order: from its last control
		// (the last tab, under the input row), Tab lands on the first tile.
		await page.locator(chip("personal")).focus();
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
		await page.goto("/txt/");
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
			page.locator(`${PANEL} [data-face="browse"] a[href="/txt/?q=programming"]`),
		).toBeVisible();
	});

	test("typing updates the count and keeps ?q= in step through replaceState", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const before = await page.evaluate(() => history.length);
		await expectReadout(page, "05");
		await page.locator(SEARCH).fill("home");
		await expectCount(page, "2 of 5 posts");
		await expectReadout(page, "2 / 5");
		await expect(page).toHaveURL(/\/txt\/?\?q=home$/);
		expect(await page.evaluate(() => history.length)).toBe(before);

		await page.locator(SEARCH).fill("");
		await expectCount(page, "5 posts");
		await expectReadout(page, "05");
		await expect(page).toHaveURL(/\/txt\/?$/);
	});

	test("?q= on load restores the search", async ({ page }) => {
		await page.goto("/txt/?q=2025");
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
		await page.goto("/txt/");
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
			// The outline is drawn: a 1px accent line round the active tile.
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
		await page.goto("/txt/");
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
		await page.goto("/txt/");
		const input = page.locator(SEARCH);
		await input.fill("recipes");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "none");
		await expectCount(page, "0 of 5 posts");
		await expect(input).not.toHaveAttribute("aria-activedescendant");
		await expect(page.locator(`${PANEL} [data-none="query"]`)).toHaveText("recipes");
		expect((await cells(page)).filter((c) => c.kind === "post").every((c) => c.state !== "lit")).toBe(
			true,
		);

		const pill = page.locator(`${PANEL} [data-none="suggestions"] a[href="/txt/?q=programming"]`);
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
		await page.goto("/txt/");
		const input = page.locator(SEARCH);
		await page.locator(`${RULER} .ds-time-ruler__label`).click();
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
		await page.goto("/txt/");
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
		await page.goto("/txt/");
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
		await page.goto("/txt/");
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		const scattered = page.locator('[data-cell]:not([data-state="lit"])');
		expect(await scattered.count()).toBeGreaterThan(0);
		const timing = await scattered.evaluateAll((els) =>
			els.map((el) => {
				// The state is drawn on the cell's contents, never the cell.
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
		await page.goto("/txt/");
		const tracks = await page
			.locator("[data-quilt]")
			.evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length);
		expect(tracks).toBe(3);
		const visible = await page
			.locator("[data-cell]")
			.evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
		// Twelve cells: the lead's four as one entry, four posts, four fillers.
		expect(visible).toBe(9);
		expect(
			await page.locator("[data-quilt]").evaluate((q) => getComputedStyle(q).gridTemplateRows.split(" ").length),
		).toBe(4);

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

	test("the lead stepped: the panel takes the two rows under it, clear of all four of its cells", async ({ page }) => {
		await page.goto("/txt/");
		await older(page).click();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "no")).toHaveText("005");
		await expect(page.locator(post("005"))).toHaveAttribute("data-active", "");
		expect(await block(page)).toEqual({ col: 1, row: 3 });
		const geo = await page.evaluate(() => ({
			p: document.querySelector("[data-quilt-panel]")!.getBoundingClientRect().toJSON(),
			lead: document.querySelector('[data-no="005"]')!.getBoundingClientRect().toJSON(),
		}));
		expect(rectsOverlap(geo.p as DOMRect, geo.lead as DOMRect)).toBe(false);
		expect(geo.p.top).toBeGreaterThanOrEqual(geo.lead.bottom);
	});
});

test.describe("quilt — phone (390px)", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("a two-column list of labelled entries, the lead across both with no excerpt, the panel in flow, and nothing vanishes", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const tracks = await page
			.locator("[data-quilt]")
			.evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length);
		expect(tracks).toBe(2);
		// Every entry keeps its label row: the number and the title, nothing
		// else — the date and the category are the card's.
		await expect(page.locator(`${post("003")} .ds-quilt-cell__label`)).toBeVisible();
		await expect(page.locator(`${post("003")} .ds-quilt-cell__label`)).toHaveText(/03\s*The Mega Desk/);
		await expect(page.locator(".ds-quilt-cell__caption, .ds-quilt-cell__meta")).toHaveCount(0);
		for (const f of await page.locator('[data-cell="filler"]').all()) await expect(f).toBeHidden();
		await expect(page.locator(PANEL)).toBeHidden();
		// The lead is the full width and its excerpt is not drawn; the other
		// posts flow two to a row in DOM order.
		const geo = await page.evaluate(() => {
			const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON();
			return {
				quilt: r("[data-quilt]"),
				lead: r('[data-cell="post"][data-span]'),
				a: r('[data-no="004"]'),
				b: r('[data-no="003"]'),
				c: r('[data-no="002"]'),
			};
		});
		expect(geo.lead.width).toBeCloseTo(geo.quilt.width, 0);
		expect(geo.lead.top).toBeCloseTo(geo.quilt.top, 0);
		await expect(page.locator(`${post("005")} .ds-quilt-cell__excerpt`)).toBeHidden();
		expect(geo.a.top).toBeGreaterThanOrEqual(geo.lead.bottom);
		expect(Math.abs(geo.a.top - geo.b.top)).toBeLessThanOrEqual(1);
		expect(geo.b.left).toBeGreaterThan(geo.a.right);
		expect(geo.c.top).toBeGreaterThanOrEqual(geo.a.bottom);
		expect(Math.abs(geo.c.left - geo.a.left)).toBeLessThanOrEqual(1);

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
		await page.goto("/txt/");
		const hrefs = await page
			.locator('[data-cell="post"] a')
			.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
		expect(hrefs).toHaveLength(5);
		expect(new Set(hrefs).size).toBe(5);
		expect(hrefs.every((h) => /^\/txt\/[^/]+\/$/.test(h ?? ""))).toBe(true);

		await page.locator(SEARCH).fill("home");
		await page.locator(SEARCH).press("Enter");
		await expect(page).toHaveURL(/\/txt\/?\?q=home$/);

		// The chips and the timeline's ticks are plain links too: a chip is a
		// search shortcut, and ALL is the bare page.
		await expect(page.locator(chip(""))).toHaveAttribute("href", "/txt/");
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
		await page.goto("/txt/");
		const chips = page.locator("[data-search-chips] [data-chip]");
		expect(
			await chips.evaluateAll((as) => as.map((a) => [(a as HTMLElement).dataset.chip, a.getAttribute("href"), a.tagName])),
		).toEqual([
			["", "/txt/", "A"],
			["programming", "/txt/?q=programming", "A"],
			["projects", "/txt/?q=projects", "A"],
			["thoughts", "/txt/?q=thoughts", "A"],
			["personal", "/txt/?q=personal", "A"],
		]);
		await expect(page.locator(chip(""))).toHaveAttribute("aria-current", "page");
		await expect(page.locator("[data-search-chips] [aria-current]")).toHaveCount(1);

		// A chip writes its category into the search, in place: no navigation,
		// ?q= through replaceState, and it is the one chip underlined.
		const before = await page.evaluate(() => history.length);
		await page.locator(chip("programming")).click();
		await expect(page.locator(SEARCH)).toHaveValue("programming");
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		expect(await page.evaluate(() => history.length)).toBe(before);
		await expect(page.locator(chip("programming"))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(chip(""))).not.toHaveAttribute("aria-current");
		// The accent underline follows (it fades over --duration-quick, so poll).
		await expect
			.poll(() =>
				chips.evaluateAll((as) => {
					const probe = document.createElement("div");
					probe.style.color = "var(--accent)";
					document.body.append(probe);
					const accent = getComputedStyle(probe).color;
					probe.remove();
					return as
						.filter((a) => getComputedStyle(a).borderBottomColor === accent)
						.map((a) => (a as HTMLElement).dataset.chip);
				}),
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
		await page.goto("/txt/?q=projects");
		await expect(page.locator(chip("projects"))).toHaveAttribute("aria-current", "page");
		await expect(page.locator(chip(""))).not.toHaveAttribute("aria-current");
		await expectCount(page, "1 of 5 posts");
	});
});

test.describe("instrument — the stepper", () => {
	const expectStep = async (page: Page, no: string, title: string, meta: RegExp) => {
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "no")).toHaveText(no);
		await expect(card(page, "title")).toHaveText(title);
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(1);
		await expect(page.locator(post(no))).toHaveAttribute("data-active", "");
		await expect.poll(() => ring(page, no)).toMatch(/inset/);
		await expect(page.locator(post(no))).toHaveAttribute("data-state", "lit");
		await expectFocus(page, no.slice(1), title, meta);
		await expect(page.locator(mark(no))).toHaveAttribute("data-focus", "");
		expect(under(await block(page), ...(await cellOf(page, no)))).toBe(false);
	};

	test("− and + walk the posts newest first — from rest − takes the newest, + the oldest — and wrap", async ({
		page,
	}) => {
		await page.goto("/txt/");
		await older(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		await older(page).click();
		await expectStep(page, "004", "Tahoe Mountain Hair", /jun 2025 · \d+ w/);
		await newer(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		await newer(page).click(); // past the newest: round to the oldest
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · \d+ w/);
		await older(page).click(); // past the oldest: round to the newest
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		// The focus followed the step to May 2023 and back.
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
	});

	test("a step holds while the pointer is elsewhere; Escape lets it go", async ({ page }) => {
		await page.goto("/txt/");
		await newer(page).click();
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · \d+ w/);
		await page.mouse.move(1, 1, { steps: 4 });
		await page.waitForTimeout(250);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2023-05"), 1);

		await page.keyboard.press("Escape");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		expect((await cells(page)).every((c) => c.state === "lit" && !c.active)).toBe(true);
		await expectFocus(page, "05", "Asserting on Agent Behavior");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
	});

	test("a hover previews another post over the step and leaving returns to it; typing clears it", async ({
		page,
	}) => {
		await page.goto("/txt/");
		await older(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		// 001 is faint under the lead's step (a gone tile — under the block,
		// or rolled so — takes no pointer, and 003 sits under the block here).
		await expect(page.locator(post("001"))).toHaveAttribute("data-state", "faint");
		await page.locator(`${post("001")} a`).hover();
		await expect(card(page, "title")).toHaveText("No Honey, We Have a Dashboard at Home");
		await expectFocus(page, "01", "No Honey, We Have a Dashboard at Home");
		// A preview, not a step: no ring on the hovered tile.
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(0);
		await page.mouse.move(1, 1, { steps: 4 });
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		await page.locator(SEARCH).fill("home");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		await expect(page.locator("[data-cell][data-active]")).toHaveCount(1);
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
	});

	test("under a filter the stepper walks the matches only and shows the card over the list", async ({
		page,
	}) => {
		await page.goto("/txt/?q=programming");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
		// The first result (005) is already the focus, so − is the older match:
		// 001 — 004, 003 and 002 are not programming.
		await older(page).click();
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · \d+ w/);
		await expect(card(page, "why")).toHaveText("MATCHED CATEGORY · PROGRAMMING");
		await newer(page).click();
		await expectStep(page, "005", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		await newer(page).click(); // round to the oldest match
		await expectStep(page, "001", "No Honey, We Have a Dashboard at Home", /may 2023 · \d+ w/);
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
		await page.goto("/txt/?q=recipes");
		await expect(newer(page)).toBeDisabled();
		await expect(older(page)).toBeDisabled();
		await page.locator(SEARCH).fill("");
		await expect(newer(page)).toBeEnabled();
	});
});

test.describe("instrument — the timeline", () => {
	// The foot docks on a desktop; on a phone the foot is in the flow and
	// the dock (the stepper's thin bar) is what sticks.
	for (const [width, height, sel] of [
		[1440, 600, ".blog__foot"],
		[390, 700, ".blog__dock"],
	] as const) {
		test(`docked at ${width}×${height} (${sel}): sticky to the window's bottom while the quilt scrolls under it, at rest after the quilt, before the footer`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			await page.goto("/txt/");
			const geo = () =>
				page.evaluate((sel) => {
					const dock = document.querySelector(sel)!;
					return {
						vh: document.documentElement.clientHeight,
						max: document.documentElement.scrollHeight - document.documentElement.clientHeight,
						dock: dock.getBoundingClientRect().toJSON(),
						quilt: document.querySelector("[data-quilt]")!.getBoundingClientRect().toJSON(),
						footer: document.querySelector('footer, [role="contentinfo"]')!.getBoundingClientRect().toJSON(),
						position: getComputedStyle(dock).position,
						z: getComputedStyle(dock).zIndex,
						panelZ: getComputedStyle(document.querySelector("[data-quilt-panel]")!).zIndex,
					};
				}, sel);
			const start = await geo();
			expect(start.position).toBe("sticky");
			// Above the tiles, below the panel (which is in flow on a phone).
			if (width >= 1024) expect(Number(start.z)).toBeLessThan(Number(start.panelZ));
			// The page scrolls, and at the top the quilt runs on under the dock.
			expect(start.max).toBeGreaterThan(0);
			expect(start.dock.bottom).toBeCloseTo(start.vh, 0);
			expect(start.quilt.bottom).toBeGreaterThan(start.dock.top);

			// Partway: still docked to the window's bottom edge.
			await page.evaluate(() => window.scrollTo(0, 16));
			await expect.poll(async () => (await geo()).dock.bottom).toBeCloseTo(start.vh, 0);

			// At the end: at rest in its own place after the quilt, clear of the
			// last row, and above the footer.
			await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
			await expect.poll(async () => (await geo()).dock.top).toBeGreaterThanOrEqual((await geo()).quilt.bottom);
			const end = await geo();
			expect(end.dock.top).toBeGreaterThanOrEqual(end.quilt.bottom);
			expect(end.dock.bottom).toBeLessThanOrEqual(end.footer.top);
		});
	}

	test("a slot per month over whole years, a named link per post in its month, a bar its words tall, the latest filled", async ({
		page,
	}) => {
		await page.goto("/txt/");
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
			["/txt/no-honey-we-have-a-dashboard-at-home/", "No Honey, We Have a Dashboard at Home, May 2023", "2023-05"],
			["/txt/why-i-joined-fisker/", "Your Car Knows You're Getting Sick, Jul 2024", "2024-07"],
			["/txt/mega-desk/", "The Mega Desk, Apr 2025", "2025-04"],
			["/txt/tahoe-mountain-hair/", "Tahoe Mountain Hair, Jun 2025", "2025-06"],
			["/txt/asserting-on-agent-behavior/", "Asserting on Agent Behavior, Feb 2026", "2026-02"],
		]);
		for (const a of await marks.all()) await expect(a).not.toHaveAttribute("data-dim");
		// A bar is taller than a plain tick, and the year labels sit under the Januaries.
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
		// THE BARS: each post's is as tall as its words say, against the
		// scale at the right — so the bars rank as the word counts in the
		// page's index do, and the tallest reaches the scale's top only if
		// it is the max.
		const bars = await page.evaluate(() => {
			const { posts } = JSON.parse(document.querySelector("script[data-quilt-index]")!.textContent!) as {
				posts: { no: number; words: number }[];
			};
			const words = new Map(posts.map((p) => [String(p.no).padStart(3, "0"), p.words]));
			const strip = document.querySelector("[data-quilt-ruler] .ds-time-ruler__strip")!.getBoundingClientRect();
			const scale = [...document.querySelectorAll("[data-quilt-ruler] .ds-time-ruler__scale .ds-mono")].map(
				(m) => m.textContent!.trim(),
			);
			return {
				scale,
				strip: strip.height,
				marks: [...document.querySelectorAll<HTMLElement>("[data-quilt-ruler] [data-mark]")].map((a) => {
					const after = getComputedStyle(a, "::after");
					return {
						no: a.dataset.no!,
						words: words.get(a.dataset.no!)!,
						height: parseFloat(after.height),
						fill: after.backgroundColor,
						border: after.borderTopWidth,
						focus: a.hasAttribute("data-focus"),
					};
				}),
			};
		});
		const max = Number(bars.scale[0]);
		expect(bars.scale[1]).toBe("0");
		expect(max % 100).toBe(0);
		expect(max).toBeGreaterThanOrEqual(Math.max(...bars.marks.map((m) => m.words)));
		expect(max - 100).toBeLessThan(Math.max(...bars.marks.map((m) => m.words)));
		const byWords = [...bars.marks].sort((a, b) => b.words - a.words);
		const byHeight = [...bars.marks].sort((a, b) => b.height - a.height);
		expect(byHeight.map((m) => m.no)).toEqual(byWords.map((m) => m.no));
		for (const m of bars.marks) {
			expect(m.height / bars.strip, m.no).toBeCloseTo(m.words / max, 1);
			expect(m.border).toBe("1px");
		}
		// The latest post is in focus at rest: its bar alone is filled, with
		// the accent; the others are outlines.
		const accent = await page.evaluate(() => {
			const probe = document.createElement("div");
			probe.style.color = "var(--accent)";
			document.body.append(probe);
			const c = getComputedStyle(probe).color;
			probe.remove();
			return c;
		});
		expect(bars.marks.filter((m) => m.focus).map((m) => m.no)).toEqual(["005"]);
		for (const m of bars.marks) {
			if (m.focus) expect(m.fill).toBe(accent);
			else expect(m.fill).toBe("rgba(0, 0, 0, 0)");
		}
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
		await expectFocus(page, "05", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
	});

	test("the focus moves to the post in focus: a hover, the active result, a step — the bar fills, the readout follows", async ({ page }) => {
		await page.goto("/txt/");
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(mark("003"))).toHaveAttribute("data-focus", "");
		await expect(page.locator(mark("005"))).not.toHaveAttribute("data-focus");
		await expect(page.locator(`${RULER} [data-mark][data-focus]`)).toHaveCount(1);
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2025-04"), 1);
		await expectFocus(page, "03", "The Mega Desk", /apr 2025 · \d+ w/);
		await page.mouse.move(1, 1, { steps: 4 });
		await expect(page.locator(mark("005"))).toHaveAttribute("data-focus", "");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2026-02"), 1);
		await expectFocus(page, "05", "Asserting on Agent Behavior", /feb 2026 · \d+ w/);
		// The fill fades in, not cuts: the bar's colour is transitioned.
		const transition = await page
			.locator(mark("005"))
			.evaluate((el) => getComputedStyle(el, "::after").transitionProperty);
		expect(transition).toMatch(/background-color/);

		await page.locator(SEARCH).fill("home");
		await expect(page.locator(mark("001"))).toHaveAttribute("data-focus", "");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2023-05"), 1);
		await page.locator(SEARCH).press("ArrowDown");
		await expect(page.locator(mark("003"))).toHaveAttribute("data-focus", "");
		await expect.poll(() => rulerAt(page)).toBeCloseTo(await atOf(page, "2025-04"), 1);
		await expectFocus(page, "03", "The Mega Desk", /apr 2025 · \d+ w/);
	});

	test("clicking a lit bar pins its post; under a filter the others dim and are not controls", async ({
		page,
	}) => {
		await page.goto("/txt/");
		await page.locator(mark("002")).click();
		await expect(page).toHaveURL(/\/txt\/?$/);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "title")).toHaveText("Your Car Knows You're Getting Sick");
		await expect(page.locator(post("002"))).toHaveAttribute("data-active", "");
		await expectFocus(page, "02", "Your Car Knows You're Getting Sick", /jul 2024 · \d+ w/);
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
		// A lit bar pins its post over the list.
		await page.locator(mark("001")).click();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "no")).toHaveText("001");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		// Clearing the filter lights every bar again.
		await page.locator(SEARCH).fill("");
		await expect(dim).toHaveCount(0);
	});
});

test.describe("instrument — the card", () => {
	test("the ruled card: the top strip, the number and its readouts, title, excerpt, the stat strip, READ", async ({
		page,
	}) => {
		await page.goto("/txt/");
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
		await expect(card(page, "link")).toHaveAttribute("href", "/txt/mega-desk/");
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

		// Another post refills every field (from rest: the block over the
		// desk's hover covers the lead, which takes no pointer while gone).
		await page.mouse.move(1, 1);
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "hidden");
		await page.locator(`${post("005")} a`).hover();
		await expect(card(page, "no")).toHaveText("005");
		await expect(card(page, "index")).toHaveText("[index] 000005 · log_005.txt");
		await expect(card(page, "category")).toHaveText("programming");
		await expect(card(page, "node")).toHaveText("programming");
		await expect(card(page, "month")).toHaveText("feb");
		await expect(card(page, "year")).toHaveText("2026");
	});

	test("the block is the board's: the card keeps its share of the board at 1440 and at 1920", async ({ page }) => {
		const measure = async (width: number, height: number) => {
			await page.setViewportSize({ width, height });
			await page.goto("/txt/");
			await page.locator(`${post("003")} a`).hover();
			await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
			return page.locator(PANEL).evaluate((p) => {
				const r = p.getBoundingClientRect();
				const board = document.querySelector("[data-quilt]")!.getBoundingClientRect();
				const t = p.querySelector('[data-card="title"]')!;
				return { w: r.width, h: r.height, board: board.width, title: parseFloat(getComputedStyle(t).fontSize) };
			});
		};
		const a = await measure(1440, 1000);
		const b = await measure(1920, 1100);
		// The board runs the full page, so the card grows with it: the same
		// 3x2 cells, the same share of the board, its type stepping up (never
		// down) with the block.
		expect(a.w).toBeGreaterThan(600);
		expect(a.h).toBeGreaterThan(230);
		expect(b.w).toBeGreaterThan(a.w);
		expect(b.w / b.board).toBeCloseTo(a.w / a.board, 2);
		expect(b.title).toBeGreaterThanOrEqual(a.title);
	});

});

test.describe("instrument — the count", () => {
	test("a live region for a reader, never drawn: 5 posts at rest, N of 5 posts while filtering", async ({ page }) => {
		await page.goto("/txt/");
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
		await expectReadout(page, "05");
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
				ring: box(".ds-search-bar__ring"),
				readout: box("[data-search-readout]"),
				chips: box("[data-search-chips]"),
				chipsScroll: (() => {
					const n = document.querySelector<HTMLElement>("[data-search-chips]")!;
					return { overflowX: getComputedStyle(n).overflowX, scrollable: n.scrollWidth > n.clientWidth + 1 };
				})(),
			};
		});
	/** The foot's parts, as boxes; a hidden part is null. */
	const footBoxes = (page: Page) =>
		page.evaluate(() => {
			const box = (sel: string) => {
				const el = document.querySelector<HTMLElement>(sel);
				return el && el.checkVisibility() ? el.getBoundingClientRect().toJSON() : null;
			};
			return {
				foot: box("[data-quilt-foot]")!,
				key: box(".blog__key"),
				timeline: box("[data-quilt-ruler]")!,
				focus: box(".blog__focus")!,
				numeral: box('.blog__focus [data-focus="no"]')!,
				older: box('.blog__focus [data-step="older"]'),
				newer: box('.blog__focus [data-step="newer"]'),
				progress: box('.blog__foot > [data-focus="progress"]'),
				code: box(".blog__code")!,
				dock: box("[data-quilt-dock]"),
				dockOlder: box('[data-quilt-dock] [data-step="older"]'),
				dockNewer: box('[data-quilt-dock] [data-step="newer"]'),
			};
		});
	const mid = (r: DOMRect) => r.y + r.height / 2;

	test("desktop (1440): the input row — the ring, the input, the readout, the hint — then the tabs row; the foot in three: key | timeline | focus with the stepper", async ({ page }) => {
		await page.goto("/txt/");
		const b = await barBoxes(page);
		for (const r of [b.ring, b.readout]) expect(Math.abs(mid(r) - mid(b.input))).toBeLessThanOrEqual(2);
		expect(b.input.x).toBeGreaterThanOrEqual(b.ring.x + b.ring.width - 1);
		expect(b.readout.x).toBeGreaterThanOrEqual(b.input.x + b.input.width - 1);
		// The tabs on their own row under the input, from the ring's edge, on one line.
		expect(b.chips.y).toBeGreaterThanOrEqual(b.input.y + b.input.height - 1);
		expect(b.chips.x).toBeCloseTo(b.ring.x, 0);
		expect(b.chips.height).toBeLessThan(b.input.height);
		// The input keeps most of the bar: no stepper in the row.
		expect(b.input.width).toBeGreaterThan(b.bar.width / 2);
		expect(await page.locator(`${BAR} [data-step]`).count()).toBe(0);
		await expect(page.locator(`${BAR} .ds-search-bar__hint`)).toBeVisible();
		await expect(page.locator(`${BAR} .ds-search-bar__hint`)).toHaveText("/");

		// The foot: the key, the timeline and the focus on one row, left to
		// right; the circled stepper at the focus cell's right edge, the
		// ring's size (round); the corner marks under — the progress bar at
		// the left, the code at the right.
		const f = await footBoxes(page);
		expect(f.key).not.toBeNull();
		expect(Math.abs(f.key!.y - f.timeline.y)).toBeLessThanOrEqual(8);
		expect(Math.abs(f.focus.y - f.timeline.y)).toBeLessThanOrEqual(8);
		expect(f.timeline.x).toBeGreaterThan(f.key!.x + f.key!.width);
		expect(f.focus.x).toBeGreaterThan(f.timeline.x + f.timeline.width);
		expect(f.timeline.width).toBeGreaterThan(f.key!.width);
		expect(f.timeline.width).toBeGreaterThan(f.focus.width);
		expect(f.older).not.toBeNull();
		expect(f.older!.x).toBeGreaterThan(f.numeral.x + f.numeral.width);
		expect(f.newer!.x).toBeGreaterThan(f.older!.x);
		expect(f.newer!.x + f.newer!.width).toBeCloseTo(f.foot.x + f.foot.width, 0);
		expect(f.older!.width).toBeCloseTo(b.ring.width, 0);
		expect(
			await page.locator('.blog__focus [data-step="older"]').evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
		).toMatch(/^(9999px|50%)$/);
		expect(f.progress).not.toBeNull();
		expect(f.progress!.y).toBeGreaterThan(f.key!.y + f.key!.height);
		expect(f.progress!.x).toBeCloseTo(f.key!.x, 0);
		// (The caps voice pulls its phantom tracking back past the edge by a px or so.)
		expect(Math.abs(f.code.x + f.code.width - (f.foot.x + f.foot.width))).toBeLessThanOrEqual(2);
		expect(f.code.y).toBeGreaterThan(f.focus.y + f.focus.height - 1);
		await expect(page.locator(".blog__code")).toHaveText("TXT-A/01");
		// The dock is a phone's: not drawn here, and its stepper out of the
		// tree — one visible stepper.
		expect(f.dock).toBeNull();
		expect(await page.locator("[data-quilt-dock]").evaluate((el) => getComputedStyle(el).display)).toBe("none");
		await expect(older(page)).toHaveCount(1);
		await expect(newer(page)).toHaveCount(1);
		expect(await page.locator('[data-step="older"]').count()).toBe(2);
	});

	test("tablet (900): three columns, every entry labelled; the chips on their own row under the input; the foot's key and focus side by side over the timeline", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 900, height: 1100 });
		await page.goto("/txt/");
		expect(await page.locator("[data-instrument] > .blog__row").count()).toBe(3);
		expect(
			await page.locator("[data-quilt]").evaluate((q) => getComputedStyle(q).gridTemplateColumns.split(" ").length),
		).toBe(3);
		const texts = await page
			.locator("[data-cell]")
			.evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => (e as HTMLElement).innerText.trim()));
		expect(texts).toHaveLength(9);
		// A label row on every entry — a post's number and title, a filler's
		// tag — and no other text on a tile but the lead's excerpt.
		for (const t of texts) expect(t.split("\n")[0]).toMatch(LABEL);
		expect(texts.filter((t) => /^F_\d{2}$/.test(t))).toHaveLength(4);
		const b = await barBoxes(page);
		expect(b.chips.y).toBeGreaterThanOrEqual(b.input.y + b.input.height - 1);
		// Out to the bar's right edge (and a focus ring's step past its left).
		expect(b.chips.x + b.chips.width).toBeCloseTo(b.bar.x + b.bar.width, 0);
		expect(b.chips.width).toBeGreaterThanOrEqual(b.bar.width - 1);
		expect(b.input.width).toBeGreaterThan(b.bar.width / 2);
		expect(await overflow(page)).toBeLessThanOrEqual(0);
		// The foot in two rows: the key and the focus (with the stepper) side
		// by side, the timeline the full width under them; in the flow, not
		// docked. One visible stepper, the foot's.
		const f = await footBoxes(page);
		expect(f.key).not.toBeNull();
		expect(Math.abs(f.key!.y - f.focus.y)).toBeLessThanOrEqual(8);
		expect(f.focus.x).toBeGreaterThan(f.key!.x + f.key!.width);
		expect(f.timeline.y).toBeGreaterThan(Math.max(f.key!.y + f.key!.height, f.focus.y + f.focus.height) - 1);
		expect(f.timeline.width).toBeCloseTo(f.foot.width, 0);
		expect(f.older).not.toBeNull();
		expect(f.dock).toBeNull();
		await expect(older(page)).toHaveCount(1);
		expect(await page.locator("[data-quilt-foot]").evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
		await page.locator(`${post("003")} a`).hover();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(card(page, "link")).toBeVisible();
		expect(await overflow(page)).toBeLessThanOrEqual(0);
	});

	test("phone (390): the chips scroll sideways under the input, the whole placeholder in the input, labels on the entries, the timeline compact, the stepper in the dock alone", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 1000 });
		await page.goto("/txt/");
		await page.evaluate(() => document.fonts.ready);
		const b = await barBoxes(page);
		expect(b.chips.y).toBeGreaterThanOrEqual(b.input.y + b.input.height - 1);
		expect(b.chipsScroll.overflowX).toBe("auto");
		expect(b.chipsScroll.scrollable).toBe(true);
		// The row fades out at its right edge: more tabs past it.
		expect(
			await page.locator("[data-search-chips]").evaluate((n) => {
				const cs = getComputedStyle(n);
				return cs.maskImage || cs.webkitMaskImage;
			}),
		).toContain("linear-gradient");
		// The input is set at 16px so iOS does not zoom the page on focus.
		expect(await page.locator(SEARCH).evaluate((i) => getComputedStyle(i).fontSize)).toBe("16px");
		// With the stepper out of the row the input has its width back: the
		// placeholder fits whole (measured in the input's own font).
		const fit = await page.locator(SEARCH).evaluate((i: HTMLInputElement) => {
			const ctx = document.createElement("canvas").getContext("2d")!;
			ctx.font = getComputedStyle(i).font;
			return { text: ctx.measureText(i.placeholder).width, room: i.clientWidth };
		});
		expect(fit.text).toBeLessThan(fit.room);
		expect(b.input.width).toBeGreaterThan(b.bar.width * 0.7);
		// A tap-list needs its titles: the label row, the number and the
		// title and nothing else, on every entry.
		await expect(page.locator(`${post("003")} .ds-quilt-cell__label`)).toBeVisible();
		await expect(page.locator(`${post("003")} .ds-quilt-cell__label`)).toHaveText(/03\s*The Mega Desk/);
		// The timeline is drawn shorter than on a desktop, with its years and
		// its scale.
		const strip = (await page.locator(`${RULER} .ds-time-ruler__strip`).boundingBox())!;
		expect(strip.height).toBeLessThanOrEqual(49);
		await expect(page.locator(`${RULER} .ds-time-ruler__year`).first()).toBeVisible();
		await expect(page.locator(`${RULER} .ds-time-ruler__scale`)).toBeVisible();
		expect(await overflow(page)).toBeLessThanOrEqual(0);

		// The foot in the flow: the timeline over the readout, no key, no
		// stepper (display: none, out of the tab order) — and the DOCK: the
		// progress line, −, the post in focus on one line, +, drawn at the
		// window's bottom edge. The one visible stepper is the dock's.
		const f = await footBoxes(page);
		expect(f.key).toBeNull();
		expect(f.older).toBeNull();
		expect(f.progress).toBeNull();
		expect(f.focus.y).toBeGreaterThan(f.timeline.y + f.timeline.height - 1);
		expect(await page.locator(".blog__stepper").evaluate((el) => getComputedStyle(el).display)).toBe("none");
		expect(f.dock).not.toBeNull();
		expect(f.dock!.bottom).toBeCloseTo(1000, 0);
		expect(f.dock!.height).toBeLessThan(80);
		expect(f.dockOlder).not.toBeNull();
		expect(f.dockNewer!.x).toBeGreaterThan(f.dockOlder!.x + f.dockOlder!.width);
		await expect(older(page)).toHaveCount(1);
		await expect(page.locator(`${DOCK} [data-step="older"]`)).toBeVisible();
		const now = page.locator(`${DOCK} .blog__dock-now`);
		await expect(now).toHaveText(/^05 · Asserting on Agent Behavior$/);
		expect((await now.boundingBox())!.x).toBeGreaterThan(f.dockOlder!.x + f.dockOlder!.width);
		expect((await now.boundingBox())!.x + (await now.boundingBox())!.width).toBeLessThanOrEqual(f.dockNewer!.x);
		expect(await now.evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");
		expect(await page.locator(`${DOCK} [data-focus="progress"]`).evaluate((el) => el.style.getPropertyValue("--progress"))).toBe("1");

		// A step from the dock shows the card in flow above the list, the
		// stepped tile outlined; the dock's line and the foot's readout follow.
		await newer(page).click();
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
		await expect(page.locator(PANEL)).toBeVisible();
		await expect(card(page, "no")).toHaveText("001");
		await expect(page.locator(post("001"))).toHaveAttribute("data-active", "");
		await expect(card(page, "link")).toBeVisible();
		await expect(now).toHaveText(/^01 · No Honey, We Have a Dashboard at Home$/);
		await expectFocus(page, "01", "No Honey, We Have a Dashboard at Home", /may 2023 · \d+ w/);
		await expect(focus(page, "position")).toHaveText("1 / 5");
		expect(await page.locator(`${DOCK} [data-focus="progress"]`).evaluate((el) => el.style.getPropertyValue("--progress"))).toBe("0.2");
		expect(await overflow(page)).toBeLessThanOrEqual(0);
	});

	test("no horizontal overflow at any width, at rest and with the card open", async ({ page }) => {
		for (const width of [1920, 1440, 1280, 1024, 900, 768, 640, 480, 390, 360]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto("/txt/");
			expect(await overflow(page), `${width} at rest`).toBeLessThanOrEqual(0);
			await older(page).click();
			await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "card");
			expect(await overflow(page), `${width} stepped`).toBeLessThanOrEqual(0);
		}
	});
});

test.describe("instrument — the foot", () => {
	test("the topic key: every category with its two-digit count, a link to its query; a click sets the query in place", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const rows = page.locator("[data-quilt-key] a");
		expect(
			await rows.evaluateAll((as) =>
				as.map((a) => [a.getAttribute("href"), (a as HTMLElement).innerText.replace(/\s+/g, " ").trim()]),
			),
		).toEqual([
			["/txt/?q=programming", "PROGRAMMING 02"],
			["/txt/?q=projects", "PROJECTS 01"],
			["/txt/?q=thoughts", "THOUGHTS 01"],
			["/txt/?q=personal", "PERSONAL 01"],
		]);
		// The rows lead: a dotted line from the label to the count.
		expect(
			await rows.first().locator(".ds-legend__label").evaluate((el) => getComputedStyle(el, "::after").borderBottomStyle),
		).toBe("dotted");
		await rows.first().click();
		await expect(page).toHaveURL(/\/txt\/?\?q=programming$/);
		await expect(page.locator(SEARCH)).toHaveValue("programming");
		await expect(page.locator(chip("programming"))).toHaveAttribute("aria-current", "page");
		await expectCount(page, "2 of 5 posts");
		await expect(page.locator(PANEL)).toHaveAttribute("data-mode", "results");
	});

	test("the in-focus readout: the number as the labels draw it, the title, the month and words; the position and the progress follow a step and count the matches under a filter", async ({
		page,
	}) => {
		await page.goto("/txt/");
		const progress = () =>
			page.locator(`${FOOT} [data-focus="progress"]`).evaluate((el) => el.style.getPropertyValue("--progress"));
		await expectFocus(page, "05", "Asserting on Agent Behavior", /^feb 2026 · \d+ w$/);
		await expect(focus(page, "position")).toHaveText("5 / 5");
		expect(await progress()).toBe("1");
		// The number is the big thin numeral, the title the ink, the meta a step back.
		const inks = await page.evaluate(() => {
			const ink = (sel: string) => getComputedStyle(document.querySelector(sel)!).color;
			const numeral = getComputedStyle(document.querySelector('[data-quilt-foot] [data-focus="no"]')!.closest(".ds-stat__numeral")!);
			const probe = (v: string) => {
				const p = document.createElement("div");
				p.style.color = `var(${v})`;
				document.body.append(p);
				const c = getComputedStyle(p).color;
				p.remove();
				return c;
			};
			return {
				title: ink('[data-quilt-foot] [data-focus="title"]'),
				meta: ink('[data-quilt-foot] [data-focus="meta"]'),
				primary: probe("--text-primary"),
				tertiary: probe("--text-tertiary"),
				numeral: { size: parseFloat(numeral.fontSize), weight: numeral.fontWeight },
			};
		});
		expect(inks.title).toBe(inks.primary);
		expect(inks.meta).toBe(inks.tertiary);
		expect(inks.numeral.size).toBeGreaterThanOrEqual(40);
		expect(Number(inks.numeral.weight)).toBeLessThanOrEqual(300);

		await newer(page).click(); // from rest + takes the oldest
		await expectFocus(page, "01", "No Honey, We Have a Dashboard at Home", /^may 2023 · \d+ w$/);
		await expect(focus(page, "position")).toHaveText("1 / 5");
		expect(await progress()).toBe("0.2");
		await newer(page).click();
		await expectFocus(page, "02", "Your Car Knows You're Getting Sick", /^jul 2024 · \d+ w$/);
		await expect(focus(page, "position")).toHaveText("2 / 5");
		expect(await progress()).toBe("0.4");
		// The dock's copy says the same (hidden here, but written all the same).
		await expect(page.locator(`${DOCK} [data-focus="no"]`)).toHaveText("02");

		// Under a filter the place is among the matches.
		await page.locator(SEARCH).fill("programming");
		await expect(focus(page, "position")).toHaveText("2 / 2");
		await expectFocus(page, "05", "Asserting on Agent Behavior");
		expect(await progress()).toBe("1");
		await older(page).click();
		await expectFocus(page, "01", "No Honey, We Have a Dashboard at Home");
		await expect(focus(page, "position")).toHaveText("1 / 2");
		expect(await progress()).toBe("0.5");
		// Nothing matches: nothing to place, the newest post still named.
		await page.locator(SEARCH).fill("zzz");
		await expect(focus(page, "position")).toHaveText("0 / 0");
		expect(await progress()).toBe("0");
	});

	test("one stepper per viewport: the foot's on a desktop and a tablet, the dock's on a phone; the other is display: none", async ({
		page,
	}) => {
		const visible = () =>
			page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>('[data-step="older"]')].map((b) => ({
					where: b.closest("[data-quilt-dock]") ? "dock" : "foot",
					// The copy that is not drawn is display: none with its box
					// (the dock, or the foot's stepper row), not merely unseen.
					display: getComputedStyle(b.closest("[data-quilt-dock], .blog__stepper")!).display,
					shown: b.checkVisibility(),
				})),
			);
		for (const [width, where] of [
			[1440, "foot"],
			[900, "foot"],
			[390, "dock"],
		] as const) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto("/txt/");
			const v = await visible();
			expect(v, String(width)).toHaveLength(2);
			expect(v.filter((b) => b.shown).map((b) => b.where), String(width)).toEqual([where]);
			expect(v.find((b) => !b.shown)!.display, String(width)).toBe("none");
			await expect(older(page)).toHaveCount(1);
			// Tab never lands on the hidden one: from the foot's numeral
			// onwards the next buttons are the shown copy.
			await older(page).focus();
			await expect(older(page)).toBeFocused();
		}
	});
});

test.describe("quilt — accessibility", () => {
	test("search landmark, combobox and listbox semantics, a live count", async ({ page }) => {
		await page.goto("/txt/");
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
