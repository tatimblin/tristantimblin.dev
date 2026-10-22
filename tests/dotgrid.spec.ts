import { test, expect } from "./fixtures/test";

/**
 * THE /dotgrid PLAYGROUND wires its controls on astro:page-load, so they work
 * however the page is reached. Its module script runs once per session: on a
 * second ClientRouter visit it does not run again, so wiring at its top level
 * left the controls dead.
 */
test("the controls drive the grid on a second client-side visit", async ({ page }) => {
	// Any same-origin link is intercepted by ClientRouter; add one to the page.
	const go = async (href: string) => {
		await page.evaluate((to) => {
			const a = document.createElement("a");
			a.href = to;
			a.id = "go";
			a.textContent = to;
			document.body.prepend(a);
		}, href);
		await page.locator("#go").click();
		await expect(page).toHaveURL(new RegExp(`${href}$`));
	};
	await page.goto("/dotgrid/");
	await go("/txt/");
	await go("/dotgrid/");
	const slider = page.locator('input[data-attr="cell-size"]');
	await slider.fill("12");
	await expect(page.locator("dotted-grid[data-hero]")).toHaveAttribute("cell-size", "12");
});
