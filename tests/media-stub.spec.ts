import { readFile } from "node:fs/promises";
import { test, expect, MEDIA_BASE, type Page, type Response } from "./fixtures/test";

/**
 * THE SUITE NEVER STREAMS FROM THE LIVE MEDIA HOST.
 *
 * Every request for https://media.tristantimblin.dev is answered by the
 * fixture (tests/fixtures/test.ts) from a local clip, marked `x-media-stub`.
 * A response without that header came from the network: the suite would be
 * downloading the real videos and counting in the site's Cloudflare stats.
 */

test.use({ viewport: { width: 1440, height: 900 } });

function watchMedia(page: Page): Response[] {
	const responses: Response[] = [];
	page.on("response", (response) => {
		if (response.url().startsWith(MEDIA_BASE)) responses.push(response);
	});
	return responses;
}

test("the stubbed host is the site's media host", async () => {
	const source = await readFile(new URL("../src/lib/media.ts", import.meta.url), "utf8");
	expect(source).toContain(`"${MEDIA_BASE}"`);
});

test("the home page's videos come from the stub", async ({ page }) => {
	const responses = watchMedia(page);
	await page.goto("/");
	await expect(page.locator("dotted-grid.hero__video")).toHaveAttribute("data-ready", "true", {
		timeout: 15_000,
	});
	// Scroll down the page, so anything that loads on approach asks too.
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(1000);

	expect(responses.length, "the page asked for its videos").toBeGreaterThan(0);
	for (const response of responses) {
		expect(response.headers()["x-media-stub"], response.url()).toBe("1");
	}
});

test("a context the spec makes itself is stubbed too", async ({ browser, baseURL }) => {
	const context = await browser.newContext({ baseURL, reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const responses = watchMedia(page);
	await page.goto("/");
	await expect(page.locator("dotted-grid.hero__video")).toHaveAttribute("data-ready", "true", {
		timeout: 15_000,
	});
	expect(responses.length).toBeGreaterThan(0);
	for (const response of responses) {
		expect(response.headers()["x-media-stub"], response.url()).toBe("1");
	}
	await context.close();
});
