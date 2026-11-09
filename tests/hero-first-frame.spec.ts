import { test, expect, type Page } from "./fixtures/test";
import { openHome } from "./fixtures/opener";

/**
 * THE FIRST FRAME IS THE FINAL FRAME.
 *
 * The homepage's opener has no script in its layout: "tristan" is sized to its
 * column from a constant of the face (--sh-wordmark-em), the opener row's height
 * and the parked carousel's lift come from the widget grid's own sizes, and the
 * pin is plain sticky (src/layouts/HomeLayout.astro). So nothing can move once
 * a script runs — and these hold it to that:
 *   1. With JavaScript OFF the opener lays out exactly as with it on, within a
 *      pixel (a pixel and a half on phones, where the engine rounds the line
 *      boxes of the small type per platform).
 *   2. The face constant still fills the column: the word's advance is its width.
 *   3. A real load records (almost) no layout shift.
 */

const toleranceAt = (width: number) => (width >= 1024 ? 1 : 1.5);
const VIEWPORTS = [
	{ width: 1920, height: 1080 },
	{ width: 1440, height: 900 },
	{ width: 1280, height: 800 },
	{ width: 1024, height: 768 },
	{ width: 768, height: 1024 },
	{ width: 430, height: 932 },
	{ width: 390, height: 844 },
];

/** The opener's visible boxes, in document space. The carousel is read without
 *  its transform's animation (both runs are at scroll 0, where the park is the
 *  stylesheet's), as its painted box. */
async function readOpener(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	return page.evaluate(() => {
		const box = (s: string) => {
			const r = document.querySelector(s)?.getBoundingClientRect();
			return r ? { x: r.x, y: r.y + scrollY, w: r.width, h: r.height } : null;
		};
		// The cards carry the reveal's entrance (`translate`) while JS runs, so they
		// are read from LAYOUT offsets, plus — for the carousel — the park its
		// `transform` paints (the reveal's translate is a separate property).
		const laid = (s: string) => {
			const el = document.querySelector<HTMLElement>(s);
			if (!el) return null;
			let x = 0;
			let y = 0;
			for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
				x += n.offsetLeft;
				y += n.offsetTop;
			}
			y += new DOMMatrix(getComputedStyle(el).transform).m42;
			return { x, y, w: el.offsetWidth, h: el.offsetHeight };
		};
		return {
			header: box(".site-header"),
			lockup: box("stories-heading"),
			wordmark: box(".sh__wordmark"),
			tagline: box(".sh__tagline"),
			intro: box(".sh__sub > :last-child"),
			carousel: laid(".wx-videos"),
			firstCard: laid('[data-widget="now-playing"]'),
		};
	});
}

test.describe("opener first frame", () => {
	for (const vp of VIEWPORTS) {
		test(`JS off lays out as JS on at ${vp.width}x${vp.height}`, async ({ page, browser }) => {
			const tolerance = toleranceAt(vp.width);

			await openHome(page, vp.width, vp.height);
			const on = await readOpener(page);

			const context = await browser.newContext({ viewport: vp, javaScriptEnabled: false });
			const p = await context.newPage();
			await p.goto("/");
			const off = await readOpener(p);
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

	// --sh-wordmark-em is the face's measurement, authored rather than asked of the
	// page at runtime: if the face, its weight or the tracking changes, the word no
	// longer fills its column, and nothing else would notice. Within 1% of the
	// column: Chromium on Linux rounds each glyph's advance, up to 3.5px on the word.
	for (const vp of [VIEWPORTS[1], VIEWPORTS[6]]) {
		test(`"tristan" fills its column at ${vp.width}x${vp.height}`, async ({ page }) => {
			await openHome(page, vp.width, vp.height);
			const got = await page.evaluate(() => {
				const outline = document.querySelector(".sh__outline")!;
				const range = document.createRange();
				range.selectNodeContents(outline);
				const probe = document.createElement("div");
				probe.style.cssText = "position:absolute;visibility:hidden;width:var(--sh-wordmark-w)";
				document.querySelector(".sh__wordmark")!.appendChild(probe);
				const column = probe.getBoundingClientRect().width;
				probe.remove();
				return { advance: range.getBoundingClientRect().width, column };
			});
			expect(Math.abs(got.advance - got.column), JSON.stringify(got)).toBeLessThanOrEqual(got.column * 0.01);
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
			await openHome(page);
			// Past the fonts and the widgets' first renders.
			await page.waitForTimeout(1500);
			const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
			expect(cls).toBeLessThanOrEqual(0.01);
		});
	}
});
