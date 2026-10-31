import { test, expect } from "./fixtures/test";

/**
 * CREDITS & PRIVACY. The footer carries one small link to /credits/ and no
 * credit or analytics wording of its own; the page holds the privacy note
 * (GoatCounter) and the data credits (Cinemoo, TMDB's required sentence).
 */

test("the footer links once to /credits/, with no GoatCounter or TMDB text inline", async ({ page }) => {
	await page.goto("/txt/");
	const footer = page.locator(".site-footer");
	await expect(footer.locator('a[href="/credits/"]')).toHaveCount(1);
	await expect(footer.locator('a[href="/credits/"]')).toHaveText("Credits & privacy");
	await expect(footer).not.toContainText(/goatcounter|tmdb|cinemoo/i);
	await expect(footer.locator('a[href="/privacy/"]')).toHaveCount(0);
});

test("/credits/ holds the privacy note and the data credits", async ({ page }) => {
	await page.goto("/credits/");
	await expect(page.locator("h1")).toHaveText("Credits & privacy");
	await expect(page.locator('meta[name="hit-path"]')).toHaveAttribute("content", "/credits/");

	const privacy = page.locator('[data-credits="privacy"]');
	await expect(privacy).toContainText("GoatCounter");
	await expect(privacy).toContainText(/without cookies/i);
	await expect(privacy.locator('a[href="https://www.goatcounter.com"]')).toHaveCount(1);

	const data = page.locator('[data-credits="data"]');
	await expect(data.locator('a[href="https://cinemoo.app"]')).toHaveCount(1);
	await expect(data).toContainText(/watch history comes from Cinemoo/i);
	await expect(data.locator('a[href="https://www.themoviedb.org"]')).toHaveCount(1);
	await expect(data).toContainText("This product uses the TMDB API but is not endorsed or certified by TMDB.");
});
