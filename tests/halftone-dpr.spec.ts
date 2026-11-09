import { test, expect, lockupReady } from "./fixtures/test";

/**
 * THE PHONE TILE RENDERS AT 1x, THE DESKTOP CARD KEEPS 2x.
 *
 * <dotted-grid>'s cost is per-PIXEL of its drawing buffer, so the cap on render DPR
 * is per-instance (`max-dpr`), not global. The videos card has one variant per grid
 * step (src/widgets/videos/Videos.astro): the two-column (phone) variant is capped
 * at 1x — a phone's DPR of 3 would otherwise draw nine buffer pixels per CSS pixel
 * while the page scrolls under it — and the four-column one keeps the element's
 * default cap and stays crisp.
 *
 * THIS IS A SILENT PROPERTY, which is why it is worth a test. Dropping the attribute
 * costs nothing visible: the lattice pitch is unchanged (`cell-size` is in CSS px and
 * the shader multiplies it by the effective DPR, so only the per-dot sampling
 * changes). The page just quietly gets the fill cost back, and nothing fails.
 *
 * Asserted as a RATIO of buffer pixels to CSS pixels rather than as literal
 * dimensions, so it holds at any viewport, and it needs a 2x context — at
 * deviceScaleFactor 1 a capped and an uncapped grid are identical and the test would
 * pass vacuously. Run at both breakpoints, since each creates only its own variant.
 */
test.use({ deviceScaleFactor: 2 });

const VIEWPORTS = [
	{ name: "mobile 390", width: 390, height: 844, variant: ".wx-videos__compact", capped: true },
	{ name: "desktop 1440", width: 1440, height: 900, variant: ".wx-videos__wide", capped: false },
];

for (const vp of VIEWPORTS) {
	test(`the videos card's DPR cap — ${vp.name}`, async ({ page }) => {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.goto("/");
		await lockupReady(page);
		await page.waitForTimeout(1500);

		const grids = await page.evaluate((variant) =>
			Array.from(document.querySelectorAll<HTMLElement>("dotted-grid")).map((el) => {
				const canvas = el.querySelector("canvas");
				return {
					inVariant: !!el.closest(variant),
					ratio: canvas && el.clientWidth > 0 ? canvas.width / el.clientWidth : null,
				};
			}),
			vp.variant,
		);

		expect(await page.evaluate(() => window.devicePixelRatio), "meaningless at DPR 1").toBeGreaterThan(1);
		// Exactly the one grid this breakpoint shows exists, and it is laid out.
		expect(grids.length).toBe(1);
		expect(grids[0].inVariant).toBe(true);
		expect(grids[0].ratio).not.toBeNull();
		if (vp.capped) {
			expect(grids[0].ratio, "the phone tile is rendering above 1x — max-dpr has been dropped").toBeLessThanOrEqual(1);
		} else {
			expect(grids[0].ratio, "the desktop card should NOT be capped").toBeGreaterThan(1);
		}
	});
}
