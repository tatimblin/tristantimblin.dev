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
/** How far JS off may stray from JS on, per box edge, by viewport width.
 *
 *  Desktop: half a pixel. Every length there is the stylesheet's own arithmetic on
 *  face constants, so the two frames agree to rounding (measured: under 0.5px at
 *  1024–1920 on macOS and on Linux). It used to be 1px, and Linux sat 5.9px out
 *  until the wordmark's ink box stopped being re-measured at runtime (see
 *  fitWordmark in theme/stories-heading/src/index.ts).
 *
 *  Phones: a pixel and a half. What is left there is the engine rounding each face's
 *  ascent and descent to whole pixels inside the "&"'s and the heading's line boxes,
 *  which the script reads back off layout and the stylesheet cannot predict: its
 *  rounding is the platform's, not the face's. Measured at the listed phone and
 *  tablet sizes: at most 0.91px on macOS and 1.13px on Linux (the "&" at 430px:
 *  a 1px tolerance failed there on Linux only). Elsewhere in 360–900px it peaks at
 *  1.5px (880px) and, at 901px, 1.75px on both platforms, so those sizes stay out
 *  of the list. A first-frame regression of the kind this guards against (the
 *  hero moving by its rough guesses) is tens of pixels. */
const toleranceAt = (width: number) => (width >= 1024 ? 0.5 : 1.5);
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
			const tolerance = toleranceAt(vp.width);

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

	// THE AUTHORED INK CONSTANTS ARE STILL THE FACES'. The script no longer measures
	// the wordmark's ink box or the "&"'s ink (Canvas reports them differently per
	// platform; see fitWordmark in theme/stories-heading/src/index.ts), so nothing at
	// runtime would notice them go stale when a face changes. This does: it paints
	// each glyph run at 300px and reads its ink off the pixels, where the outlines
	// are the same on every platform (measured identical on macOS and Linux).
	// Half coverage marks the outline's edge, so the pixel answer is within a pixel.
	test("the authored ink constants match the faces", async ({ page }) => {
		await page.goto("/");
		const got = await page.evaluate(async () => {
			await document.fonts.ready;
			const PX = 300;
			const ink = (el: Element, text: string) => {
				const cs = getComputedStyle(el);
				const c = document.createElement("canvas");
				c.width = 4 * PX;
				c.height = 2 * PX;
				const ctx = c.getContext("2d")!;
				ctx.font = `${cs.fontWeight} ${PX}px ${cs.fontFamily}`;
				const ox = PX / 2;
				const oy = 1.5 * PX;
				ctx.fillText(text, ox, oy);
				const { data } = ctx.getImageData(0, 0, c.width, c.height);
				let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
				for (let y = 0; y < c.height; y++)
					for (let x = 0; x < c.width; x++)
						if (data[(y * c.width + x) * 4 + 3] >= 128) {
							top = Math.min(top, y);
							bottom = Math.max(bottom, y + 1);
							left = Math.min(left, x);
							right = Math.max(right, x + 1);
						}
				return { ascent: oy - top, descent: bottom - oy, left: left - ox, right: right - ox };
			};
			const svg = document.querySelector<SVGSVGElement>(".sh__wordmark-svg")!;
			const text = document.querySelector(".sh__wordmark-text")!;
			return {
				PX,
				// Authored in StoriesHeading.astro at the <text>'s own 300px.
				authored: { ascent: Number(text.getAttribute("y")), height: svg.viewBox.baseVal.height },
				wordmark: ink(text, "tristan"),
				amp: ink(document.querySelector("[data-sh-amp]")!, "&"),
			};
		});
		const px = 1.5;
		expect(Math.abs(got.wordmark.ascent - got.authored.ascent), "wordmark ink ascent").toBeLessThanOrEqual(px);
		expect(
			Math.abs(got.wordmark.ascent + got.wordmark.descent - got.authored.height),
			"wordmark ink height"
		).toBeLessThanOrEqual(px);
		// AMP_INK_ASCENT and AMP_INK_SPAN in index.ts, and the same two numbers in
		// --sh-amp-size / --sh-amp-left in styles.css. The span is the ink's right edge
		// plus its left inset (Canvas's actualBoundingBoxRight − actualBoundingBoxLeft).
		expect(Math.abs(got.amp.ascent - 0.712 * got.PX), "& ink ascent").toBeLessThanOrEqual(px);
		expect(Math.abs(got.amp.right + got.amp.left - 0.765 * got.PX), "& ink span").toBeLessThanOrEqual(px);
	});

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
