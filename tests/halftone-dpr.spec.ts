import { test, expect } from "@playwright/test";

/**
 * THE FULL-BLEED HALFTONES RENDER AT 1x, THE CARD KEEPS 2x.
 *
 * <dotted-grid>'s cost is per-PIXEL of its drawing buffer, and the instances differ by
 * an order of magnitude in area — so the cap on render DPR is per-instance (`max-dpr`),
 * not global. Measured while scrolling at 8x CPU throttle, the mobile hero:
 *
 *   1.32 Mpx (DPR 2)  median frame 46.6ms
 *   0.33 Mpx (DPR 1)  median frame 11.8ms
 *
 * The canvas was ~76% of the whole frame and the cost tracks area almost exactly. The
 * desktop scene is worse in absolute terms — 5.18 Mpx on a retina display, 136ms vs
 * 38ms at 6x throttle.
 *
 * THIS IS A SILENT PROPERTY, which is why it is worth a test. Dropping the attribute
 * costs nothing visible: the halftone looks near-identical (the lattice pitch is
 * unchanged — `cell-size` is in CSS px and the shader multiplies it by the effective
 * DPR, so only the per-dot sampling changes). The page just quietly gets four times the
 * fill cost back, and nothing fails.
 *
 * Asserted as a RATIO of buffer pixels to CSS pixels rather than as literal dimensions,
 * so it holds at any viewport, and it needs a 2x context — at deviceScaleFactor 1 a
 * capped and an uncapped grid are identical and the test would pass vacuously.
 *
 * RUN AT BOTH BREAKPOINTS, because each hides one of the three grids and a single
 * viewport would leave a hole exactly where a regression could sit: above 900px the
 * hero carousel is display:none, and at or below it the footer widget is. Checking only
 * what is actually laid out, at both sizes, covers all three.
 */

test.use({ deviceScaleFactor: 2 });

const VIEWPORTS = [
	{ name: "mobile 390", width: 390, height: 844 },
	{ name: "desktop 1440", width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
	test(`the full-bleed halftones render at 1x, the card does not — ${vp.name}`, async ({
		page,
	}) => {
	await page.setViewportSize({ width: vp.width, height: vp.height });
	await page.goto("/");
	await page
		.locator("stories-heading[data-ready]")
		.waitFor({ state: "attached", timeout: 15_000 });
	// The footer carousel builds its canvas on hydration; bring it into view.
	await page.evaluate(() =>
		document.querySelector(".home__widgets")?.scrollIntoView({ block: "center" })
	);
	await page.waitForTimeout(1500);

	const grids = await page.evaluate(() => {
		const label = (el: Element) =>
			el.closest(".hero-carousel")
				? "hero carousel"
				: el.classList.contains("hero__video")
					? "desktop fabric"
					: "footer widget";
		return Array.from(document.querySelectorAll<HTMLElement>("dotted-grid")).map(
			(el) => {
				const canvas = el.querySelector("canvas");
				return {
					which: label(el),
					// Buffer pixels per CSS pixel along one axis — the effective DPR.
					ratio:
						canvas && el.clientWidth > 0 ? canvas.width / el.clientWidth : null,
					laidOut: el.clientWidth > 0,
				};
			}
		);
	});

	// The device really is 2x, so an uncapped grid would report 2 here.
	const dpr = await page.evaluate(() => window.devicePixelRatio);
	expect(dpr, "this test is meaningless at DPR 1").toBeGreaterThan(1);

	const seen = grids.filter((g) => g.laidOut);
	expect(seen.length, "no dotted-grid was laid out").toBeGreaterThan(0);

	// Whichever grids this breakpoint shows, at least one must be checked.
	expect(
		seen.map((g) => g.which).join(", "),
		`nothing laid out at ${vp.name}`
	).not.toBe("");

	for (const g of seen) {
		if (g.which === "footer widget") {
			// The card is small; it keeps the element's default cap and stays crisp.
			expect(
				g.ratio,
				"the footer widget should NOT be capped — it is a fraction of the area"
			).toBeGreaterThan(1);
		} else {
			expect(
				g.ratio,
				`${g.which} is rendering above 1x — max-dpr has been dropped, which costs 4x the fill for no visible gain`
			).toBeLessThanOrEqual(1);
		}
	}
	});
}
