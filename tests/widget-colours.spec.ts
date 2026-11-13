import { test, expect } from "./fixtures/test";

/**
 * THE WIDGETS' DATA COLOURS. Two widgets mirror charts people already read in
 * colour, so they carry it: the GitHub grid in GitHub's own greens (the
 * --contrib-* ramp, through the tile grid's --tile-N hooks), and Volo in the
 * same greens — so the two read as one family — with a playoff loss in
 * --negative. Pinned per theme to the values in
 * theme/design-system/src/tokens/themes/{light,dark}.css.
 */

const THEMES = {
	light: { contrib2: "rgb(64, 196, 99)", contrib4: "rgb(33, 110, 57)", negative: "rgb(207, 34, 46)" },
	dark: { contrib2: "rgb(0, 109, 50)", contrib4: "rgb(57, 211, 83)", negative: "rgb(248, 81, 73)" },
} as const;

for (const [theme, c] of Object.entries(THEMES)) {
	test(`${theme}: GitHub greens, and Volo's greens and red`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

		await expect(page.locator('.wx-github .ds-tile[data-level="4"]').first()).toHaveCSS("background-color", c.contrib4);

		// The linescore's result strips, across every season's panel (the
		// hidden ones are in the DOM).
		await expect(page.locator('.wx-volo th[data-result="W"] .wx-vl-strip').first()).toHaveCSS("background-color", c.contrib2);
		// The chart's finals: the title won, and the ones lost.
		await expect(page.locator('.wx-volo .wx-vl-dot[data-result="W"]').first()).toHaveCSS("background-color", c.contrib4);
		await expect(page.locator('.wx-volo .wx-vl-dot[data-result="L"]').first()).toHaveCSS("background-color", c.negative);
	});
}
