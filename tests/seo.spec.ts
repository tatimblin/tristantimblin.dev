import { test, expect, type Page } from "@playwright/test";

/**
 * THE SOCIAL AND ARTICLE META (src/components/Seo.astro). A post is an
 * article: its dates and tags as article:* meta. A post with a picture — a
 * custom card or its hero — gets the large card, described by imageAlt or
 * the hero's alt; everything else gets the small square card.
 */
const meta = (page: Page, key: string) =>
	page.locator(`meta[property="${key}"], meta[name="${key}"]`);

test("a post with a hero: article meta, the large card, the hero's alt", async ({ page }) => {
	await page.goto("/txt/asserting-on-agent-behavior/");
	await expect(meta(page, "og:type")).toHaveAttribute("content", "article");
	await expect(meta(page, "article:published_time")).toHaveAttribute(
		"content",
		"2026-02-02T00:00:00.000Z",
	);
	await expect(meta(page, "article:tag")).toHaveCount(4);
	await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary_large_image");
	await expect(meta(page, "og:image:alt")).toHaveAttribute("content", /^Aptitude in the terminal/);
	await expect(meta(page, "twitter:image:alt")).toHaveAttribute("content", /^Aptitude in the terminal/);
	// The canonical is the URL the site links to.
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		"https://tristantimblin.dev/txt/asserting-on-agent-behavior/",
	);
});

test("a post without a picture, and a page: the small card, no article meta", async ({ page }) => {
	await page.goto("/txt/why-i-joined-fisker/");
	await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary");
	await expect(meta(page, "og:image")).toHaveAttribute("content", /\/og-small\.jpg$/);

	await page.goto("/");
	await expect(meta(page, "og:type")).toHaveAttribute("content", "website");
	await expect(meta(page, "article:published_time")).toHaveCount(0);
	await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary");
});
