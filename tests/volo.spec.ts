import { test, expect } from "@playwright/test";

/**
 * THE VOLO SEASON ARROWS. The ends of the range disable their arrow, and a
 * disabled button cannot hold focus — so pressing End (or Home) while the arrow
 * that is about to be disabled is focused used to drop focus to <body>, and the
 * arrow keys, bound on the widget, went nowhere after that. The script hands
 * focus to the enabled sibling instead.
 */
test("the season arrows keep focus at the ends of the range", async ({ page }) => {
	await page.goto("/");
	const widget = page.locator(".wx-volo");
	const prev = widget.locator("[data-volo-prev]");
	const next = widget.locator("[data-volo-next]");
	const heading = widget.locator("[data-volo-heading]");
	await widget.scrollIntoViewIfNeeded();
	await expect(widget.locator(".wx-vl-nav")).toBeVisible();

	// The newest season shows first, so "next" starts disabled.
	await expect(next).toBeDisabled();
	const newest = await heading.textContent();

	// Home from "previous": prev disables, focus lands on next.
	await prev.focus();
	await page.keyboard.press("Home");
	await expect(prev).toBeDisabled();
	await expect(next).toBeFocused();
	const oldest = await heading.textContent();
	expect(oldest).not.toBe(newest);

	// End from "next": next disables, focus lands on prev.
	await page.keyboard.press("End");
	await expect(next).toBeDisabled();
	await expect(prev).toBeFocused();
	await expect(heading).toHaveText(newest ?? "");

	// And the keys still reach the widget from there.
	await page.keyboard.press("ArrowLeft");
	await expect(next).toBeEnabled();
	await expect(heading).not.toHaveText(newest ?? "");
});
