import { test, expect } from "./fixtures/test";

/**
 * THE DESKTOP HERO (>900px): framed and short, the carousel below the fold.
 *
 *   1. FRAME     the halftone is held in by one empty margin — the site header's
 *                band — at the top and sides, and is cut at the wordmark's midline.
 *   2. SHORT     the halftone is a fixed 400px, and the hero ends one fold gap
 *                under the intro rather than at the fold.
 *   3. DOCK      the videos card is out of sight on load (parked on the fold), rises
 *                through the page as it scrolls, never reversing, and ends pinned in
 *                its grid cell with no lift left.
 */

for (const [w, h] of [
	[1440, 900],
	[1280, 720],
] as const) {
	test(`frame and floor at ${w}x${h}`, async ({ page }) => {
		await page.setViewportSize({ width: w, height: h });
		await page.goto("/");
		await page.locator("stories-heading[data-ready]").waitFor({ state: "attached" });
		await page.waitForTimeout(300);

		const geo = await page.evaluate(() => {
			const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
			const wm = r(".sh__wordmark-svg");
			return {
				header: r(".site-header").bottom,
				grid: r(".hero__video"),
				wmMid: (wm.top + wm.bottom) / 2,
				introBottom: r(".hero-intro").bottom,
				heroBottom: r(".fh__scene").bottom,
				// A custom property computes to its unresolved expression; a probe's
				// height resolves it.
				foldGap: (() => {
					const probe = document.createElement("div");
					probe.style.cssText = "position:absolute;height:var(--hero-fold-gap)";
					document.querySelector(".fh")!.appendChild(probe);
					const h = probe.getBoundingClientRect().height;
					probe.remove();
					return h;
				})(),
				vw: window.innerWidth,
			};
		});
		const frame = geo.header;
		expect(frame).toBeGreaterThan(0);
		// One margin on the top and both sides...
		expect(Math.abs(geo.grid.top - frame)).toBeLessThan(1);
		expect(Math.abs(geo.grid.left - frame)).toBeLessThan(1);
		expect(Math.abs(geo.vw - geo.grid.right - frame)).toBeLessThan(1);
		// ...the picture cut through "tristan"...
		expect(Math.abs(geo.grid.bottom - geo.wmMid)).toBeLessThan(1);
		// ...a fixed height (index.astro's --home-scene-h), given up only on a
		// screen too short to show it AND the intro above the fold...
		if (h >= 900) expect(Math.abs(geo.grid.height - 400)).toBeLessThan(1);
		else expect(geo.grid.height).toBeLessThanOrEqual(400 + 1);
		// ...and the hero ending one fold gap under the group, not at the fold.
		expect(Math.abs(geo.heroBottom - geo.introBottom - geo.foldGap)).toBeLessThan(1);
	});
}

test("the videos card waits under the fold, rises, and docks", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	// Let the card's reveal entrance finish: it rides on `translate`, which the
	// painted rect includes.
	await page.waitForTimeout(2000);

	const at = async (y: number) => {
		await page.evaluate((v) => window.scrollTo(0, v), y);
		await page.waitForTimeout(150);
		// The lift as painted: the computed transform's y, whichever mechanism
		// drives it (a scroll-timeline animation, or the fallback's
		// --vc-dock-lift — tests/scroll-fallback.spec.ts pins which).
		return page.evaluate(() => {
			const el = document.querySelector<HTMLElement>(".wx-videos")!;
			return {
				top: el.getBoundingClientRect().top,
				lift: new DOMMatrix(getComputedStyle(el).transform).m42,
			};
		});
	};

	const rest = await at(0);
	// Out of sight on load: parked on the fold, not peeking into the hero.
	expect(rest.top).toBeGreaterThanOrEqual(900 - 1);
	expect(rest.lift).toBeLessThan(0);

	// Sampled within the page's scroll range: past its end the page stops, and
	// so does the card.
	const end = Math.min(
		1600,
		await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
	);
	const tops: number[] = [];
	for (let y = 100; y <= end; y += 100) tops.push((await at(y)).top);
	for (let i = 1; i < tops.length; i++) {
		expect(
			tops[i],
			`the card stalled or reversed between samples: ${JSON.stringify(tops)}`
		).toBeLessThan(tops[i - 1]);
	}
	// Docked: no lift left once the grid has framed.
	expect((await at(end)).lift).toBe(0);
});
