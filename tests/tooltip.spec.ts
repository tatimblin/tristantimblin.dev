import { test, expect } from "./fixtures/test";

/**
 * THE DS TOOLTIP, on the catalogue's Tooltip section: hidden at rest, shown
 * under the pointer and on keyboard focus, and the label is the trigger's
 * accessible description either way. And Webography's --company-* dots,
 * pinned per theme to theme/design-system/src/tokens/themes/{light,dark}.css.
 */

const COMPANIES = {
	light: {
		Personal: "oklch(0.6 0.14 145)",
		Yext: "oklch(0.54 0.15 298)",
		Cohere: "oklch(0.62 0.15 28)",
		"Drexel University": "oklch(0.74 0.14 88)",
	},
	dark: {
		Personal: "oklch(0.7 0.14 145)",
		Yext: "oklch(0.66 0.15 298)",
		Cohere: "oklch(0.7 0.15 28)",
		"Drexel University": "oklch(0.82 0.14 88)",
	},
} as const;

test("shows on hover and on keyboard focus, and describes its trigger", async ({ page }) => {
	await page.goto("/design-system/");
	const tip = page.locator("[data-tooltip-demo] .ds-tooltip").first();
	const trigger = tip.locator(".ds-tooltip__trigger");
	const bubble = tip.getByRole("tooltip");

	await expect(bubble).toBeHidden();
	await expect(trigger).toHaveAccessibleDescription("Personal");

	await trigger.hover();
	await expect(bubble).toBeVisible();
	await expect(bubble).toHaveText("Personal");

	await page.mouse.move(0, 0);
	await expect(bubble).toBeHidden();

	// Keyboard: focus the previous control, then Tab onto the trigger.
	await trigger.focus();
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Tab");
	await expect(trigger).toBeFocused();
	await expect(bubble).toBeVisible();
});

test("ids are unique on the page", async ({ page }) => {
	await page.goto("/design-system/");
	const ids = await page.locator(".ds-tooltip__bubble").evaluateAll((els) => els.map((el) => el.id));
	expect(ids.length).toBeGreaterThan(1);
	expect(new Set(ids).size).toBe(ids.length);
});

for (const [theme, colours] of Object.entries(COMPANIES)) {
	test(`${theme}: the company colours`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
		await page.goto("/design-system/");
		await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
		for (const [label, colour] of Object.entries(colours)) {
			// The bubble is hidden at rest, so out of the a11y tree: match it by text.
			const bubble = page.locator(".ds-tooltip__bubble").getByText(label, { exact: true });
			const dot = page.locator("[data-tooltip-demo] .ds-tooltip", { has: bubble }).locator(".ds-demo__dot");
			await expect(dot).toHaveCSS("background-color", colour);
		}
	});
}
