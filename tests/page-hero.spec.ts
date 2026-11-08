import { test, expect } from "./fixtures/test";

/**
 * THE SECTION HERO (PageHero, on /txt and /about): the fabric halftone
 * over the page's title, persisted across the client router so moving between
 * the section pages keeps the picture running instead of rebuilding it — the
 * same element, the same canvas (so the same WebGL context), the intro not
 * replayed.
 */

test("the halftone carries over between /txt and /about", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/txt/");
	await expect(page.locator(".page-hero h1")).toHaveText("Writing");
	await page.locator(".page-hero__grid[data-ready]").waitFor({ state: "attached" });

	await page.evaluate(() => {
		const grid = document.querySelector(".page-hero__grid") as HTMLElement & { __kept?: boolean };
		grid.__kept = true;
		(grid.querySelector("canvas") as HTMLCanvasElement & { __kept?: boolean }).__kept = true;
	});
	const kept = () =>
		page.evaluate(() => {
			const grid = document.querySelector(".page-hero__grid") as HTMLElement & { __kept?: boolean };
			const canvas = grid.querySelector("canvas") as (HTMLCanvasElement & { __kept?: boolean }) | null;
			return { element: !!grid.__kept, canvas: !!canvas?.__kept, ready: grid.hasAttribute("data-ready") };
		});

	await page.getByRole("link", { name: "About Me" }).click();
	await page.waitForURL("**/about/");
	await expect(page.locator(".page-hero h1")).toHaveText("About Me");
	expect(await kept()).toEqual({ element: true, canvas: true, ready: true });

	await page.getByRole("link", { name: "Writing" }).click();
	await page.waitForURL("**/txt/");
	await expect(page.locator(".page-hero h1")).toHaveText("Writing");
	expect(await kept()).toEqual({ element: true, canvas: true, ready: true });
});
