import { test, expect, type Page } from "./fixtures/test";

/**
 * THE VIDEOS CARD PUTS ITS CHROME ON AS IT DOCKS (src/widgets/videos): the bare
 * clip floats in the opener, and over the end of the dock a frame, header and
 * footer fade in on the same scroll timeline that moves it. Only the overlay's
 * opacity changes, so the clip keeps its whole cell.
 */

const DESKTOP = { width: 1440, height: 900 };

async function open(page: Page, viewport = DESKTOP) {
	await page.setViewportSize(viewport);
	await page.goto("/");
	await page
		.locator(".wx-videos[data-widget-state=mounted] video-carousel[data-ready]")
		.first()
		.waitFor({ state: "attached", timeout: 15_000 });
}

const chrome = (page: Page) =>
	page.evaluate(() => {
		const el = document.querySelector<HTMLElement>(".wx-videos__chrome")!;
		return Number(getComputedStyle(el).opacity);
	});

const scrollTo = async (page: Page, y: number) => {
	await page.evaluate((v) => window.scrollTo(0, v), y);
	await page.waitForTimeout(250);
};

/** The dock's resolved travel, in px: --vc-dock-travel on a probe. */
const travel = (page: Page) =>
	page.evaluate(() => {
		const host = document.querySelector<HTMLElement>(".wx-videos")!;
		const probe = document.createElement("div");
		probe.style.cssText = "position:absolute;visibility:hidden;height:var(--vc-dock-travel)";
		host.appendChild(probe);
		const h = probe.getBoundingClientRect().height;
		probe.remove();
		return h;
	});

test("the floating clip is bare; the chrome is on once the dock has landed", async ({ page }) => {
	await open(page);
	const end = await travel(page);
	expect(await chrome(page), "floating at scroll 0").toBe(0);
	await scrollTo(page, Math.floor(end) - 100);
	expect(await chrome(page), "still floating, well before the fade").toBe(0);
	await scrollTo(page, Math.floor(end) - 24);
	const mid = await chrome(page);
	expect(mid, "fading mid-way through its run").toBeGreaterThan(0.2);
	expect(mid).toBeLessThan(0.8);
	await scrollTo(page, Math.ceil(end));
	expect(await chrome(page), "docked").toBe(1);
	await scrollTo(page, 3000);
	expect(await chrome(page), "past the dock").toBe(1);
});

for (const viewport of [DESKTOP, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
	test(`the fade starts with the card within a few px of its cell, and ends docked (${viewport.width}×${viewport.height})`, async ({
		page,
	}) => {
		await open(page, viewport);
		const end = await travel(page);
		const run = await page.evaluate(() => {
			const host = document.querySelector<HTMLElement>(".wx-videos")!;
			const probe = document.createElement("div");
			probe.style.cssText = "position:absolute;visibility:hidden;height:var(--vc-chrome-run)";
			host.appendChild(probe);
			const h = probe.getBoundingClientRect().height;
			probe.remove();
			return h;
		});
		const offsetAt = async (y: number) => {
			await scrollTo(page, y);
			return page.evaluate(
				() => new DOMMatrix(getComputedStyle(document.querySelector(".wx-videos")!).transform).m42,
			);
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
		content: `.home { min-block-size: 0 !important; padding-block-end: 0 !important; }
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
	const end = await travel(page);
	expect(state.max, "the page must end before the travel for this to mean anything").toBeLessThan(end);
	expect(state.max).toBeGreaterThan(48);
	await expect
		.poll(() => page.evaluate(() => window.scrollY))
		.toBe(state.max);
	await expect.poll(() => chrome(page), { message: "the chrome lands at the page's end" }).toBe(1);
	const lift = await page.evaluate(
		() => new DOMMatrix(getComputedStyle(document.querySelector(".wx-videos")!).transform).m42,
	);
	expect(lift, "and the dock with it").toBeCloseTo(0, 0);
	await scrollTo(page, state.max - 24);
	const mid = await chrome(page);
	expect(mid, "fading over the last 48px of the page").toBeGreaterThan(0.2);
	expect(mid).toBeLessThan(0.8);
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
	await page.locator(".wx-videos__wide .vc__ruler").focus();
	expect(await chrome(page)).toBe(1);
});

test("the header is the same band as its neighbours, and names the selected clip", async ({ page }) => {
	await open(page);
	await scrollTo(page, 800);
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
				stageHeight: document.querySelector(".wx-videos .vc__grid")!.getBoundingClientRect().height,
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
	expect(Math.abs(header.stageHeight - header.card.height), "the clip keeps the cell").toBeLessThan(1);

	// A keyboard step selects the next clip; the header follows.
	const wide = page.locator(".wx-videos__wide");
	const before = await wide.locator(".vc__ruler").getAttribute("aria-valuetext");
	await wide.locator(".vc__ruler").focus();
	await wide.locator(".vc__ruler").press("ArrowDown");
	const after = await wide.locator(".vc__ruler").getAttribute("aria-valuetext");
	expect(after).not.toBe(before);
	await expect(wide.locator("[data-vc-desc]")).toHaveText(after!.split(" — ")[0]);
	await expect(wide.locator("[data-vc-loc]")).toHaveText(after!.split(" — ")[1]);
	await expect(wide.locator("[data-vc-date]")).toHaveText(after!.split(" — ")[2]);
});

test("the footer sits on the card's foot, location left and date right", async ({ page }) => {
	await open(page);
	await scrollTo(page, 3000);
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
	const ruler = page.locator(".wx-videos__wide .vc__ruler");
	const box = await ruler.boundingBox();
	const card = await page.locator(".wx-videos").boundingBox();
	expect(box!.x, "in the gutter, outside the card").toBeGreaterThanOrEqual(card!.x + card!.width);
	const before = await ruler.getAttribute("aria-valuenow");
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.down();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 - 120, { steps: 6 });
	await page.mouse.up();
	expect(await ruler.getAttribute("aria-valuenow")).not.toBe(before);
});
