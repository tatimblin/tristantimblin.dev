import { test, expect } from "@playwright/test";
import { GLYPH_NAMES } from "../packages/design-system/src/glyphs/names";

/**
 * THE GLYPH TILE SHEET, IN THE BROWSER.
 *
 * /design-system/glyphs is the micrographics' "look at it" page: every
 * registered glyph file and a spread of every generator component, each in
 * a GlyphTile with an anchor (#glyph-<name>, #gen-<component>-<n>). It is
 * also the first place the generator components render at runtime, so this
 * spec pins that the page shows the whole registry — a glyph added to
 * names.ts appears with no edit to the page — that every generator
 * component renders its <svg data-gen>, that nothing on the page logs an
 * error, and that a labelled meter exposes its value to a reader.
 */

const SHEET = "/design-system/glyphs/";

/** Every generator component, by its data-gen hook. */
const GENERATORS = [
	"wave",
	"envelope",
	"filter",
	"curve",
	"gauge",
	"dial",
	"ladder",
	"segments",
	"selector",
	"progress",
	"fan",
	"rings",
	"matrix",
];

test.describe("glyph tile sheet", () => {
	test("renders with no console errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (m) => {
			if (m.type() === "error") errors.push(m.text());
		});
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto(SHEET);
		await expect(page.getByRole("heading", { level: 1, name: "Glyphs" })).toBeVisible();
		expect(errors, errors.join("\n")).toEqual([]);
	});

	test("one tile per registered glyph, each drawing its file", async ({ page }) => {
		await page.goto(SHEET);
		const tiles = page.locator('[data-glyph-entry="glyph"]');
		await expect(tiles).toHaveCount(GLYPH_NAMES.length);
		for (const name of GLYPH_NAMES) {
			const tile = page.locator(`#glyph-${name}`);
			await expect(tile, name).toHaveCount(1);
			await expect(tile.locator(`svg.ds-glyph[data-glyph="${name}"]`), name).toHaveCount(1);
			await expect(tile, name).toContainText(name);
		}
	});

	test("every generator component renders, anchored #gen-<component>-<n>", async ({ page }) => {
		await page.goto(SHEET);
		for (const gen of GENERATORS) {
			const first = page.locator(`#gen-${gen}-1`);
			await expect(first, gen).toHaveCount(1);
			const svg = first.locator(`svg.ds-glyph[data-gen="${gen}"]`);
			await expect(svg, gen).toHaveCount(1);
			// Drawn, not empty: at least one element inside, and a box on the page.
			expect(await svg.locator("*").count(), gen).toBeGreaterThan(0);
			const box = await svg.boundingBox();
			expect(box && box.width > 0 && box.height > 0, gen).toBe(true);
		}
		// A wide mark (an 8-digit Segments, a 10-column Matrix) takes the wide cap.
		for (const id of ["gen-segments-1", "gen-matrix-1"]) {
			await expect(page.locator(`#${id}`)).toHaveClass(/ds-glyph-tile--wide-true/);
			await expect(page.locator(`#${id} svg`)).toHaveAttribute("viewBox", "0 0 96 32");
		}
	});

	test("a wide tile keeps one tile's height", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(SHEET);
		const wide = await page.locator("#gen-segments-1 .ds-glyph-tile__cap").boundingBox();
		const one = await page.locator("#gen-gauge-1 .ds-glyph-tile__cap").boundingBox();
		expect(wide && one).toBeTruthy();
		expect(Math.abs(wide!.height - one!.height)).toBeLessThanOrEqual(1);
		expect(wide!.width).toBeGreaterThan(one!.width * 2);
	});

	test("labelled meters expose role=meter and their value", async ({ page }) => {
		await page.goto(SHEET);
		const meters = page.getByRole("meter");
		expect(await meters.count()).toBeGreaterThanOrEqual(3);
		for (const m of await meters.all()) {
			await expect(m).toHaveAttribute("aria-valuenow", /^\d+$/);
			await expect(m).toHaveAttribute("aria-valuemin", "0");
			await expect(m).toHaveAttribute("aria-valuemax", "100");
			await expect(m).toHaveAttribute("aria-label", /\S/);
		}
		await expect(page.getByRole("meter", { name: "Level" })).toHaveAttribute("aria-valuenow", "62");
		await expect(page.getByRole("meter", { name: "Signal" })).toHaveAttribute("aria-valuetext", "4 of 6");
		// An unlabelled generator stays out of the tree.
		await expect(page.locator("#gen-gauge-2 svg")).toHaveAttribute("aria-hidden", "true");
	});

	test("the L3 modules: the signal chain and the readouts", async ({ page }) => {
		await page.goto(SHEET);
		const chain = page.locator(".glyph-chain");
		for (const label of ["Speed", "Amount", "Dest", "P.Dest"]) {
			await expect(chain.locator(".ds-glyph-tile__label", { hasText: new RegExp(`^${label}$`, "i") })).toHaveCount(1);
		}
		await expect(chain.locator('[data-glyph="junction"]')).toHaveCount(3);
		await expect(chain.locator(".ds-glyph-tile__readout")).toHaveText("34");
		await expect(page.locator(".glyph-readouts .ds-stat--variant-numeral")).toHaveCount(2);
		await expect(page.getByRole("meter", { name: "Freq", exact: true })).toBeVisible();
	});

	test("the theme switch puts the sheet on the other page", async ({ page }) => {
		await page.goto(SHEET);
		const sheet = page.locator("[data-glyph-sheet]");
		await page.locator('[data-sheet-theme="light"]').click();
		await expect(sheet).toHaveClass(/maximeheckel-light/);
		await expect(page.locator('[data-sheet-theme="light"]')).toHaveAttribute("aria-pressed", "true");
		await page.locator('[data-sheet-theme="page"]').click();
		await expect(sheet).not.toHaveClass(/maximeheckel-/);
	});

	test("the catalogue links to the sheet", async ({ page }) => {
		await page.goto("/design-system/");
		await expect(page.locator('#glyphs a[href="/design-system/glyphs/"]')).toHaveCount(1);
		await expect(page.locator("#glyphs [data-glyph-generators] svg[data-gen]")).toHaveCount(5);
	});
});
