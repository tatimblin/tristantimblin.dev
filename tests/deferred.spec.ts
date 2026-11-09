import { test, expect, lockupReady, type Page } from "./fixtures/test";
import { VIDEOS } from "./fixtures/opener";

/**
 * ONLY THE HALFTONE A BREAKPOINT SHOWS EXISTS.
 *
 * The homepage has one <dotted-grid>: the videos card's carousel. It has two
 * variants, one per step of the widget grid (src/widgets/videos/Videos.astro) —
 * four columns, with the date ruler out in the gutter; two columns, with no
 * ruler, at 1× — and each is <Deferred> (src/components/Deferred.astro): its
 * markup is a <template> until its breakpoint's media query matches, so the
 * variant the breakpoint hides never makes a WebGL context or downloads a clip.
 *
 * What must hold for that to be invisible:
 *   - the right variant exists at load, upgraded, before anything else asks for it;
 *   - crossing the breakpoint later creates the newly shown variant;
 *   - a view-transition round trip leaves exactly one, not a second copy.
 */

/** WebGL contexts the page creates, counted from before any script runs. */
async function countGl(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { __gl: number };
		w.__gl = 0;
		const orig = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
			const ctx = (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
			if (/webgl/.test(type) && ctx && !this.dataset.glCounted) {
				this.dataset.glCounted = "";
				w.__gl++;
			}
			return ctx;
		} as typeof orig;
	});
}

const grids = (page: Page) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll("dotted-grid"))
			.map((el) => (el.closest(".wx-videos__compact") ? "compact" : el.closest(".wx-videos__wide") ? "wide" : "other"))
			.sort()
	);

const ready = lockupReady;

test.describe("deferred halftones", () => {
	test("a phone creates only the compact carousel", async ({ page }) => {
		await countGl(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await ready(page);
		await page.waitForTimeout(1000);

		expect(await grids(page)).toEqual(["compact"]);
		await expect(page.locator(`${VIDEOS.compact}[data-ready]`)).toHaveCount(1);
		expect(await page.evaluate(() => (window as unknown as { __gl: number }).__gl)).toBe(1);
	});

	test("a desktop creates only the wide carousel", async ({ page }) => {
		await countGl(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await ready(page);
		await page.waitForTimeout(1000);

		expect(await grids(page)).toEqual(["wide"]);
		await expect(page.locator(VIDEOS.compact)).toHaveCount(0);
		expect(await page.evaluate(() => (window as unknown as { __gl: number }).__gl)).toBe(1);
	});

	test("crossing the breakpoint creates the variant it now shows", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await ready(page);
		expect(await grids(page)).toEqual(["wide"]);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator(`${VIDEOS.compact}[data-ready]`)).toHaveCount(1);
		await expect(page.locator(VIDEOS.compact)).toBeVisible();
		// The wide variant stays, hidden by its CSS.
		expect(await grids(page)).toEqual(["compact", "wide"]);
		await expect(page.locator(VIDEOS.wide)).toBeHidden();
	});

	test("a view-transition round trip leaves one", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await ready(page);

		// Dispatched, not locator.click(): see reveal.spec.ts test 6.
		await page.evaluate(() => {
			Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
				.find((a) => a.textContent?.trim() === "Writing")
				?.click();
		});
		await page.waitForURL("**/txt/");
		await page.goBack();
		await ready(page);
		await page.waitForTimeout(500);

		expect(await grids(page)).toEqual(["wide"]);
		await expect(page.locator(`${VIDEOS.wide} dotted-grid canvas`)).toHaveCount(1);
	});

	test("without JavaScript no halftone is created", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		await page.goto("/");
		expect(await grids(page)).toEqual([]);
		await context.close();
	});
});
