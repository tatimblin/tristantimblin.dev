import { test, expect } from "./fixtures/test";

/**
 * THE 404 PAGE. Astro emits dist/404.html, which Cloudflare Pages (and
 * `astro preview`) serve for any URL the site does not have, with a 404
 * status. Without the file, Pages treats the deploy as a single-page app and
 * answers a miss with the homepage and a 200.
 */
test("an unknown URL gets the 404 page, noindex, with a way back", async ({ page }) => {
	const res = await page.goto("/no-such-page-here/");
	expect(res?.status()).toBe(404);
	await expect(page.locator("h1")).toHaveText("Nothing here");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	await expect(page.locator("main a[href='/']")).toBeVisible();
	await expect(page.locator("main a[href^='/txt']")).toBeVisible();
});
