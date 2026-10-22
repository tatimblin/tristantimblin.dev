import { test, expect, type Page } from "./fixtures/test";
import { assetBase, realDist, serveEmbed, src } from "./fixtures/embed-route";

/**
 * <Embed>: A POSTER THAT BECOMES THE REAL THING NEAR THE VIEWPORT.
 *
 * The inline form (a figure in a post) is used by no published post yet, so
 * the production build renders it in the /design-system catalogue; that is
 * where these tests look at it. The full-screen form is a demo page's stage
 * (tests/demo.spec.ts). Every test routes the bundle's bucket
 * (tests/fixtures/embed-route.ts).
 *
 * What a reader would never notice going wrong, and so what is asserted:
 *  1. The module loading before the frame is anywhere near the screen.
 *  2. A live embed left running (or a canvas left behind) after it has
 *     scrolled far away: destroy() must run and the stage must be emptied.
 *  3. A failed import covering the poster with an empty box.
 */

const PAGE = "/design-system/";

const frame = (page: Page) => page.locator("#embed [data-embed]");

test.describe("Embed", () => {
	test("shows the poster and loads nothing until it nears the viewport", async ({ page }) => {
		const requests = await serveEmbed(page);
		await page.goto(PAGE);
		await expect(frame(page)).toHaveAttribute("data-state", "poster");
		await expect(frame(page).locator("img")).toHaveAttribute("alt", /Sutro Tower/);
		await page.waitForTimeout(500);
		expect(requests, "the module loaded while the frame was screens away").toEqual([]);
	});

	test("imports and mounts on approach, destroys when far away", async ({ page }) => {
		// The real scene renders on a software GL in headless Chromium: seconds a frame.
		if (realDist) test.slow();
		const requests = await serveEmbed(page);
		await page.goto(PAGE);
		await frame(page).scrollIntoViewIfNeeded();

		await expect(frame(page)).toHaveAttribute("data-state", "live", { timeout: 15_000 });
		const canvas = frame(page).locator("[data-embed-stage] canvas");
		await expect(canvas).toHaveCount(1);
		const box = await canvas.boundingBox();
		const frameBox = await frame(page).boundingBox();
		expect(box!.width).toBeGreaterThan(frameBox!.width - 4);
		expect(requests[0]).toBe(src);
		if (!realDist) {
			expect(await page.evaluate(() => (window as any).__embedStub)).toEqual({
				mounts: 1,
				destroys: 0,
				assetBase,
			});
		} else {
			// The real scene: a WebGL canvas, and its textures fetched from the asset base.
			expect(await canvas.evaluate((c: HTMLCanvasElement) => Boolean(c.getContext("webgl2")))).toBe(true);
			await expect.poll(() => requests.filter((u) => u.includes("/textures/")).length).toBe(3);
		}
		// The poster stays underneath, for the next unmount.
		await expect(frame(page).locator("img")).toBeAttached();

		// Back to the top: the frame is now many screens away.
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
		await expect(frame(page)).toHaveAttribute("data-state", "poster");
		await expect(canvas).toHaveCount(0);
		if (!realDist) expect(await page.evaluate(() => (window as any).__embedStub.destroys)).toBe(1);
	});

	test("keeps the poster when the import fails", async ({ page }) => {
		await page.route(`${assetBase}**`, (route) => route.abort());
		await page.goto(PAGE);
		await frame(page).scrollIntoViewIfNeeded();
		await expect(frame(page)).toHaveAttribute("data-state", "failed");
		await expect(frame(page).locator("[data-embed-stage]")).toBeEmpty();
		const poster = frame(page).locator("img");
		await expect(poster).toBeVisible();
		await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
	});

	test.describe("under reduced motion", () => {
		test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: "reduce" }));

		test("mounts an embed that has a still frame", async ({ page }) => {
			await serveEmbed(page);
			await page.goto(PAGE);
			await frame(page).scrollIntoViewIfNeeded();
			await expect(frame(page)).toHaveAttribute("data-state", "live", { timeout: 15_000 });
		});

		test("keeps the poster for one without", async ({ page }) => {
			const requests = await serveEmbed(page);
			await page.goto(PAGE);
			await frame(page).evaluate((el: HTMLElement) => delete el.dataset.stillFrame);
			await frame(page).scrollIntoViewIfNeeded();
			await page.waitForTimeout(500);
			await expect(frame(page)).toHaveAttribute("data-state", "poster");
			expect(requests).toEqual([]);
		});
	});
});
