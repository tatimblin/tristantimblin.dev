import { test, expect, type Page } from "./fixtures/test";

/**
 * THE FIRST FRAME IS THE FINAL FRAME.
 *
 * The hero's lockup and fold are measured by <stories-heading>'s script, which runs
 * at the end of the page's first long task. Until it did, the stylesheet painted the
 * hero from rough guesses, and the correction moved everything: on a desktop load the
 * lockup jumped ~240px and the hero grew by ~270px, a layout shift of 0.2 on every
 * visit. Now the stylesheet states what the script will measure (see "The first frame"
 * in theme/stories-heading/src/styles.css), so the script only confirms it.
 *
 * Asserted two ways:
 *   1. With JavaScript OFF the hero lays out exactly as with it on, within a pixel —
 *      JS-off IS the pre-script frame, held still long enough to measure.
 *   2. A real load records (almost) no layout shift.
 */

/** Desktop, tablet and phone sizes. 901px (the narrowest desktop) and ~360px phones
 *  land within ~1.5px: the line box's height rounds per face there. */
const VIEWPORTS = [
	{ width: 1920, height: 1080 },
	{ width: 1440, height: 900 },
	{ width: 1280, height: 800 },
	{ width: 1024, height: 768 },
	{ width: 768, height: 1024 },
	{ width: 430, height: 932 },
	{ width: 390, height: 844 },
];

/** The hero's visible boxes, plus the fold's resolved lengths. */
async function readHero(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	return page.evaluate(() => {
		const box = (s: string) => {
			const r = document.querySelector(s)?.getBoundingClientRect();
			return r ? { x: r.x, y: r.y + scrollY, w: r.width, h: r.height } : null;
		};
		// A custom property resolved to px on a throwaway box inside the hero.
		const fh = document.querySelector<HTMLElement>(".fh")!;
		const len = (v: string) => {
			const probe = document.createElement("div");
			probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
			fh.appendChild(probe);
			const h = probe.getBoundingClientRect().height;
			probe.remove();
			return { x: 0, y: 0, w: 0, h };
		};
		return {
			header: box(".site-header"),
			wordmark: box(".sh__wordmark-svg"),
			amp: box(".sh__amp"),
			otherStories: box(".sh__outline"),
			intro: box(".hero-intro__lede p"),
			scene: box(".fh__scene"),
			content: box(".fh__content"),
			lead: len("var(--hero-lead)"),
			sceneCut: len("var(--hero-scene-cut)"),
		};
	});
}

test.describe("hero first frame", () => {
	for (const vp of VIEWPORTS) {
		// Chromium only: the one project this spec runs in (CI installs no WebKit).
		// The authored viewBox is Chromium's measurement of the wordmark; WebKit
		// measures its SVG text ~1.7% wider (875 user units, not 860), so there the
		// wordmark starts up to 4px too tall until the script runs.
		test(`JS off lays out as JS on at ${vp.width}x${vp.height}`, async ({ page, browser }) => {
			const tolerance = 1;

			await page.setViewportSize(vp);
			await page.goto("/");
			await page.locator("stories-heading[data-ready]").waitFor({ state: "attached" });
			const on = await readHero(page);

			const context = await browser.newContext({ viewport: vp, javaScriptEnabled: false });
			const off = await readHero(await (async () => {
				const p = await context.newPage();
				await p.goto("/");
				return p;
			})());
			await context.close();

			for (const [name, a] of Object.entries(on)) {
				const b = off[name as keyof typeof off];
				expect(a, `${name} is laid out`).not.toBeNull();
				for (const k of ["x", "y", "w", "h"] as const) {
					expect(
						Math.abs(b![k] - a![k]),
						`${name}.${k}: JS off ${b![k].toFixed(1)} vs JS on ${a![k].toFixed(1)}`
					).toBeLessThanOrEqual(tolerance);
				}
			}
		});
	}

	for (const vp of [VIEWPORTS[1], VIEWPORTS[6]]) {
		test(`a load shifts nothing at ${vp.width}x${vp.height}`, async ({ page, browserName }) => {
			test.skip(browserName !== "chromium", "the Layout Instability API is Chromium's");
			await page.setViewportSize(vp);
			await page.addInitScript(() => {
				(window as unknown as { __cls: number }).__cls = 0;
				new PerformanceObserver((list) => {
					for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
						if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
					}
				}).observe({ type: "layout-shift", buffered: true });
			});
			await page.goto("/");
			await page.locator("stories-heading[data-ready]").waitFor({ state: "attached" });
			// Past the hero's intro and the widgets' first renders.
			await page.waitForTimeout(1500);
			const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
			expect(cls).toBeLessThanOrEqual(0.01);
		});
	}
});
