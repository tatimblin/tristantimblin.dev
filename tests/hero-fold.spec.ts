import { test, expect, type Page } from "@playwright/test";

/**
 * THE HERO FOLD INVARIANT.
 *
 * On the ≤900px layout the hero scene is full-bleed and the video carousel's date
 * scrubber + caption hug its BOTTOM edge, while the heading lockup group (wordmark →
 * "other stories" → intro) rests above them. Nothing in normal flow reserves
 * space between the two — the scene is absolutely positioned and the intro is out of
 * flow — so "they don't overlap" is a property of the fold arithmetic, not of the
 * document order. When that arithmetic was a hardcoded offset, the intro overlapped the
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

/** How far a measured, republished layout value may legitimately trail the truth.
 *  publishMetrics() in the video-carousel guards each custom-property write at half a
 *  pixel (an unguarded write from a ResizeObserver callback logs an RO-loop warning),
 *  and the mobile hero chains two of them: --vc-caption-h positions the ruler, and the
 *  --vc-bottom-ui-extent derived from it is what the hero reserves room for. Worst-case
 *  combined staleness is therefore ~1px; 1.5 leaves margin for sub-pixel layout rounding
 *  on top. Any comparison of the same layout reached by two different paths belongs
 *  outside this epsilon, never inside it. */
const PUBLISH_EPSILON = 1.5;

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

		// The group's bottom is the lowest of its parts.
		const groupBottom = Math.max(intro.bottom, otherStories.bottom);

		const lead = parseFloat(getComputedStyle(q<HTMLElement>(".fh__heading")!).paddingBlockStart) || 0;

		// Resolve --sh-heading-gap to pixels. It's authored as a calc()
		// (calc(-1 * var(--space-N))) so "other stories" tucks UP into the wordmark,
		// and an unregistered custom property's getPropertyValue returns that raw
		// calc() string — parseFloat of which is NaN. Apply it to a throwaway element
		// and read the computed (resolved) length back instead.
		const resolveLen = (host: HTMLElement, value: string) => {
			const probe = document.createElement("div");
			probe.style.position = "absolute";
			probe.style.visibility = "hidden";
			probe.style.marginTop = value;
			host.appendChild(probe);
			const pxVal = parseFloat(getComputedStyle(probe).marginTop) || 0;
			probe.remove();
			return pxVal;
		};
		const headingGap = resolveLen(q<HTMLElement>("stories-heading")!, "var(--sh-heading-gap)");

		return {
			sceneHeight: scene.height,
			innerHeight: window.innerHeight,
			grew: scene.height - window.innerHeight,
			clearance: uiTop - groupBottom,
			leadAtMinimum: Math.abs(lead - px("--sh-header-clear")) < 1.5,
			wordmarkToOtherStories: otherStories.top - wordmark.bottom,
			otherStoriesToIntro: intro.top - otherStories.bottom,
			headingGap,
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
		//
		// SEARCHED FOR, like the growth half below: how many repetitions leave the
		// centred regime is a property of the lede's face and size. This was a fixed
		// x2, and when the lede moved to a more compact setting x2 still fit under the
		// centred lockup — the wordmark rightly did not move, and the assertion failed
		// for a reason unconnected to the invariant. So find the first multiplier that
		// moves the wordmark at all, and require that it did so by spending the lead
		// (the hero still one screen, the lead not yet at its floor).
		let movedAt = 0;
		for (let times = 2; times <= 16 && !movedAt; times++) {
			await stretchLede(page, times);
			const f = await readMobileFold(page);
			if (f.wordmarkClearsHeader < base.wordmarkClearsHeader - 1) movedAt = times;
		}
		expect(movedAt, "the lede should start spending the lead within 16 repetitions").toBeGreaterThan(0);
		const spent = await readMobileFold(page);
		expect(spent.clearance).toBeGreaterThanOrEqual(MIN_GAP);
		expect(spent.wordmarkClearsHeader).toBeLessThan(base.wordmarkClearsHeader);
		expect(spent.grew).toBeCloseTo(0, 0);

		// 2. PRECEDENCE (growth half) — once the whitespace is gone the lead pins at
		// its minimum and the hero, only then, exceeds one screen.
		//
		// SEARCH for the multiplier that spends the lead rather than hardcoding one.
		// How many repetitions that takes is a property of the lede's TYPEFACE, not of
		// the fold: this was `[3, 6]`, and when the lede moved to a more compact face
		// x3 stopped reaching the spent regime — so the assertions below quietly went
		// from testing the growth half to testing the dormant one, and failed for a
		// reason that had nothing to do with the invariant. Finding the boundary keeps
		// this half pointed at the behaviour it exists to pin down.
		let spentAt = 0;
		for (let times = 2; times <= 16 && !spentAt; times++) {
			await stretchLede(page, times);
			if ((await readMobileFold(page)).leadAtMinimum) spentAt = times;
		}
		expect(
			spentAt,
			"the lede should spend the whole lead within 16 repetitions"
		).toBeGreaterThan(0);

		for (const times of [spentAt, spentAt * 2]) {
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
		// Tolerance is PUBLISH_EPSILON, not toBeCloseTo(_, 0)'s half-pixel, and the
		// difference matters. Two of the inputs to this clearance are MEASURED and
		// republished from JS — the carousel's --vc-caption-h (which positions the ruler)
		// and the --vc-bottom-ui-extent derived from it (which the hero reserves room
		// for). Each write is guarded at half a pixel, because an unguarded custom-property
		// write from inside a ResizeObserver callback that resizes anything logs
		// "ResizeObserver loop completed with undelivered notifications". So the published
		// values are allowed to trail the truth by up to that guard, and two of them chain
		// here — which makes a sub-pixel difference between two paths to the same layout a
		// PROPERTY OF THE SYSTEM, not a regression. Asserting inside the guard is asserting
		// something the design never promised: it passed on this machine and failed on CI
		// at 0.58px, for no reason connected to the invariant.
		// Real hysteresis is the scene failing to shrink back at all — tens of pixels, and
		// caught by the `grew` assertion directly above.
		expect(Math.abs(restored.clearance - base.clearance)).toBeLessThan(
			PUBLISH_EPSILON
		);
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

		// 4. REACHABILITY — the heading region (.fh__heading → the lockup host → .sh__sub)
		// is a stack of full-width, mostly EMPTY boxes laid over the scene's bottom UI.
		// Every one of them opts pointers out so the scrubber underneath stays draggable;
		// only the visible copy opts back in. Probe both sides of that contract.
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
			const sub = q(".sh__sub").getBoundingClientRect();
			const caption = q(".hero-carousel .vc__caption").getBoundingClientRect();
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
				// The gap between the bottom of the intro and the scene's caption: covered
				// by the heading region's empty boxes, and nothing there may take the hit.
				belowIntro: at(
					window.innerWidth / 2,
					(sub.bottom + caption.top) / 2
				),
				ledeText: at(lede.left + 20, lede.top + 6),
			};
		});

		expect(hits.ruler.inCarousel).toBe(true);
		// The empty area below the intro lets pointers through to the scene...
		expect(hits.belowIntro.inIntro).toBe(false);
		expect(hits.belowIntro.inCarousel).toBe(true);
		// ...while the visible copy stays interactive (selectable).
		expect(hits.ledeText.inIntro).toBe(true);
	});
});

test.describe("lockup tuck — a measured breath under the wordmark", () => {
	// THE REGRESSION THIS EXISTS FOR, which has already happened twice. How "other
	// stories" sits under "tristan" was once two hand-picked px tokens, one per
	// breakpoint, chosen against the faces of the time; a font swap moved the metrics
	// out from under them and the words collided. Nothing failed; it just looked wrong
	// until someone noticed.
	//
	// The gap is derived now (fitHeadingTuck in stories-heading), from the relationship
	// that defines the look. With the old serif-over-pixel-face pair that was an
	// OVERLAP — the heading's x-height line on the wordmark's baseline, only the
	// ascenders crossing. With DM Sans on both words the ascenders met the wordmark
	// head-on and read as a collision, so the rule is now: THE HEADING'S TALLEST INK
	// SITS A SMALL, FONT-SIZED BREATH BELOW THE WORDMARK'S BASELINE ("tristan" has no
	// descenders, so the wordmark's ink bottom IS its baseline). Nothing crosses.
	//
	// ASSERTED AS BOUNDS, NOT AS AN EXACT POSITION. Where the gap lands inside the range
	// is a tuning choice (TUCK_CLEARANCE, in em), and pinning the tuned value would make
	// every nudge to the look break a test that is supposed to be about the RULE. The
	// bounds are the two ways the rule can actually be violated: the ink crossing into
	// the wordmark (collision), or the gap opening so far that the lockup reads as two
	// separate lines. Both in em of the heading's size, since "reads as one lockup"
	// scales with the type — the same 10px is invisible at 130px and a chasm at 50px.
	for (const vp of [
		{ name: "mobile", width: 390, height: 844 },
		{ name: "desktop", width: 1440, height: 900 },
	]) {
		test(`the heading's ink clears the wordmark baseline, tightly, at ${vp.name}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto("/");
			await page
				.locator("stories-heading[data-ready]")
				.waitFor({ state: "attached", timeout: 10_000 });
			await settle(page);

			const ink = await page.evaluate(() => {
				const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
				const outline = q<HTMLElement>(".sh__outline");

				// The engine's own answer for the baseline: a zero-height inline-block sits
				// ON it by definition. Same probe the package uses — reconstructing it from
				// font metrics is what this whole approach exists to avoid.
				const probe = document.createElement("span");
				probe.style.cssText =
					"display:inline-block;width:0;height:0;overflow:hidden";
				outline.appendChild(probe);
				const baseline = probe.getBoundingClientRect().bottom;
				probe.remove();

				const cs = getComputedStyle(outline);
				const size = parseFloat(cs.fontSize);
				const ctx = document.createElement("canvas").getContext("2d")!;
				ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
				// The phrase's tallest ink — whichever of the t, h or tittle stands highest.
				const ascent = ctx.measureText("other stories").actualBoundingBoxAscent;

				// The wordmark's SVG viewBox is fit to its glyph ink and "tristan" has no
				// descenders, so the box's bottom edge is its baseline.
				const wordmarkBaseline = q(".sh__wordmark-svg").getBoundingClientRect().bottom;
				return { size, ascent, daylight: baseline - ascent - wordmarkBaseline };
			});

			// Sanity: the metrics really were readable, so the bounds below can't pass by
			// every quantity being zero.
			expect(ink.size).toBeGreaterThan(0);
			expect(ink.ascent).toBeGreaterThan(0);

			// Nothing crosses: the collision guard.
			expect(ink.daylight / ink.size).toBeGreaterThan(0.05);
			// ...and it stays TIGHT enough to read as one lockup.
			expect(ink.daylight / ink.size).toBeLessThan(0.4);
		});
	}
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

		// The group's height must not depend on where the page happens to be scrolled.
		// fitFold measures the intro RELATIVE TO THE TRACK — the enclosing normal-flow
		// box — precisely so the sticky pin detaching cannot leak the scroll offset into
		// the measurement.
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
