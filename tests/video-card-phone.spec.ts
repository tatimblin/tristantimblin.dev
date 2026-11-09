import { test, expect, type Page } from "./fixtures/test";
import { VIDEOS, dockTravel, openHome } from "./fixtures/opener";
import clips from "../src/data/video-clips.json" with { type: "json" };

/**
 * THE COMPACT VIDEOS CARD (src/widgets/videos): on a touch phone the footer is a
 * scrubber, the ruler laid over it, one tick per clip, over one line that shows
 * the date as a clip changes and held through a scrub, then the location. It
 * takes input only once docked. Real touch through CDP: a vertical pan starting
 * on the band must scroll the page and leave the clip alone.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function open(page: Page) {
	await openHome(page);
	await page
		.locator(`${VIDEOS.compact}[data-ready]`)
		.waitFor({ state: "attached", timeout: 15_000 });
	await page.locator(`${VIDEOS.card}[data-widget-state=mounted]`).waitFor({ state: "attached", timeout: 15_000 });
}

const dock = async (page: Page) => {
	await page.evaluate((v) => window.scrollTo(0, v), Math.ceil(await dockTravel(page)) + 2);
	await page.locator(`${VIDEOS.card}[data-vc-docked]`).waitFor({ state: "attached" });
};

const ruler = (page: Page) => page.locator(`${VIDEOS.compact} .vc__ruler`);
const value = (page: Page) => ruler(page).getAttribute("aria-valuenow");

const lineState = (page: Page) =>
	page.evaluate(() => {
		const line = document.querySelector(".wx-videos__line")!;
		const op = (s: string) => Number(getComputedStyle(line.querySelector(s)!).opacity);
		return { date: op("[data-vc-date]"), loc: op("[data-vc-loc]"), scrub: "scrub" in (line as HTMLElement).dataset };
	});

async function touchDrag(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	{ steps = 12, hold = false }: { steps?: number; hold?: boolean } = {},
) {
	const cdp = await page.context().newCDPSession(page);
	const send = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) =>
		cdp.send("Input.dispatchTouchEvent", {
			type,
			touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y), id: 1 }] : [],
		});
	await send("touchStart", from);
	for (let i = 1; i <= steps; i++) {
		await send("touchMove", {
			x: from.x + ((to.x - from.x) * i) / steps,
			y: from.y + ((to.y - from.y) * i) / steps,
		});
		await page.waitForTimeout(16);
	}
	const end = () => send("touchEnd");
	if (hold) return end;
	await end();
}

test("the ruler lays over the footer, the clip sits between the header and footer, the phone's DPR cap stands", async ({ page }) => {
	await open(page);
	await dock(page);
	await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.querySelector(".wx-videos__compact .vc__ruler")!).opacity))).toBe(1);
	const m = await page.evaluate(() => {
		const r = (s: string) => document.querySelector(s)!.getBoundingClientRect().toJSON();
		const grid = document.querySelector<HTMLElement>(".wx-videos__compact .vc__grid")!;
		const canvas = grid.querySelector("canvas")!;
		return {
			card: r(".wx-videos"),
			grid: r(".wx-videos__compact .vc__grid"),
			ruler: r(".wx-videos__compact .vc__ruler"),
			foot: r(".wx-videos__foot"),
			head: r(".wx-videos__chrome .ds-card-header"),
			canvas: r(".wx-videos__compact .vc__grid canvas"),
			canvasRatio: canvas.width / grid.clientWidth,
			canvasRatioH: canvas.height / grid.clientHeight,
			cell: grid.getAttribute("cell-size"),
			ticks: document.querySelectorAll(".wx-videos__compact .vc__strip .vc__tick").length,
			years: document.querySelectorAll(".wx-videos__compact .vc__tick-year").length,
		};
	});
	expect(Math.abs(m.grid.y - m.head.bottom), "the clip starts under the header").toBeLessThan(0.75);
	expect(Math.abs(m.grid.bottom - m.foot.y), "and ends on the footer").toBeLessThan(0.75);
	expect(Math.abs(m.grid.width - m.card.width), "the whole width of the cell").toBeLessThan(1);
	expect(Math.abs(m.canvas.height - m.grid.height), "the canvas fills that box, not the old cell").toBeLessThan(1);
	expect(m.cell).toBe("4");
	expect(m.canvasRatio, "the phone tile is rendered at 1×").toBeLessThanOrEqual(1);
	expect(m.canvasRatioH, "in both axes").toBeLessThanOrEqual(1.01);
	expect(Math.abs(m.ruler.bottom - m.card.bottom), "the ruler sits on the card's foot").toBeLessThan(1);
	expect(Math.abs(m.ruler.top - m.foot.top), "and covers the footer").toBeLessThanOrEqual(2);
	expect(m.ticks, "one tick per clip").toBe(clips.length);
	expect(m.years, "an even axis has no years").toBe(0);
});

test("while floating, the band takes no input and is out of reach", async ({ page }) => {
	await open(page);
	const box = (await ruler(page).boundingBox())!;
	expect(await ruler(page).evaluate((el) => (el as HTMLElement).inert), "inert while floating").toBe(true);
	const before = await value(page);
	await touchDrag(page, { x: box.x + box.width - 20, y: box.y + 12 }, { x: box.x + 20, y: box.y + 12 });
	await page.waitForTimeout(200);
	expect(await value(page), "a drag on the floating tile does nothing").toBe(before);
	const hit = await page.evaluate(
		({ x, y }) => document.elementFromPoint(x, y)?.closest(".vc__ruler") ?? null,
		{ x: box.x + box.width / 2, y: box.y + 12 },
	);
	expect(hit, "hit-testing skips the ruler").toBeNull();
});

test("a horizontal drag scrubs and holds the date; it returns to the location after release", async ({ page }) => {
	await open(page);
	await dock(page);
	const box = (await ruler(page).boundingBox())!;
	const before = await value(page);
	const y = box.y + 12;
	const end = (await touchDrag(
		page,
		{ x: box.x + box.width - 16, y },
		{ x: box.x + 16, y },
		{ hold: true },
	))!;
	await page.waitForTimeout(120);
	expect(await value(page), "the drag changes the clip").not.toBe(before);
	const held = await lineState(page);
	expect(held.date, "the date is held through the scrub").toBe(1);
	expect(held.loc).toBe(0);
	expect(held.scrub).toBe(true);
	await end();
	await page.waitForTimeout(600);
	const after = await lineState(page);
	expect(after.scrub, "released").toBe(false);
	expect(after.date, "the date still up for about a second").toBeGreaterThan(0.9);
	// Its line goes back to the location after the second and the fade.
	await expect
		.poll(async () => (await lineState(page)).loc, { timeout: 2500, message: "the location comes back" })
		.toBe(1);
	expect((await lineState(page)).date).toBe(0);
});

test("a vertical pan that starts on the band scrolls the page and leaves the clip alone", async ({ page }) => {
	await open(page);
	await dock(page);
	const box = (await ruler(page).boundingBox())!;
	const before = await value(page);
	const y0 = await page.evaluate(() => window.scrollY);
	// Slightly off vertical, as a thumb is; held at the start so it is a pan.
	await touchDrag(page, { x: box.x + box.width / 2, y: box.y + 40 }, { x: box.x + box.width / 2 + 6, y: box.y - 210 });
	await page.waitForTimeout(300);
	const y1 = await page.evaluate(() => window.scrollY);
	expect(y1 - y0, "the page scrolled").toBeGreaterThan(100);
	expect(await value(page), "the clip did not change").toBe(before);
	expect((await lineState(page)).loc, "no flash of the date").toBe(1);
});

test("the line starts on the location, even after the chrome fades in", async ({ page }) => {
	await open(page);
	await dock(page);
	await page.waitForTimeout(300);
	const state = await lineState(page);
	expect(state.loc).toBe(1);
	expect(state.date).toBe(0);
});

test("a clip change shows the date for a second, then the location", async ({ page }) => {
	await open(page);
	await dock(page);
	await ruler(page).focus();
	const before = await value(page);
	await ruler(page).press("ArrowRight");
	expect(await value(page)).not.toBe(before);
	await expect.poll(async () => (await lineState(page)).date, { message: "the date comes up" }).toBeGreaterThan(0.9);
	await expect
		.poll(async () => (await lineState(page)).loc, { timeout: 3000, message: "the location lands" })
		.toBe(1);
	const rest = await lineState(page);
	expect(rest.date).toBe(0);
});

test("a clip with no location stays on the date", async ({ page }) => {
	await open(page);
	await dock(page);
	const target = clips.findIndex((c) => !c.location);
	expect(target).toBeGreaterThan(0);
	await ruler(page).focus();
	for (let i = 0; i < target; i++) await ruler(page).press("ArrowRight");
	expect(await value(page)).toBe(String(target));
	await page.waitForTimeout(1800);
	const state = await lineState(page);
	expect(state.date, "still on the date").toBe(1);
	await expect(page.locator(".wx-videos__line [data-vc-date]")).toHaveText(clips[target].date);
});

test("reduced motion: the chrome and the ruler are on, and the swap is a cut", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await open(page);
	await page.locator(`${VIDEOS.card}[data-vc-docked]`).waitFor({ state: "attached" });
	expect(await ruler(page).evaluate((el) => (el as HTMLElement).inert), "usable at once").toBe(false);
	const chrome = await page.evaluate(() => ({
		chrome: getComputedStyle(document.querySelector(".wx-videos__chrome")!).opacity,
		ruler: getComputedStyle(document.querySelector(".wx-videos__compact .vc__ruler")!).opacity,
	}));
	expect(chrome).toEqual({ chrome: "1", ruler: "1" });
	await ruler(page).focus();
	await ruler(page).press("ArrowRight");
	// step-end: never a half-way opacity.
	const samples = await page.evaluate(async () => {
		const date = document.querySelector(".wx-videos__line [data-vc-date]")!;
		const out: number[] = [];
		for (let i = 0; i < 20; i++) {
			out.push(Number(getComputedStyle(date).opacity));
			await new Promise((r) => setTimeout(r, 60));
		}
		return out;
	});
	expect(samples.every((v) => v === 0 || v === 1), `samples: ${samples.join(",")}`).toBe(true);
});
