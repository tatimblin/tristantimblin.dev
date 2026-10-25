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
 * THE SEASON BARS. Each bar is a control that picks its season: the tray's
 * heading follows it, exactly one bar is current, and that bar is the one
 * tab stop. The arrow keys walk the bars from a focused one.
 */
test("a bar picks its season, by click and by key", async ({ page }) => {
	const widget = await open(page);
	const bars = widget.locator("[data-volo-season]");
	const heading = widget.locator("[data-volo-heading]");
	const current = widget.locator("[data-volo-season][aria-current]");
	const stops = widget.locator('[data-volo-season][tabindex="0"]');
	await expect(bars.first()).toBeEnabled();
	await expect(current).toHaveCount(1);
	await expect(stops).toHaveCount(1);
	const opening = await heading.textContent();

	const count = await bars.count();
	const earlier = bars.nth(count - 2);
	await earlier.click();
	await expect(earlier).toHaveAttribute("aria-current", "true");
	await expect(current).toHaveCount(1);
	await expect(earlier).toHaveAttribute("tabindex", "0");
	await expect(heading).not.toHaveText(opening ?? "");

	await page.keyboard.press("ArrowRight");
	await expect(bars.nth(count - 1)).toHaveAttribute("aria-current", "true");
	await expect(bars.nth(count - 1)).toBeFocused();
});

/**
 * THE PAGE ARROWS. More seasons than the window holds: the chart opens on the
 * latest page, "earlier" slides it back, and a disabled arrow cannot hold
 * focus — so focus moves to its sibling rather than dropping to <body>.
 */
test("the page arrows slide the chart and keep focus at the ends", async ({ page }) => {
	const widget = await open(page);
	const nav = widget.locator(".wx-vl-nav");
	test.skip((await nav.count()) === 0, "every season fits on one page");
	const prev = widget.locator("[data-volo-prev]");
	const next = widget.locator("[data-volo-next]");
	const bars = widget.locator("[data-volo-season]");

	await expect(nav).toBeVisible();
	await expect(next).toBeDisabled();
	await expect(bars.first()).toHaveAttribute("tabindex", "-1");

	await prev.focus();
	await prev.click();
	await expect(prev).toBeDisabled();
	await expect(next).toBeFocused();
	await expect(bars.first()).toHaveAttribute("tabindex", "0");

	await next.click();
	await expect(next).toBeDisabled();
	await expect(prev).toBeFocused();
});

/**
 * THE SCHEDULE TRAY. Its heading opens it over the chart — which goes inert,
 * so focus cannot land under the tray — and closes it again; Escape closes it
 * too, handing focus back to the heading.
 */
test("the tray opens from its heading and closes on Escape", async ({ page }) => {
	const widget = await open(page);
	const handle = widget.locator("[data-volo-expand]");
	await expect(handle).toBeEnabled();
	await expect(handle).toHaveAttribute("aria-expanded", "false");

	await handle.click();
	await expect(handle).toHaveAttribute("aria-expanded", "true");
	await expect(widget).toHaveAttribute("data-expanded", "true");
	await expect(widget.locator("[data-volo-chart]")).toHaveJSProperty("inert", true);

	await page.keyboard.press("Escape");
	await expect(widget.locator("[data-volo-chart]")).toHaveJSProperty("inert", false);
	await expect(handle).toHaveAttribute("aria-expanded", "false");
	await expect(handle).toBeFocused();
});
