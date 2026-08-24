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
 * THE TWO BREAKPOINTS ANCHOR THE GROUP DIFFERENTLY, and the tests are split to match:
 *
 *   ≤900px  TOP-ANCHORED. The lockup sits directly under the site header and the clip
 *           fills the middle of the screen. The lead is just the header clearance at
 *           every group size, so there is no whitespace to spend and growing the scene
 *           is the FIRST resort.
 *   >900px  BOTTOM-ANCHORED. The lead is a COMPRESSION BUDGET: a growing group eats the
 *           whitespace above the wordmark first, and the hero grows only once that
 *           budget is gone. Growing is the LAST resort.
 *
 * Both share clamp ② (--hero-height), which is what actually guarantees the group never
 * reaches the scene's bottom UI; only the order of concessions differs.
 *
 * These tests assert the arithmetic directly:
 *   1. CLEARANCE   the group never reaches the scene's bottom UI.
 *   2. ANCHORING   mobile pins the lead at the header clearance and grows the scene;
 *                  desktop spends its whitespace budget before growing anything.
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
	/** The lead itself (.fh__heading's top padding), in px. */
	lead: number;
	/** --hero-top-gap resolved to px: the mobile layout's breathing room between the
	 *  header and the wordmark. 0 where the property is unset (the desktop layout). */
	topGap: number;
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
		// Unset on desktop, where the group is bottom-anchored and there is no such gap.
		const topGap = resolveLen(fh, "var(--hero-top-gap, 0px)");

		return {
			sceneHeight: scene.height,
			innerHeight: window.innerHeight,
			grew: scene.height - window.innerHeight,
			clearance: uiTop - groupBottom,
			leadAtMinimum: Math.abs(lead - px("--sh-header-clear")) < 1.5,
			lead,
			topGap,
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

	test("the group is TOP-anchored, and the scene grows to keep the scrubber clear", async ({
		page,
	}) => {
		// The shortest viewport: least room, so the growth half is reachable.
		await page.setViewportSize({ width: 360, height: 600 });
		await page.goto("/");
		await settle(page);

		const base = await readMobileFold(page);

		// 2. ANCHORING — the lockup starts at the TOP, one --hero-top-gap below the
		// header. Unlike desktop there is no whitespace budget above it: the lead is that
		// gap plus the header's own height, at every group size.
		//
		// Asserted against the RESOLVED TOKEN, never a literal 64: the gap is authored
		// once, in FullHeroLayout, and retuning it there must not turn into a test
		// failure. What is being pinned is that the wordmark sits exactly one gap below
		// the header — not what the gap happens to be this week.
		expect(base.topGap).toBeGreaterThan(0);
		expect(base.wordmarkClearsHeader).toBeCloseTo(base.topGap, 0);
		expect(base.grew).toBeCloseTo(0, 0);
		expect(base.clearance).toBeGreaterThanOrEqual(MIN_GAP);

		// Growing the group must NOT drag the lockup down the screen — that is the whole
		// difference from the desktop layout, where the same stretch slides the wordmark
		// UP as its whitespace is spent. Here it does not move at all.
		await stretchLede(page, 2);
		const spent = await readMobileFold(page);
		expect(spent.lead).toBeCloseTo(base.lead, 0);
		expect(spent.wordmarkClearsHeader).toBeCloseTo(base.wordmarkClearsHeader, 0);
		expect(spent.clearance).toBeGreaterThanOrEqual(MIN_GAP);

		// ...and clearance is instead preserved by clamp ②: once the group outgrows what
		// one screen holds above the scrubber, the SCENE grows by exactly the overflow.
		//
		// SEARCH for the multiplier that first grows the hero rather than hardcoding one.
		// How many repetitions that takes is a property of the lede's TYPEFACE, not of the
		// fold: an earlier version hardcoded x3, and when the lede moved to a more compact
		// face x3 stopped reaching the growth regime — so the assertions below quietly
		// went from testing growth to testing its absence, and failed for a reason that
		// had nothing to do with the invariant.
		let grewAt = 0;
		for (let times = 2; times <= 16 && !grewAt; times++) {
			await stretchLede(page, times);
			if ((await readMobileFold(page)).grew > 1) grewAt = times;
		}
		expect(
			grewAt,
			"the lede should outgrow one screen within 16 repetitions"
		).toBeGreaterThan(0);

		for (const times of [grewAt, grewAt * 2]) {
			await stretchLede(page, times);
			const grown = await readMobileFold(page);
			expect(grown.clearance).toBeGreaterThanOrEqual(MIN_GAP);
			// Still one gap below the header — growth never buys back a lead.
			expect(grown.lead).toBeCloseTo(base.lead, 0);
			expect(grown.wordmarkClearsHeader).toBeCloseTo(base.topGap, 0);
			expect(grown.grew).toBeGreaterThan(0);
			expect(grown.wordmarkClearsHeader).toBeGreaterThanOrEqual(0);
		}

		// And it must come back: no hysteresis (a grown scene must not justify its own
		// growth on the next pass).
		await stretchLede(page, 1);
		const restored = await readMobileFold(page);
		expect(restored.grew).toBeCloseTo(0, 0);
		// Tolerance is PUBLISH_EPSILON, not toBeCloseTo(_, 0)'s half-pixel — see the
		// constant. Two of this clearance's inputs are measured and republished from JS
		// under a half-pixel write guard, so a sub-pixel difference between two paths to
		// the same layout is a property of the design, not a regression.
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

test.describe("lockup tuck — only the tall letters overlap", () => {
	// THE REGRESSION THIS EXISTS FOR, which has already happened once. "other stories"
	// tucks UP into the whitespace under "tristan" so the two read as one lockup. How far
	// up was two hand-picked px tokens, one per breakpoint — chosen against the faces the
	// site used at the time. Self-hosting the type (the Migra/Mondwest swap) moved both
	// faces' metrics out from under those numbers, and the same tokens then read as the
	// words colliding. Nothing failed; it just looked wrong until someone noticed.
	//
	// The tuck is derived now (fitHeadingTuck in stories-heading), from the relationship
	// that actually defines the look: THE HEADING'S X-HEIGHT LINE SITS ON THE WORDMARK'S
	// BASELINE. Everything that rises above that line — the t's, the h, the i's tittle —
	// crosses into the wordmark, and nothing else does. This asserts that relationship
	// directly, so the next font change fails loudly here instead of drifting.
	for (const vp of [
		{ name: "mobile", width: 390, height: 844 },
		{ name: "desktop", width: 1440, height: 900 },
	]) {
		test(`the x-height line sits on the wordmark baseline at ${vp.name}`, async ({
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
				const ctx = document.createElement("canvas").getContext("2d")!;
				ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
				// "x" has no ascender and no descender, so its ink top IS the x-height line.
				const xHeight = ctx.measureText("x").actualBoundingBoxAscent;
				const ascent = ctx.measureText("other stories").actualBoundingBoxAscent;

				// The wordmark's SVG viewBox is fit to its glyph ink and "tristan" has no
				// descenders, so the box's bottom edge is its baseline.
				return {
					xHeightLine: baseline - xHeight,
					wordmarkBaseline: q(".sh__wordmark-svg").getBoundingClientRect().bottom,
					inkOverlap:
						q(".sh__wordmark-svg").getBoundingClientRect().bottom -
						(baseline - ascent),
					ascenderOvershoot: ascent - xHeight,
					xHeight,
				};
			});

			// Sanity: the metrics really were readable, so the equalities below can't pass
			// by both sides being zero.
			expect(ink.xHeight).toBeGreaterThan(0);
			expect(ink.ascenderOvershoot).toBeGreaterThan(0);

			// THE RELATIONSHIP: the x-height line lands on the wordmark's baseline.
			expect(Math.abs(ink.xHeightLine - ink.wordmarkBaseline)).toBeLessThan(1);

			// Equivalently, stated as what you SEE: exactly the ascender overshoot crosses
			// into the wordmark — the tall letters and nothing else. Too small and the
			// lockup breaks into two lines; too large and the words collide, which is the
			// direction the font swap pushed it.
			expect(ink.inkOverlap).toBeCloseTo(ink.ascenderOvershoot, 0);
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
