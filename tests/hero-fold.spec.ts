import { test, expect, type Page } from "@playwright/test";

/**
 * THE HERO FOLD INVARIANT.
 *
 * On the ≤900px layout the hero scene is full-bleed and the video carousel's date
 * scrubber + caption hug its BOTTOM edge, while the heading lockup group (wordmark →
 * "other stories" → intro → CTAs) rests above them. Nothing in normal flow reserves
 * space between the two — the scene is absolutely positioned and the intro is out of
 * flow — so "they don't overlap" is a property of the fold arithmetic, not of the
 * document order. When that arithmetic was a hardcoded offset, the CTAs overlapped the
 * caption by 25px at 360×600 and by 2px at 390×664 with a 20px root font.
 *
 * These tests assert the arithmetic directly:
 *   1. CLEARANCE   the group never reaches the scene's bottom UI.
 *   2. PRECEDENCE  whitespace above the wordmark is spent BEFORE the hero grows past
 *                  one screen — growing is the last resort, not the mechanism.
 *   3. TIGHTNESS   the group reads as one lockup: equal, token-sized internal gaps.
 *   4. REACHABILITY the scrubber still receives pointers where the (invisible,
 *                  full-width) intro box overlaps it.
 */

/** Minimum breathing room we require between the group and the scene's bottom UI. */
const MIN_GAP = 16;

/** Phone/tablet sizes that exercise the ≤900px full-bleed hero. */
const MOBILE_VIEWPORTS = [
	{ name: "360x600 (short Android)", width: 360, height: 600 },
	{ name: "390x664 (iPhone 12-14)", width: 390, height: 664 },
	{ name: "393x852 (Pixel 8)", width: 393, height: 852 },
	{ name: "414x736 (iPhone 8 Plus)", width: 414, height: 736 },
	{ name: "768x1024 (tablet portrait)", width: 768, height: 1024 },
];

interface Fold {
	sceneHeight: number;
	innerHeight: number;
	grew: number;
	/** Group bottom → nearest scene-owned bottom UI (ruler ∪ caption). */
	clearance: number;
	/** Whether the lead has bottomed out at its header-clearing minimum. */
	leadAtMinimum: boolean;
	wordmarkToOtherStories: number;
	otherStoriesToIntro: number;
	headingGap: number;
	introGap: number;
	wordmarkClearsHeader: number;
}

/**
 * Read the fold geometry. Every number is measured from real boxes — the point is to
 * verify the layout's OUTPUT, not to re-derive its formula in the test.
 */
async function readFold(page: Page, opts: { requireBottomUi?: boolean } = {}): Promise<Fold> {
	return page.evaluate(({ requireBottomUi }) => {
		const q = <T extends Element>(s: string) => document.querySelector<T>(s);
		const rect = (s: string) => q(s)?.getBoundingClientRect() ?? null;

		const fh = q<HTMLElement>(".fh")!;
		const cs = getComputedStyle(fh);
		const px = (prop: string) => parseFloat(cs.getPropertyValue(prop)) || 0;

		const scene = rect(".fh__scene")!;
		const wordmark = rect(".sh__wordmark-svg")!;
		const otherStories = rect(".sh__heading")!;
		const intro = rect(".hero-intro")!;
		const cta = rect(".hero-intro__cta")!;
		const header = rect(".site-header")!;

		// The scene's own bottom UI — whichever of the two protrudes higher. On the
		// ≤900px hero this is REQUIRED to exist rather than defaulted: a missing or
		// zero-height ruler/caption (a renamed .vc__* class, a carousel that failed to
		// hydrate) is exactly the regression this suite exists to catch, and quietly
		// falling back to scene.bottom would make every clearance assertion pass
		// vacuously. Above 900px the carousel is display:none by design (fabric is the
		// scene), so there is legitimately nothing to clear.
		const ruler = rect(".hero-carousel .vc__ruler");
		const caption = rect(".hero-carousel .vc__caption");
		const bottomUi = [ruler, caption]
			.filter((r): r is DOMRect => !!r && r.height > 0)
			.map((r) => r.top);
		if (requireBottomUi && bottomUi.length !== 2) {
			throw new Error(
				`expected a laid-out ruler AND caption in the hero scene, found ${bottomUi.length}` +
					` (ruler=${ruler?.height ?? "absent"}, caption=${caption?.height ?? "absent"})`
			);
		}
		const uiTop = bottomUi.length ? Math.min(...bottomUi) : scene.bottom;

		// The group's bottom is the lowest of its parts (the CTAs usually, but a long
		// lede with no CTA wrap can win).
		const groupBottom = Math.max(intro.bottom, cta.bottom, otherStories.bottom);

		const lead = parseFloat(getComputedStyle(q<HTMLElement>(".fh__heading")!).paddingBlockStart) || 0;

		return {
			sceneHeight: scene.height,
			innerHeight: window.innerHeight,
			grew: scene.height - window.innerHeight,
			clearance: uiTop - groupBottom,
			leadAtMinimum: Math.abs(lead - px("--sh-header-clear")) < 1.5,
			wordmarkToOtherStories: otherStories.top - wordmark.bottom,
			otherStoriesToIntro: intro.top - otherStories.bottom,
			headingGap: parseFloat(
				getComputedStyle(q<HTMLElement>("stories-heading")!).getPropertyValue(
					"--sh-heading-gap"
				)
			) || 0,
			introGap:
				parseFloat(getComputedStyle(q<HTMLElement>(".sh__sub")!).marginBlockStart) || 0,
			wordmarkClearsHeader: wordmark.top - header.bottom,
		};
	}, { requireBottomUi: opts.requireBottomUi ?? false });
}

/** readFold for the ≤900px hero, where the scene's bottom UI must be present. */
const readMobileFold = (page: Page) => readFold(page, { requireBottomUi: true });

/** Let the measure → publish → re-layout round trip settle. */
async function settle(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((r) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => setTimeout(r, 150))
				)
			)
	);
}

/** Repeat the intro lede `n` times to stress the group's height. */
async function stretchLede(page: Page, n: number) {
	await page.evaluate((times) => {
		const p = document.querySelector<HTMLElement>(".hero-intro__lede p")!;
		const base = p.dataset.original ?? p.textContent ?? "";
		p.dataset.original = base;
		p.textContent = Array(times).fill(base).join(" ");
	}, n);
	await settle(page);
}

test.describe("hero fold — mobile", () => {
	for (const vp of MOBILE_VIEWPORTS) {
		test(`clearance and tightness at ${vp.name}`, async ({ page }) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto("/");
			await settle(page);

			const fold = await readMobileFold(page);

			// 1. CLEARANCE — the whole reason this machinery exists. Regression guard:
			// 360x600 overlapped by 24.6px before the fold was derived.
			expect(fold.clearance).toBeGreaterThanOrEqual(MIN_GAP);

			// 3. TIGHTNESS — "other stories" sits directly above the intro, and the
			// wordmark directly above "other stories", on ONE token-sized rhythm.
			expect(fold.wordmarkToOtherStories).toBeCloseTo(fold.headingGap, 0);
			expect(fold.otherStoriesToIntro).toBeCloseTo(fold.introGap, 0);

			// The group must always clear the overlaid header.
			expect(fold.wordmarkClearsHeader).toBeGreaterThanOrEqual(0);
		});
	}

	test("clearance holds as the group grows, and growth is the LAST resort", async ({
		page,
	}) => {
		// The shortest viewport: least whitespace, so precedence is observable.
		await page.setViewportSize({ width: 360, height: 600 });
		await page.goto("/");
		await settle(page);

		const base = await readMobileFold(page);
		// 2. PRECEDENCE (dormant half) — with room to spare the hero is exactly one
		// screen and the lead is NOT yet at its minimum.
		expect(base.grew).toBeCloseTo(0, 0);
		expect(base.leadAtMinimum).toBe(false);
		expect(base.clearance).toBeGreaterThanOrEqual(MIN_GAP);

		// Growing the group must consume the lead before the hero grows: the wordmark
		// slides up toward the header while the hero stays one screen tall.
		await stretchLede(page, 2);
		const spent = await readMobileFold(page);
		expect(spent.clearance).toBeGreaterThanOrEqual(MIN_GAP);
		expect(spent.wordmarkClearsHeader).toBeLessThan(base.wordmarkClearsHeader);

		// 2. PRECEDENCE (growth half) — once the whitespace is gone the lead pins at
		// its minimum and the hero, only then, exceeds one screen.
		for (const times of [3, 6]) {
			await stretchLede(page, times);
			const grown = await readMobileFold(page);
			expect(grown.clearance).toBeGreaterThanOrEqual(MIN_GAP);
			expect(grown.leadAtMinimum).toBe(true);
			expect(grown.grew).toBeGreaterThan(0);
			expect(grown.wordmarkClearsHeader).toBeGreaterThanOrEqual(0);
		}

		// And it must come back: no hysteresis (a grown scene must not justify its own
		// growth on the next pass).
		await stretchLede(page, 1);
		const restored = await readMobileFold(page);
		expect(restored.grew).toBeCloseTo(0, 0);
		expect(restored.clearance).toBeCloseTo(base.clearance, 0);
	});

	test("clearance survives a large root font size", async ({ page }) => {
		// Regression guard: 390x664 at 20px root overlapped by 1.9px before the fix.
		await page.setViewportSize({ width: 390, height: 664 });
		await page.goto("/");
		await page.addStyleTag({ content: "html { font-size: 20px }" });
		await settle(page);

		const fold = await readMobileFold(page);
		expect(fold.clearance).toBeGreaterThanOrEqual(MIN_GAP);
		expect(fold.wordmarkClearsHeader).toBeGreaterThanOrEqual(0);
	});

	test("clearance holds under reduced motion", async ({ page }) => {
		// Reduced motion returns the intro to normal flow INSIDE the pin, so the group
		// is measured through a different code path (pin.offsetHeight already contains
		// it — the naive sum double-counts by ~163px).
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 360, height: 600 });
		await page.goto("/");
		await settle(page);

		const fold = await readMobileFold(page);
		expect(fold.clearance).toBeGreaterThanOrEqual(MIN_GAP);
		expect(fold.otherStoriesToIntro).toBeCloseTo(fold.introGap, 0);
	});

	test("the date scrubber still receives pointers under the intro", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 664 });
		await page.goto("/");
		await settle(page);

		// 4. REACHABILITY — .hero-intro is a full-width box with only a narrow column of
		// visible text; its empty area overlays the scrubber and must not swallow drags.
		const hits = await page.evaluate(() => {
			const q = (s: string) => document.querySelector(s)!;
			const at = (x: number, y: number) => {
				// elementsFromPoint (not elementFromPoint) so the dev-only
				// <astro-dev-toolbar> overlay can be skipped — it covers the bottom of the
				// viewport in `astro dev` and would mask the real hit target.
				const el = document
					.elementsFromPoint(x, y)
					.find((e) => e.tagName !== "ASTRO-DEV-TOOLBAR");
				return {
					inCarousel: !!el?.closest("video-carousel"),
					inIntro: !!el?.closest(".hero-intro"),
				};
			};
			const ruler = q(".hero-carousel .vc__ruler").getBoundingClientRect();
			const cta = q(".hero-intro__cta").getBoundingClientRect();
			const button = q(".hero-intro__cta .ds-button").getBoundingClientRect();
			const lede = q(".hero-intro__lede p").getBoundingClientRect();
			return {
				// The tick strip near the ruler's top edge. Clamped to the viewport: the
				// ruler's box can be WIDER than the viewport (its width comes from the
				// package's --vc-ruler-w), so an x derived from ruler.right may be off-screen
				// and hit nothing at all.
				ruler: at(
					Math.min(ruler.left + ruler.width / 2, window.innerWidth - 4),
					ruler.top + 4
				),
				// The CTA row's empty tail, to the right of the last button.
				ctaEmptyArea: at(cta.right - 6, cta.top + cta.height / 2),
				button: at(button.left + button.width / 2, button.top + button.height / 2),
				ledeText: at(lede.left + 20, lede.top + 6),
			};
		});

		expect(hits.ruler.inCarousel).toBe(true);
		// The invisible part of the intro lets pointers through to the scene...
		expect(hits.ctaEmptyArea.inIntro).toBe(false);
		// ...while the visible controls and copy stay interactive.
		expect(hits.button.inIntro).toBe(true);
		expect(hits.ledeText.inIntro).toBe(true);
	});
});

test.describe("hero fold — desktop", () => {
	test("the group is tight and its height does not drift with scroll", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await settle(page);

		const groupH = () =>
			page.evaluate(
				() =>
					parseFloat(
						getComputedStyle(document.querySelector<HTMLElement>(".fh")!)
							.getPropertyValue("--sh-group-h")
					) || 0
			);

		const rest = await readFold(page);
		expect(rest.grew).toBeCloseTo(0, 0);
		expect(rest.wordmarkToOtherStories).toBeCloseTo(rest.headingGap, 0);

		// The desktop intro is position:fixed to the viewport bottom. Measuring it as
		// part of the group would make the group's height drift as the sticky pin
		// detaches; it is treated as a bottom reserve instead.
		//
		// Scrolling ALONE cannot expose that: fitFold runs from resize/ResizeObserver/
		// fonts.ready, never from the scroll handler (which only writes --sh-clip and
		// the "&" transform). So scroll, then FORCE a re-measure at that position — the
		// state a real resize/rotate mid-page would produce — and assert the measured
		// group height is unchanged.
		const atRest = await groupH();
		for (const y of [200, 600]) {
			await page.evaluate((to) => window.scrollTo(0, to), y);
			await settle(page);
			await page.evaluate(() => window.dispatchEvent(new Event("resize")));
			await settle(page);
			expect(await groupH()).toBeCloseTo(atRest, 0);
		}
	});
});
