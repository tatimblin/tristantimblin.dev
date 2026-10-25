import { test, expect } from "./fixtures/test";

/**
 * THE WIDGETS' DATA COLOURS. Two widgets mirror charts people already read in
 * colour, so they carry it: the GitHub grid in GitHub's own greens (the
 * --contrib-* ramp, through the tile grid's --tile-N hooks), and Volo's results
 * in --positive / --negative. Pinned per theme to the values in
 * theme/design-system/src/tokens/themes/{light,dark}.css.
 */

const THEMES = {
	light: { contrib4: "rgb(33, 110, 57)", positive: "rgb(26, 127, 55)", negative: "rgb(207, 34, 46)" },
	dark: { contrib4: "rgb(57, 211, 83)", positive: "rgb(63, 185, 80)", negative: "rgb(248, 81, 73)" },
} as const;

for (const [theme, c] of Object.entries(THEMES)) {
	test(`${theme}: GitHub greens and Volo green/red`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

		await expect(page.locator('.wx-github .ds-tile[data-level="4"]').first()).toHaveCSS("background-color", c.contrib4);

		// Results across every season's panel (the inactive ones are in the DOM).
		await expect(page.locator('.wx-vl-game[data-result="W"] .wx-vl-result').first()).toHaveCSS("color", c.positive);
		await expect(page.locator('.wx-vl-game[data-result="W"] .wx-vl-bar').first()).toHaveCSS("background-color", c.positive);
		await expect(page.locator('.wx-vl-game[data-result="L"] .wx-vl-result').first()).toHaveCSS("color", c.negative);
		await expect(page.locator('.wx-vl-game[data-result="L"] .wx-vl-bar').first()).toHaveCSS("background-color", c.negative);
		// The chart's playoff games, at full strength.
		await expect(page.locator('.wx-vl-seg[data-kind="PW"]').first()).toHaveCSS("background-color", c.positive);
		await expect(page.locator('.wx-vl-seg[data-kind="PL"]').first()).toHaveCSS("background-color", c.negative);
	});
}
