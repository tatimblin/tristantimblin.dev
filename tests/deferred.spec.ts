import { test, expect, MEDIA_BASE, type Page } from "./fixtures/test";

/**
 * ONLY THE HALFTONES A BREAKPOINT SHOWS EXIST.
 *
 * The homepage has three <dotted-grid>s — the desktop fabric, the phone hero carousel
 * and the footer widget's carousel — and each breakpoint hides one or two of them. A
 * hidden grid used to be merely `display: none`: it still created its WebGL context and
 * downloaded its video. Now each is <Deferred> (src/components/Deferred.astro): its
 * markup is a <template> until its breakpoint's media query matches, so a phone makes
 * one WebGL context instead of three and a desktop two.
 *
 * What must hold for that to be invisible:
 *   - the right variants exist at load, upgraded, before anything else asks for them;
 *   - crossing the breakpoint later creates the newly shown variant;
 *   - a view-transition round trip leaves exactly one of each, not a second copy.
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
		Array.from(document.querySelectorAll("dotted-grid")).map((el) =>
			el.closest(".hero-carousel") ? "hero carousel" : el.classList.contains("hero__video") ? "fabric" : "widget"
		).sort()
	);

/** Media requests (the halftones' clips), by file stem. */
function watchMedia(page: Page): string[] {
	const seen: string[] = [];
	page.on("request", (r) => {
		if (r.url().startsWith(MEDIA_BASE)) seen.push(r.url().split("/").pop()!.split(".")[0]);
	});
	return seen;
}

const ready = (page: Page) => page.locator("stories-heading[data-ready]").waitFor({ state: "attached" });

test.describe("deferred halftones", () => {
	test("a phone creates only the hero carousel", async ({ page }) => {
		await countGl(page);
		const media = watchMedia(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await ready(page);
		await page.waitForTimeout(1000);

		expect(await grids(page)).toEqual(["hero carousel"]);
		await expect(page.locator(".hero-carousel[data-ready]")).toHaveCount(1);
		expect(await page.evaluate(() => (window as unknown as { __gl: number }).__gl)).toBe(1);
		// The fabric clip is the desktop scene's; the phone never asks for it.
		expect(media).not.toContain("fabric");
	});

	test("a desktop creates the fabric and the widget's carousel", async ({ page }) => {
		await countGl(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await ready(page);
		await page.evaluate(() => document.querySelector(".home__widgets")?.scrollIntoView());
		await page.waitForTimeout(1000);

		expect(await grids(page)).toEqual(["fabric", "widget"]);
		await expect(page.locator(".hero-carousel")).toHaveCount(0);
		expect(await page.evaluate(() => (window as unknown as { __gl: number }).__gl)).toBe(2);
	});

	test("crossing the breakpoint creates the variant it now shows", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await ready(page);
		expect(await grids(page)).toEqual(["fabric", "widget"]);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator(".hero-carousel[data-ready]")).toHaveCount(1);
		await expect(page.locator(".hero-carousel .vc__ruler")).toBeVisible();
		// The desktop variants stay, hidden by their CSS as before.
		expect(await grids(page)).toEqual(["fabric", "hero carousel", "widget"]);
		await expect(page.locator("dotted-grid.hero__video")).toBeHidden();
	});

	test("a view-transition round trip leaves one of each", async ({ page }) => {
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

		expect(await grids(page)).toEqual(["fabric", "widget"]);
		await expect(page.locator("dotted-grid.hero__video canvas")).toHaveCount(1);
	});

	test("without JavaScript no halftone is created", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		await page.goto("/");
		expect(await grids(page)).toEqual([]);
		await context.close();
	});
});
