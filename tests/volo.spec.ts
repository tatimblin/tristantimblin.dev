import { test, expect } from "./fixtures/test";

// Plain scroll, NOT locator.scrollIntoViewIfNeeded() — the widget row never
// settles (see the same note in reveal.spec.ts), so waiting for a stable box
// times out on a CI runner.
const open = async (page: import("@playwright/test").Page) => {
	await page.goto("/");
	const widget = page.locator(".wx-volo");
	await widget.waitFor({ state: "attached" });
	await page.evaluate(() =>
		document.querySelector(".wx-volo")?.scrollIntoView({ block: "center" })
	);
	return widget;
};

/**
 * THE SEASON BANDS. Each band on the chart is a control that picks its
 * season: its linescore shows, exactly one band is current, and that band is
 * the one tab stop. The arrow keys walk the bands from a focused one.
 */
test("a band picks its season's linescore, by click and by key", async ({ page }) => {
	const widget = await open(page);
	const bands = widget.locator("[data-volo-season]");
	const current = widget.locator("[data-volo-season][aria-current]");
	const stops = widget.locator('[data-volo-season][tabindex="0"]');
	const shown = widget.locator('[data-volo-panel]:not([aria-hidden="true"])');
	await expect(bands.first()).toBeEnabled();
	await expect(current).toHaveCount(1);
	await expect(stops).toHaveCount(1);
	await expect(shown).toHaveCount(1);

	const count = await bands.count();
	const earlier = bands.nth(count - 2);
	await earlier.click();
	await expect(earlier).toHaveAttribute("aria-current", "true");
	await expect(current).toHaveCount(1);
	await expect(earlier).toHaveAttribute("tabindex", "0");
	await expect(shown).toHaveAttribute("data-volo-panel", String(count - 2));

	await page.keyboard.press("ArrowRight");
	await expect(bands.nth(count - 1)).toHaveAttribute("aria-current", "true");
	await expect(bands.nth(count - 1)).toBeFocused();
	await expect(shown).toHaveAttribute("data-volo-panel", String(count - 1));
});

/**
 * THE MODE PILL. The chart opens on the run differential; the pill swaps it
 * for the win differential and back, and says which is showing.
 */
test("the pill flips the chart between run and win differential", async ({ page }) => {
	const widget = await open(page);
	const pill = widget.locator("[data-volo-mode]");
	await expect(pill).toBeVisible();
	await expect(widget).toHaveAttribute("data-mode", "run");
	await expect(pill.locator("[data-mode-label=run]")).toBeVisible();
	await expect(pill.locator("[data-mode-label=win]")).toBeHidden();
	await expect(widget.locator('.wx-vl-trace[data-mode="run"]')).toBeVisible();
	await expect(widget.locator('.wx-vl-trace[data-mode="win"]')).toBeHidden();

	await pill.click();
	await expect(widget).toHaveAttribute("data-mode", "win");
	await expect(pill.locator("[data-mode-label=win]")).toBeVisible();
	await expect(pill.locator("[data-mode-label=run]")).toBeHidden();
	await expect(pill).toHaveAttribute("aria-label", /Showing the win differential/);
	await expect(widget.locator('.wx-vl-trace[data-mode="win"]')).toBeVisible();
	await expect(widget.locator('.wx-vl-trace[data-mode="run"]')).toBeHidden();

	await pill.click();
	await expect(widget).toHaveAttribute("data-mode", "run");
});

/**
 * THE PODIUM. A finished season that placed shows its trophy or medal over
 * its band, but only while that band is picked.
 */
test("a picked podium season shows its medal over its band", async ({ page }) => {
	const widget = await open(page);
	const medals = widget.locator('.wx-vl-trace[data-mode="run"] [data-volo-medal]');
	const season = await medals.first().getAttribute("data-volo-medal");
	const shown = widget.locator('.wx-vl-trace[data-mode="run"] [data-volo-medal]:not([hidden])');

	await widget.locator(`[data-volo-season="${season}"]`).click();
	await expect(shown).toHaveCount(1);
	await expect(shown).toHaveAttribute("data-volo-medal", season!);
	await expect(shown).toBeVisible();
	await expect(shown).toHaveText(/🏆|🥈|🥉/u);

	const other = Number(season) === 0 ? 1 : 0;
	await widget.locator(`[data-volo-season="${other}"]`).click();
	await expect(medals.and(widget.locator(`[data-volo-medal="${season}"]`))).toBeHidden();
});
