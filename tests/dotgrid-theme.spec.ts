import { test, expect, type Locator, type Page } from "./fixtures/test";
import sharp from "sharp";

/**
 * THE HALFTONE FOLLOWS THE THEME.
 *
 * <dotted-grid> reads its tone from --dg-* custom properties (src/styles/halftone.css
 * sets them per theme) and re-reads them when <html>'s class / data-theme / style
 * changes. These check the RESULT, in pixels, on a reduced-motion frame (the video
 * paused on its first frame, no intro wipe), so they hold whatever the tuning is
 * as long as it stays sane:
 *
 *   - cream: the frame stays mostly paper. The failure this guards is FLOODING —
 *     negative polarity (or a gamma far too low) on the fabric clip, which is mostly
 *     shadow, turns the hero into a slab of ink.
 *   - dark: the frame stays mostly dark.
 *   - a raw class flip, with no event, repaints a grid that is not animating.
 *   - the playground's split preview really shows two different grounds.
 */

test.use({
	launchOptions: { args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"] },
	viewport: { width: 1440, height: 900 },
});

/** Mean luma (0..1) and the share of pixels darker than mid grey ("ink"). */
async function measure(el: Locator) {
	const png = await el.screenshot();
	const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	let sum = 0;
	let ink = 0;
	const n = info.width * info.height;
	for (let i = 0; i < data.length; i += info.channels) {
		const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
		sum += l;
		if (l < 0.5) ink++;
	}
	return { mean: sum / n, ink: ink / n };
}

async function openHome(page: Page, theme: "light" | "dark") {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
	await page.goto("/");
	const grid = page.locator("dotted-grid.hero__video");
	await expect(grid).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
	await page.waitForTimeout(500); // the first frame's one-shot paint
	return grid;
}

test("cream: the hero halftone stays mostly paper (no flooding)", async ({ page }) => {
	const grid = await openHome(page, "light");
	const { mean, ink } = await measure(grid);
	expect(mean, "mean brightness on cream").toBeGreaterThan(0.6);
	expect(ink, "share of the frame in ink").toBeLessThan(0.4);
});

test("dark: the hero halftone stays mostly dark", async ({ page }) => {
	const grid = await openHome(page, "dark");
	const { mean } = await measure(grid);
	expect(mean, "mean brightness on dark").toBeLessThan(0.3);
});

test("a raw theme flip repaints a paused grid, with no event", async ({ page }) => {
	const grid = await openHome(page, "light");
	const before = await measure(grid);
	expect(before.mean).toBeGreaterThan(0.6);

	// Exactly what a theme toggle changes on <html> — the data-theme attribute —
	// and nothing else: no `themechange` event, no call into the element.
	await page.evaluate(() => {
		document.documentElement.dataset.theme = "dark";
	});
	await expect
		.poll(async () => (await measure(grid)).mean, { timeout: 5_000 })
		.toBeLessThan(0.3);
});

test("the playground's split preview shows two different grounds", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/dotgrid/");
	const light = page.locator('[data-pane="light"] dotted-grid');
	const dark = page.locator('[data-pane="dark"] dotted-grid');
	await expect(light).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
	await expect(dark).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
	await page.waitForTimeout(500);
	const a = await measure(light);
	const b = await measure(dark);
	expect(a.mean - b.mean, `light ${a.mean.toFixed(2)} vs dark ${b.mean.toFixed(2)}`).toBeGreaterThan(0.3);
});
