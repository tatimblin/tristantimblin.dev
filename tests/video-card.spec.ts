import { test, expect, type Page } from "./fixtures/test";
import { VIDEOS, cardLength, dockLift, dockTravel, openHome, scrollAndSettle } from "./fixtures/opener";

/**
 * THE VIDEOS CARD PUTS ITS CHROME ON AS IT DOCKS (src/widgets/videos): the bare
 * clip floats in the opener, and over the end of the dock a frame, header and
 * footer fade in on the same scroll timeline that moves it. Only the overlay's
 * opacity changes, so the clip stays one size, between the header and footer.
 */

const DESKTOP = { width: 1440, height: 900 };

async function open(page: Page, viewport = DESKTOP) {
	await openHome(page, viewport.width, viewport.height);
	await page
		.locator(`${VIDEOS.card}[data-widget-state=mounted] video-carousel[data-ready]`)
		.first()
		.waitFor({ state: "attached", timeout: 15_000 });
}

const chrome = (page: Page) =>
	page.evaluate(() => {
		// Four columns: the date fades with the frame, the label and location stay
		// on (below). Two: the whole layer fades.
		const el = document.querySelector<HTMLElement>(".wx-videos__date, .wx-videos__compact .wx-videos__chrome")!;
		return Number(getComputedStyle(el).opacity);
	});

test("the floating clip is bare; the chrome is on once the dock has landed", async ({ page }) => {
	await open(page);
	const end = await dockTravel(page);
	expect(await chrome(page), "floating at scroll 0").toBe(0);
	await scrollAndSettle(page, Math.floor(end) - 100);
	expect(await chrome(page), "still floating, well before the fade").toBe(0);
	await scrollAndSettle(page, Math.floor(end) - 24);
	const mid = await chrome(page);
	expect(mid, "fading mid-way through its run").toBeGreaterThan(0.2);
	expect(mid).toBeLessThan(0.8);
	await scrollAndSettle(page, Math.ceil(end));
	expect(await chrome(page), "docked").toBe(1);
	await scrollAndSettle(page, 3000);
	expect(await chrome(page), "past the dock").toBe(1);
});

for (const viewport of [DESKTOP, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
	test(`the fade starts with the card within a few px of its cell, and ends docked (${viewport.width}×${viewport.height})`, async ({
		page,
	}) => {
		await open(page, viewport);
		const end = await dockTravel(page);
		const run = await cardLength(page, "--vc-chrome-run");
		const offsetAt = async (y: number) => {
			await scrollAndSettle(page, y);
			return dockLift(page);
		};
		const atStart = Math.abs(await offsetAt(Math.ceil(end - run)));
		expect(atStart, "off its cell as the chrome starts").toBeLessThanOrEqual(6);
		expect(await chrome(page), "and only just beginning to fade").toBeLessThanOrEqual(0.05);
		expect(await offsetAt(Math.ceil(end)), "landed as the chrome finishes").toBeCloseTo(0, 0);
		expect(await chrome(page)).toBe(1);
	});
}

test("where the page ends before the travel does, the chrome lands with the dock there", async ({
	page,
}) => {
	await open(page);
	// Cut the page down to a few hundred px of scroll: the 100% half of min(travel, 100%).
	await page.addStyleTag({
		content: `.home { padding-block-end: 0 !important; }
			.home .ds-widget-grid > :not(stories-heading):not(.wx-videos) { display: none !important; }
			.wx-videos { grid-row: 2 / span 1 !important; block-size: 40px; }
			footer, .site-footer { display: none !important; }`,
	});
	await page.waitForTimeout(200);
	const state = await page.evaluate(() => {
		const root = document.documentElement;
		const max = root.scrollHeight - window.innerHeight;
		window.scrollTo(0, max);
		return { max };
	});
	const end = await dockTravel(page);
	expect(state.max, "the page must end before the travel for this to mean anything").toBeLessThan(end);
	expect(state.max).toBeGreaterThan(48);
	await expect
		.poll(() => page.evaluate(() => window.scrollY))
		.toBe(state.max);
	await expect.poll(() => chrome(page), { message: "the chrome lands at the page's end" }).toBe(1);
	expect(await dockLift(page), "and the dock with it").toBeCloseTo(0, 0);
	await scrollAndSettle(page, state.max - 24);
	const mid = await chrome(page);
	expect(mid, "fading over the last 48px of the page").toBeGreaterThan(0.2);
	expect(mid).toBeLessThan(0.8);
});

/** The canvas, and the real chrome around it, at scroll offset `y`. */
const boxes = (page: Page, y: number) =>
	page.evaluate(async (v) => {
		window.scrollTo(0, v);
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		const rect = (s: string) => {
			const r = document.querySelector(s)!.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
		};
		const grid = document.querySelector<HTMLElement>(".wx-videos dotted-grid")!;
		const canvas = grid.querySelector("canvas")!;
		return {
			card: rect(".wx-videos"),
			grid: rect(".wx-videos dotted-grid"),
			canvas: rect(".wx-videos dotted-grid canvas"),
			buffer: `${canvas.width}x${canvas.height}`,
			head: rect(".wx-videos__chrome .ds-card-header"),
			foot: rect(".wx-videos__foot"),
		};
	}, y);

for (const viewport of [DESKTOP, { width: 1920, height: 1200 }, { width: 390, height: 844 }, { width: 900, height: 1200 }]) {
	test(`the canvas is the box between the header and footer, one size across the scroll (${viewport.width}×${viewport.height})`, async ({
		page,
	}) => {
		await open(page, viewport);
		await page.locator(`${VIDEOS.grid} canvas`).first().waitFor({ state: "attached" });
		const end = Math.ceil(await dockTravel(page));
		// A few sizes of scroll, floating to well past the dock: the canvas never changes size.
		const positions = [0, Math.round(end / 2), end - 24, end, end + 400];
		const states = [];
		for (const y of positions) states.push(await boxes(page, y));
		const base = states[0];
		for (const [i, s] of states.entries()) {
			expect(Math.abs(s.grid.height - base.grid.height), `height at ${positions[i]}`).toBeLessThan(0.5);
			expect(Math.abs(s.grid.width - base.grid.width), `width at ${positions[i]}`).toBeLessThan(0.5);
			expect(s.buffer, `drawing buffer at ${positions[i]}`).toBe(base.buffer);
			expect(Math.abs(s.canvas.height - s.grid.height), "the canvas fills its box").toBeLessThan(1);
			expect(Math.abs(s.canvas.width - s.grid.width), "the canvas fills its box").toBeLessThan(1);
			// The chrome's edges at every offset, opacity aside: exactly between them,
			// floating and docked, with no gap and no overlap.
			expect(Math.abs(s.grid.y - s.head.bottom), `under the header at ${positions[i]}`).toBeLessThan(0.75);
			expect(Math.abs(s.grid.bottom - s.foot.y), `on the footer at ${positions[i]}`).toBeLessThan(0.75);
			expect(Math.abs(s.grid.width - s.card.width), "the full width of the cell").toBeLessThan(1);
		}
		// The card's landing is unchanged, and the bands come from the real chrome.
		const docked = states[3];
		expect(Math.abs(docked.head.y - docked.card.y), "the header on the card's top edge").toBeLessThanOrEqual(1.5);
		const bands = {
			head: await cardLength(page, "--vc-head-band"),
			foot: await cardLength(page, "--vc-foot-band"),
		};
		expect(Math.abs(bands.head - (docked.grid.y - docked.card.y)), "the stated header band").toBeLessThan(0.75);
		expect(Math.abs(bands.foot - (docked.card.bottom - docked.grid.bottom)), "the stated footer band").toBeLessThan(0.75);
	});
}

test("a 9:16 clip shows its full width: the box is at least as wide as the clip", async ({ page }) => {
	for (const viewport of [DESKTOP, { width: 390, height: 844 }]) {
		await open(page, viewport);
		const { grid } = await boxes(page, 0);
		// Cover-mapped (the clips are 9:16, <dotted-grid>'s coverUv), the frame is
		// trimmed only on the axis where the box is longer than 9:16 relative to it.
		expect(grid.width / grid.height, `${viewport.width}: the box is wider than 9:16`).toBeGreaterThanOrEqual(9 / 16);
		expect((9 / 16) / (grid.width / grid.height), "only a slight top/bottom trim").toBeGreaterThan(0.85);
	}
});

test("reduced motion and print show the chrome", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await open(page);
	expect(await chrome(page), "reduced motion").toBe(1);
	await page.emulateMedia({ reducedMotion: "no-preference", media: "print" });
	await page.waitForTimeout(100);
	expect(await chrome(page), "print").toBe(1);
});

test("focus on the ruler brings the floating chrome on", async ({ page }) => {
	await open(page);
	expect(await chrome(page)).toBe(0);
	await page.locator(`${VIDEOS.wide} .vc__ruler`).focus();
	expect(await chrome(page)).toBe(1);
});

for (const state of ["floating", "docked"] as const) {
	test(`the ruler's years are hidden at rest and come on with the ruler (${state})`, async ({ page }) => {
		await open(page);
		if (state === "docked") await scrollAndSettle(page, Math.ceil(await dockTravel(page)));
		const ruler = page.locator(`${VIDEOS.wide} .vc__ruler`);
		const year = ruler.locator(".vc__tick-year").first();
		await expect(year).toHaveCSS("opacity", "0");

		// Before any mouse input, so a scripted focus counts as keyboard focus.
		await ruler.focus();
		await expect(year).toHaveCSS("opacity", "1");
		await ruler.evaluate((el: HTMLElement) => el.blur());
		await expect(year).toHaveCSS("opacity", "0");

		const box = (await ruler.boundingBox())!;
		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		const hit = await page.evaluate(
			([px, py]) => !!document.elementFromPoint(px, py)?.closest(".wx-videos__wide .vc__ruler"),
			[x, y],
		);
		expect(hit, "the pointer lands on the ruler").toBe(true);
		await page.mouse.move(x, y);
		await expect(year).toHaveCSS("opacity", "1");

		// A scrub holds them when the pointer strays, and a click leaves no focus cue.
		await page.mouse.down();
		await page.mouse.move(x, y - 40, { steps: 4 });
		await page.mouse.move(box.x - 200, y - 40, { steps: 4 });
		await expect(ruler).toHaveClass(/is-dragging/);
		await expect(year).toHaveCSS("opacity", "1");
		await page.mouse.up();
		await page.mouse.move(0, 0);
		await expect(year).toHaveCSS("opacity", "0");
	});
}

test("the ruler's years keep their place, stay on in print, and do not fade under reduced motion", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await open(page);
	const year = page.locator(`${VIDEOS.wide} .vc__tick-year`).first();
	await expect(year).toHaveCSS("opacity", "0");
	await expect(year).toHaveCSS("transition-duration", "0s");
	await expect(year).toBeAttached();
	expect((await year.boundingBox())!.width, "the label keeps its box").toBeGreaterThan(0);
	await page.emulateMedia({ reducedMotion: "no-preference", media: "print" });
	await expect(year).toHaveCSS("opacity", "1");
});

test("the header is the same band as its neighbours, and names the selected clip", async ({ page }) => {
	await open(page);
	await scrollAndSettle(page, 800);
	await page
		.locator("[data-widget='now-playing'][data-reveal-state='in']")
		.waitFor({ state: "attached" });
	const measure = () =>
		page.evaluate(() => {
			const box = (el: Element) => el.getBoundingClientRect().toJSON();
			const own = document.querySelector(".wx-videos__chrome .ds-card-header")!;
			const sibling = document.querySelector("[data-widget='now-playing'] .ds-card-header")!;
			const card = document.querySelector(".wx-videos")!;
			return {
				own: box(own),
				sibling: box(sibling),
				card: box(card),
				figcaptions: document.querySelectorAll(".wx-videos__wide figcaption").length,
			};
		});
	// The sibling's entrance is a settle, so its rect is read once it has come to rest.
	await expect
		.poll(async () => {
			const m = await measure();
			return Math.abs(m.own.top - m.sibling.top) < 1 && Math.abs(m.own.bottom - m.sibling.bottom) < 1;
		}, { message: "the header band lines up with now playing's" })
		.toBe(true);
	const header = await measure();
	expect(header.figcaptions, "the clip is named once").toBe(1);

	// A keyboard step selects the next clip; the header follows.
	const wide = page.locator(VIDEOS.wide);
	const before = await wide.locator(".vc__ruler").getAttribute("aria-valuetext");
	await wide.locator(".vc__ruler").focus();
	await wide.locator(".vc__ruler").press("ArrowDown");
	const after = await wide.locator(".vc__ruler").getAttribute("aria-valuetext");
	expect(after).not.toBe(before);
	await expect(wide.locator("[data-vc-desc]")).toHaveText(after!.split(" — ")[0]);
	await expect(wide.locator("[data-vc-loc]")).toHaveText(after!.split(" — ")[1]);
	await expect(wide.locator("[data-vc-date]")).toHaveText(after!.split(" — ")[2]);
});

test("floating, the clip keeps its label and location where the docked card has them", async ({ page }) => {
	await open(page);
	const read = () =>
		page.evaluate(() => {
			const card = document.querySelector(".wx-videos")!.getBoundingClientRect();
			const field = (s: string) => {
				const el = document.querySelector(`.wx-videos__wide ${s}`)!;
				const r = el.getBoundingClientRect();
				let opacity = 1;
				for (let n: Element | null = el; n && !n.matches(".wx-videos"); n = n.parentElement) {
					opacity *= Number(getComputedStyle(n).opacity);
				}
				return { opacity, x: r.x - card.x, y: r.y - card.y };
			};
			return {
				label: field("[data-vc-desc]"),
				location: field("[data-vc-loc]"),
				frame: Number(getComputedStyle(document.querySelector(".wx-videos__wide .wx-videos__surface")!).opacity),
			};
		});
	const floating = await read();
	expect(floating.frame, "no frame yet").toBe(0);
	expect(floating.label.opacity).toBe(1);
	expect(floating.location.opacity).toBe(1);

	await scrollAndSettle(page, 3000);
	const docked = await read();
	expect(docked.frame, "framed once docked").toBe(1);
	for (const key of ["label", "location"] as const) {
		expect(Math.abs(docked[key].x - floating[key].x), `${key} x`).toBeLessThan(1);
		expect(Math.abs(docked[key].y - floating[key].y), `${key} y`).toBeLessThan(1);
	}
});

test("the footer sits on the card's foot, location left and date right", async ({ page }) => {
	await open(page);
	await scrollAndSettle(page, 3000);
	const foot = await page.evaluate(() => {
		const q = (s: string) => document.querySelector(`.wx-videos__wide ${s}`)!.getBoundingClientRect();
		return {
			foot: q(".wx-videos__foot"),
			loc: q(".wx-videos__loc"),
			date: q(".wx-videos__date"),
			cardBottom: document.querySelector(".wx-videos")!.getBoundingClientRect().bottom,
		};
	});
	expect(Math.abs(foot.foot.bottom - foot.cardBottom)).toBeLessThan(2);
	expect(foot.loc.right).toBeLessThanOrEqual(foot.date.left + 1);
});

test("the ruler keeps its gutter and scrubs while the card floats", async ({ page }) => {
	await open(page);
	const ruler = page.locator(`${VIDEOS.wide} .vc__ruler`);
	const box = await ruler.boundingBox();
	const card = await page.locator(VIDEOS.card).boundingBox();
	expect(box!.x, "in the gutter, outside the card").toBeGreaterThanOrEqual(card!.x + card!.width);
	// Its span stays the whole cell (the stage's), not the shorter clip: it lines up
	// with the docked frame, and its ends fade out so it reads fine beside the bare clip.
	expect(Math.abs(box!.height - card!.height), "the ruler spans the cell").toBeLessThan(1);
	const before = await ruler.getAttribute("aria-valuenow");
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.down();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 - 120, { steps: 6 });
	await page.mouse.up();
	expect(await ruler.getAttribute("aria-valuenow")).not.toBe(before);
});
