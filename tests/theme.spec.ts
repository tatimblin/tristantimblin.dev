import { test, expect, type Page } from "./fixtures/test";

/**
 * THE THEME, AND THE EDGE EVERY BOX IS DRAWN IN.
 *
 * The theme is ONE attribute: data-theme="light|dark" on <html>, written by the
 * inline init in Layout.astro (before first paint, from localStorage "theme",
 * light when nothing is stored) and by the footer toggle. The token layer keys
 * off it (theme/design-system/src/tokens/themes/{light,dark}.css), so these
 * tests assert on what the attribute RESOLVES to — the page colour, the card's
 * edge — and not only on the attribute, which could flip while nothing listened.
 *
 *   1. DEFAULT   a first visit is light: the attribute, and the cream page.
 *   2. TOGGLE    the footer chip flips it, says so (aria-pressed / the label),
 *                stores the choice, and the choice survives a reload.
 *   3. EDGE      a card is the design's box: a 1px DASHED edge at the 2.5px corner,
 *                both read from tokens (--border, --radius-box), in both themes.
 */

const CREAM = "rgb(255, 248, 235)"; // #fff8eb, themes/light.css --background
const NIGHT = "rgb(21, 20, 18)"; // #151412, themes/dark.css --background

const html = (page: Page) => page.locator("html");
const pageColour = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const toggle = (page: Page) => page.locator("[data-theme-toggle]");

/** The first framed card on the home page (the videos tile is chrome={false}). */
const CARD = ".home__widgets .ds-card:not(.ds-card--chrome-false)";

test("a first visit is light: the attribute, and the cream page", async ({ page }) => {
	await page.goto("/");
	await expect(html(page)).toHaveAttribute("data-theme", "light");
	expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
	expect(await pageColour(page)).toBe(CREAM);
	// The old class mechanism is gone, not merely unused.
	expect(await html(page).getAttribute("class")).not.toMatch(/maximeheckel-/);
	// Native controls and scrollbars follow the theme too.
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
});

test("a stored dark choice is applied before first paint", async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem("theme", "dark"));
	// Read the attribute as the document is parsed, before any module runs: the
	// init is inline in <head>, so there is no frame of the light page.
	await page.addInitScript(() => {
		document.addEventListener("DOMContentLoaded", () => {
			(window as unknown as { __themeAtParse: string | null }).__themeAtParse =
				document.documentElement.getAttribute("data-theme");
		});
	});
	await page.goto("/");
	expect(await page.evaluate(() => (window as unknown as { __themeAtParse: string | null }).__themeAtParse)).toBe(
		"dark"
	);
	await expect(html(page)).toHaveAttribute("data-theme", "dark");
	expect(await pageColour(page)).toBe(NIGHT);
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
});

test("the footer toggle flips the theme, says so, and the choice persists", async ({ page }) => {
	await page.goto("/");
	const chip = toggle(page);
	await chip.scrollIntoViewIfNeeded();
	// Pressed = light; the label names the theme a click switches TO.
	await expect(chip).toHaveAttribute("aria-pressed", "true");
	await expect(chip).toHaveAttribute("aria-label", "Switch to dark theme");

	await chip.click();
	await expect(html(page)).toHaveAttribute("data-theme", "dark");
	await expect(chip).toHaveAttribute("aria-pressed", "false");
	await expect(chip).toHaveAttribute("aria-label", "Switch to light theme");
	expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
	await expect.poll(() => pageColour(page)).toBe(NIGHT);

	// A reload, and another page: the stored choice holds.
	await page.reload();
	await expect(html(page)).toHaveAttribute("data-theme", "dark");
	await page.goto("/txt/");
	await expect(html(page)).toHaveAttribute("data-theme", "dark");
	expect(await pageColour(page)).toBe(NIGHT);

	// And back.
	await page.goto("/");
	await toggle(page).scrollIntoViewIfNeeded();
	await toggle(page).click();
	await expect(html(page)).toHaveAttribute("data-theme", "light");
	expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
	await expect.poll(() => pageColour(page)).toBe(CREAM);
});

for (const theme of ["light", "dark"] as const) {
	test(`a card is drawn in the dashed edge at the box corner (${theme})`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
		await page.goto("/");
		await expect(html(page)).toHaveAttribute("data-theme", theme);
		const card = page.locator(CARD).first();
		await expect(card).toHaveCount(1);

		const got = await card.evaluate((el) => {
			const cs = getComputedStyle(el);
			const root = getComputedStyle(document.documentElement);
			// Resolve the edge colour token to the same serialisation as the border.
			const probe = document.createElement("span");
			probe.style.color = "var(--border-color)";
			document.body.append(probe);
			const edge = getComputedStyle(probe).color;
			probe.remove();
			return {
				width: cs.borderTopWidth,
				style: cs.borderTopStyle,
				styles: [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle],
				colour: cs.borderTopColor,
				edge,
				radius: cs.borderTopLeftRadius,
				radiusToken: root.getPropertyValue("--radius-box").trim(),
				styleToken: root.getPropertyValue("--border-style").trim(),
				shadow: cs.boxShadow,
				bg: cs.backgroundColor,
				page: getComputedStyle(document.body).backgroundColor,
			};
		});
		expect(got.styleToken).toBe("dashed");
		expect(got.radiusToken).toBe("2.5px");
		expect(got.width).toBe("1px");
		expect(got.styles).toEqual(["dashed", "dashed", "dashed", "dashed"]);
		expect(got.colour, "the edge is --border-color").toBe(got.edge);
		expect(got.radius).toBe("2.5px");
		// The panel ring under the edge (--shadow-panel), and a surface that is not
		// the page's, so the card reads as a panel on it.
		expect(got.shadow).not.toBe("none");
		expect(got.bg).not.toBe(got.page);
	});
}

test("a wrapper carrying the other theme re-resolves the tokens in scope", async ({ page }) => {
	// ThemePage (the catalogue's side-by-side specimens) sets data-theme on a
	// wrapper; every derived token (--border, the washes) is declared on
	// [data-theme] so it re-resolves there rather than inheriting the page's.
	await page.goto("/design-system/");
	const pages = await page.evaluate(() =>
		Array.from(document.querySelectorAll<HTMLElement>(".ds-theme-page[data-theme]"))
			.slice(0, 2)
			.map((el) => ({
				theme: el.dataset.theme,
				bg: getComputedStyle(el).backgroundColor,
				border: getComputedStyle(el).getPropertyValue("--border").trim(),
			}))
	);
	const light = pages.find((p) => p.theme === "light");
	const dark = pages.find((p) => p.theme === "dark");
	expect(light && dark, "the catalogue shows a light and a dark ThemePage").toBeTruthy();
	expect(light!.bg).toBe(CREAM);
	expect(dark!.bg).toBe(NIGHT);
	expect(light!.border).not.toBe(dark!.border);
});
