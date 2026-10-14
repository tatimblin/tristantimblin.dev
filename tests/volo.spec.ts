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
	// Plain scroll, NOT locator.scrollIntoViewIfNeeded() — the widget row never
	// settles (see the same note in reveal.spec.ts), so waiting for a stable box
	// times out on a CI runner.
	await widget.waitFor({ state: "attached" });
	await page.evaluate(() =>
		document.querySelector(".wx-volo")?.scrollIntoView({ block: "center" })
	);
	await expect(widget.locator(".wx-vl-nav")).toBeVisible();

	// The widget opens on the latest season that has STARTED, not the last one —
	// a season Volo has announced but not yet begun sits after it, with "next"
	// enabled — so walk to the end first rather than assume where it opened.
	// "previous" is enabled either way: there is always an earlier season.
	await prev.focus();
	await page.keyboard.press("End");
	await expect(next).toBeDisabled();
	await expect(prev).toBeFocused();
	const newest = await heading.textContent();

	// Home from "previous": prev disables, focus lands on next.
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
