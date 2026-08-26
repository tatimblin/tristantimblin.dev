import { test, expect, type Page } from "@playwright/test";

/**
 * THE REVEAL SAFETY INVARIANTS.
 *
 * src/lib/reveal.ts hides content and then eases it in. Hiding content from JS is
 * only defensible if EVERY failure path ends with it visible, so most of what these
 * tests assert is not the animation — it's terminality. The mechanism has three
 * independent escape hatches (the armed class is never added; the class is removed
 * by an inline timeout; the state attribute is set) and the tests below exercise
 * each, because in normal operation none of them ever fires.
 *
 *   1. NO-JS        with scripting off, nothing is hidden — the class is never added.
 *   2. TERMINAL     with every asset blocked, content still appears (the backstop).
 *   3. HERO-FREE    nothing inside .fh is ever gated (its text block is the LCP
 *                   element, so a reveal there would delay a real metric).
 *   4. REDUCED      the reduced-motion visitor is never armed at all.
 *   5. TOKENS       the motion tokens survive the production build (the canary for
 *                   a silently-dropped declaration — see the shorthand trap in
 *                   stories-heading/styles.css).
 *   6. RULER        the mobile scrubber reads years-above-ticks, on one level row.
 *
 * Run against the BUILT site (see playwright.config.ts) so minification hazards are
 * in scope.
 */

interface RevealState {
	armed: boolean;
	/** Targets not yet flipped to the revealed state. */
	pending: number;
	/** Targets whose computed opacity is still below 1. */
	faded: number;
	total: number;
	/** Resolved on :root, to prove the token layer shipped. */
	easeToken: string;
	durationToken: string;
}

async function readReveal(page: Page): Promise<RevealState> {
	return page.evaluate(() => {
		const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
		const root = getComputedStyle(document.documentElement);
		return {
			armed: document.documentElement.classList.contains("reveal-armed"),
			pending: all.filter((el) => el.dataset.revealState !== "in").length,
			faded: all.filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
			total: all.length,
			easeToken: root.getPropertyValue("--ease-reveal").trim(),
			durationToken: root.getPropertyValue("--duration-reveal").trim(),
		};
	});
}

/**
 * Wait until nothing is hidden any more.
 *
 * Waiting on the armed class alone is NOT enough, and the difference is the whole
 * subtlety of the mechanism: disarming only stops the hidden rule from MATCHING —
 * each element still has its ~900ms opacity transition to run, and the 3s backstop
 * can drop the class while off-screen groups are mid-fade. Measured on a
 * fully-blocked page: class removed at t=3308ms, opacity reached 1 at t=4119ms. So
 * poll the thing that actually matters — computed opacity — with a ceiling above
 * backstop + transition.
 */
async function settleReveal(page: Page) {
	await page.waitForFunction(
		() =>
			Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).every(
				(el) => Number(getComputedStyle(el).opacity) === 1
			),
		undefined,
		{ timeout: 8000 }
	);
	await page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => r()))
	);
}

test.describe("reveal — safety", () => {
	test("1. NO-JS: nothing is hidden when scripting is off", async ({ browser }) => {
		// The hidden rule is scoped to a class only script can add, so with no script
		// the page must be fully visible. This is the "blank page" regression guard.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/txt/mega-desk");

		const state = await page.evaluate(() => {
			const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
			return {
				total: all.length,
				faded: all.filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
				armed: document.documentElement.classList.contains("reveal-armed"),
			};
		});

		// The page must actually HAVE targets, or this passes vacuously.
		expect(state.total).toBeGreaterThan(0);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);

		await context.close();
	});

	test("2. TERMINAL: content appears even with every asset blocked", async ({ page }) => {
		// Kill the images the coordinator waits on. Readiness can then never resolve
		// normally, so this exercises the deadline + inline backstop — the branch that
		// never runs in practice and where a permanently-hidden region would hide.
		await page.route("**/*.{webp,png,jpg,jpeg,gif,mp4,webm}", (route) => route.abort());
		await page.goto("/txt/mega-desk");

		await settleReveal(page);
		const state = await readReveal(page);

		expect(state.total).toBeGreaterThan(0);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);
		// NB: `pending` is deliberately NOT asserted here. The backstop reveals by
		// removing the armed class, which un-hides everything WITHOUT walking the
		// elements, so groups still below the fold keep their pending attribute
		// forever — visible but never formally "revealed". That is the intended
		// division of labour: the class is the safety net, the attribute is the happy
		// path. Visibility is the invariant; the attribute is an implementation detail.
	});

	test("3. HERO-FREE: no reveal gates the hero", async ({ page }) => {
		await page.goto("/");

		// The SCENE and HEADING regions must contain no reveal targets: the homepage's
		// LCP element is the wordmark text inside the heading region, so gating
		// anything here would trade a real metric for a cosmetic one. A guard against
		// a future "improvement" that extends the reveal upward into the hero.
		//
		// Scoped to those two regions, NOT to `.fh` as a whole — `.fh` wraps the entire
		// page including the content riser (`.fh__content`), where the below-the-fold
		// copy and widgets legitimately live and ARE revealed.
		const inScene = await page.locator(".fh__scene [data-reveal]").count();
		const inHeading = await page.locator(".fh__heading [data-reveal]").count();
		expect(inScene).toBe(0);
		expect(inHeading).toBe(0);

		// And the lockup itself is fully opaque from the start.
		const heroOpacity = await page.evaluate(() => {
			const sh = document.querySelector("stories-heading");
			return sh ? Number(getComputedStyle(sh).opacity) : null;
		});
		expect(heroOpacity).toBe(1);
	});

	test("4. REDUCED MOTION: never armed, nothing hidden", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");

		const state = await readReveal(page);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);

		// No transition either — the end state is simply present.
		const duration = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>("[data-reveal]");
			return el ? getComputedStyle(el).transitionDuration : null;
		});
		expect(duration === "0s" || duration === null).toBe(true);
	});

	test("5. TOKENS: the motion layer survives the production build", async ({ page }) => {
		await page.goto("/");

		// Canary for the class of failure where a declaration is silently dropped in
		// prod (a folded shorthand, an unresolved custom property, a token file that
		// didn't ship) while dev looked fine.
		const state = await readReveal(page);
		expect(state.easeToken).toContain("cubic-bezier");
		expect(state.durationToken).not.toBe("");

		// The token has to actually reach a target's resolved transition, not merely
		// exist on :root.
		const ms = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>("[data-reveal]");
			if (!el) return null;
			return parseFloat(getComputedStyle(el).transitionDuration) * 1000;
		});
		expect(ms).toBeGreaterThan(0);
	});

	test("6. IDEMPOTENT: survives a view-transition round trip", async ({ page }) => {
		await page.goto("/");
		await settleReveal(page);

		// ClientRouter swaps the document; the coordinator must tear down and rebuild
		// without double-binding or stranding anything hidden.
		//
		// Navigate by dispatching the click rather than locator.click(): the CTA lives
		// inside the hero lockup, which parallaxes and (on desktop) is position:fixed, so
		// waiting for an "actionable" stable box is a slow-runner flake waiting to
		// happen. The navigation is what this test cares about, not the hit-testing.
		await page.evaluate(() => {
			const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
				(a) => a.textContent?.trim() === "Writing"
			);
			link?.click();
		});
		await page.waitForURL("**/txt");
		await settleReveal(page);
		expect((await readReveal(page)).faded).toBe(0);

		await page.goBack();
		await settleReveal(page);
		const state = await readReveal(page);
		expect(state.faded).toBe(0);
		expect(state.pending).toBe(0);
	});

	test("7. LIFECYCLE: widget-owned reveals re-arm after a round trip", async ({
		page,
	}) => {
		// The bike watermark has its OWN IntersectionObserver (BikeStats.astro), separate
		// from the reveal coordinator. Astro executes a component's bundled script exactly
		// once, but ClientRouter replaces the DOM on every navigation — so an observer
		// wired at module scope ends up watching a detached node while the fresh element
		// never gets `.is-in`. Its resting state is `opacity: 0`, so the regression is
		// INVISIBLE CONTENT, not a missing flourish. Measured before the fix: 0.66 on
		// first load, 0 after a round trip.
		const watermark = () =>
			page
				.locator(".wx-baywheels")
				.evaluate((el: Element) =>
					parseFloat(getComputedStyle(el, "::before").opacity)
				);

		// POLL, don't sample. `.is-in` starts a CSS TRANSITION on ::before, so the
		// watermark takes ~1.5s to reach its resting 0.66 — and settleReveal() does not
		// cover it (that waits on the [data-reveal] coordinator's opacity, which is a
		// different mechanism on a different element). Sampling once therefore caught the
		// fade mid-flight at 0 and reported the lifecycle regression that this test
		// exists to detect, on a widget that was in fact revealing perfectly well.
		//
		// Polling still catches the REAL regression: when the observer is left watching a
		// detached node, the resting state is opacity 0 forever, so this never settles
		// above 0 and fails on the timeout instead of on a race.
		const expectWatermarkShown = async (when: string) =>
			expect
				.poll(watermark, {
					timeout: 8000,
					message: `the bike watermark never faded in (${when})`,
				})
				.toBeGreaterThan(0);

		// Plain scroll, NOT locator.scrollIntoViewIfNeeded() — see the note on the same
		// call in "the widget row is held until scrolled to". This widget sits in
		// .home__widgets, the row that never fully settles (its reveal transition and the
		// video widget's scroll-driven dock lift both animate it), so waiting for the box
		// to stop moving times out at 30s on a slow runner instead of asserting anything.
		// We only need it on screen so its IntersectionObserver fires.
		const show = async () => {
			// Wait for the element FIRST. ClientRouter swaps the DOM asynchronously after
			// the URL changes, so page.waitForURL() can return while the previous page's
			// body is still mounted — at which point .wx-baywheels is null, the optional
			// chain below silently no-ops, and the widget is never brought into view. The
			// assertion then fails on a widget that was simply never scrolled to, which
			// reads as the lifecycle regression rather than as the race it is.
			await page.locator(".wx-baywheels").waitFor({ state: "attached" });
			await page.evaluate(() =>
				document.querySelector(".wx-baywheels")?.scrollIntoView({ block: "center" })
			);
		};

		await page.goto("/");
		await show();
		await settleReveal(page);
		await expectWatermarkShown("first load");

		// Dispatch the click rather than hit-test it, per test 6.
		await page.evaluate(() => {
			const link = Array.from(
				document.querySelectorAll<HTMLAnchorElement>("a")
			).find((a) => a.textContent?.trim() === "Writing");
			link?.click();
		});
		await page.waitForURL("**/txt");
		await page.goBack();
		await page.waitForURL((u) => u.pathname === "/");

		await show();
		await settleReveal(page);
		await expectWatermarkShown("after a round trip");
	});
});

test.describe("reveal — below-the-fold behaviour", () => {
	test("the widget row is held until scrolled to, then staggers in", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");

		// Held: the row is below the fold on load, so it must still be invisible.
		// (If this ever fails because the viewport grew tall enough to include the
		// widgets, the fix is a taller page or a shorter viewport — not deleting the
		// assertion, which is the whole point of in-view gating.)
		//
		// Wait for the coordinator to have MARKED the group with some state before
		// measuring, rather than assuming it ran by the time page.goto resolved: under
		// parallel load (this suite also builds pages carrying a dozen WebGL contexts)
		// the module can land a beat later, which made this the one flaky assertion in
		// the file. Waiting specifically for "pending" is wrong — by the time the wait
		// runs the group may already have flipped to "in" — so wait for ANY state, then
		// assert the held one below.
		await page.waitForFunction(
			() =>
				document
					.querySelector('[data-reveal-group="widgets"]')
					?.hasAttribute("data-reveal-state") === true,
			undefined,
			{ timeout: 6000 }
		);
		const held = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>('[data-reveal-group="widgets"]');
			return el
				? {
						opacity: Number(getComputedStyle(el).opacity),
						state: el.dataset.revealState,
						armed: document.documentElement.classList.contains("reveal-armed"),
					}
				: null;
		});

		// The row is below the fold, so it must never have been REVEALED — its state
		// stays "pending" until it is actually scrolled to.
		expect(held?.state).toBe("pending");

		// While ARMED, a pending row must be fully invisible — that is in-view gating
		// doing its job, and the assertion that would catch a real regression.
		//
		// Once DISARMED the opacity is not assertable: the inline script's 3s
		// terminality backstop un-hides everything by dropping the class, and the row
		// then fades over ~900ms, so a sample can legitimately land anywhere in 0..1.
		// (On a slow machine the backstop can beat this check entirely.) The reveal's
		// own terminality is covered by test 2; here we only care that nothing was
		// revealed EARLY, which the state assertion above already establishes.
		if (held?.armed) expect(held.opacity).toBe(0);

		// Plain scroll, NOT locator.scrollIntoViewIfNeeded(): that waits for the element
		// to be "actionable", i.e. for its box to stop moving. This row never fully
		// settles — the reveal transition and the video widget's scroll-driven dock lift
		// both animate it — so on a slow runner the wait times out and the test fails
		// with a 30s timeout rather than a real assertion. (It passed locally purely
		// because the animations finished inside the actionability poll; CI is slower.)
		// We only need the row on screen so the IntersectionObserver fires.
		await page.evaluate(() =>
			document.querySelector(".home__widgets")?.scrollIntoView({ block: "center" })
		);

		// The stagger is implemented as transition-delay, so assert the MECHANISM
		// rather than racing the animation and sampling opacities mid-flight.
		// Delay must rise monotonically with declared order — and order deliberately
		// differs from DOM order here, because `grid-auto-flow: dense` re-packs the
		// 1×2 video cell into the last column even though it is authored first.
		await page.waitForFunction(
			() =>
				Array.from(
					document.querySelectorAll<HTMLElement>('[data-reveal-group="widgets"]')
				).every((el) => el.dataset.revealState === "in"),
			undefined,
			{ timeout: 6000 }
		);
		const delays = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLElement>('[data-reveal-group="widgets"]'))
				.map((el) => ({
					order: Number(el.dataset.revealOrder),
					delayMs: Math.round(
						parseFloat(getComputedStyle(el).transitionDelay) * 1000
					),
				}))
				.sort((a, b) => a.order - b.order)
		);
		expect(delays.length).toBeGreaterThan(1);
		// First in the visual order leads with no delay.
		expect(delays[0].delayMs).toBe(0);
		for (let i = 1; i < delays.length; i++) {
			expect(delays[i].delayMs).toBeGreaterThan(delays[i - 1].delayMs);
		}

		await settleReveal(page);
		expect((await readReveal(page)).faded).toBe(0);
	});

	test("post images carry intrinsic dimensions", async ({ page }) => {
		// Not a reveal assertion: markdown can't express width/height, so these
		// images shipped without them and reflowed the article as each decoded. The
		// mapped <Img> reads the real file, so a re-export can't desync the numbers.
		await page.goto("/txt/mega-desk");
		const imgs = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLImageElement>(".txt-prose img")).map(
				(img) => ({
					src: img.getAttribute("src"),
					w: Number(img.getAttribute("width")),
					h: Number(img.getAttribute("height")),
					lazy: img.getAttribute("loading"),
					async: img.getAttribute("decoding"),
				})
			)
		);
		expect(imgs.length).toBeGreaterThan(0);

		for (const img of imgs) {
			expect(img.w).toBeGreaterThan(0);
			expect(img.h).toBeGreaterThan(0);
			expect(img.lazy).toBe("lazy");
			expect(img.async).toBe("async");
		}

		// The published aspect must match the REAL file, or the reserved box is wrong
		// and the attributes make CLS worse rather than better. Decoded separately,
		// because a lazy off-screen <img> reports naturalWidth 0 until it loads — so
		// the page's own elements can't answer this. Load each source into a detached
		// Image() (cache-warm, no layout involvement) and compare.
		const mismatches = await page.evaluate(async (list) => {
			const bad: string[] = [];
			await Promise.all(
				list.map(
					(item) =>
						new Promise<void>((resolve) => {
							const probe = new Image();
							probe.onload = () => {
								if (probe.naturalWidth !== item.w || probe.naturalHeight !== item.h) {
									bad.push(
										`${item.src}: declared ${item.w}x${item.h}, real ${probe.naturalWidth}x${probe.naturalHeight}`
									);
								}
								resolve();
							};
							probe.onerror = () => resolve(); // a broken src is not this test's business
							probe.src = item.src!;
						})
				)
			);
			return bad;
		}, imgs);

		expect(mismatches).toEqual([]);
	});
});

test.describe("ruler — mobile scrubber orientation", () => {
	test("years sit BELOW the ticks, on one level row", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		// The strip is generated on hydration; wait for the element to announce it.
		await page.waitForFunction(
			() => !!document.querySelector(".hero-carousel[data-ready]"),
			undefined,
			{ timeout: 6000 }
		);

		const rows = await page.evaluate(() => {
			const labels = Array.from(
				document.querySelectorAll<HTMLElement>(".hero-carousel .vc__tick-year")
			);
			return labels.map((label) => {
				const tick = label.closest<HTMLElement>(".vc__tick")!;
				const t = tick.getBoundingClientRect();
				const l = label.getBoundingClientRect();
				return {
					labelTop: Number(l.top.toFixed(1)),
					tickTop: Number(t.top.toFixed(1)),
					tickBottom: Number(t.bottom.toFixed(1)),
					tickHeight: Number(t.height.toFixed(1)),
				};
			});
		});

		expect(rows.length).toBeGreaterThan(1);

		for (const row of rows) {
			// The year reads below its tick. This is the BASELINE-UP arrangement: ticks
			// hang off the strip's top edge (facing the clip) and grow downward, so the
			// clip's dissolve lands on them and is spent before it reaches the type.
			expect(row.labelTop).toBeGreaterThanOrEqual(row.tickBottom - 0.5);
		}

		// Ticks are magnified per-frame toward the centre marker, so their BOTTOMS vary.
		// The label row must nonetheless stay level — that only holds if the labels are
		// anchored to the shared baseline rather than to each tick's moving edge (the
		// bobbing-label bug fixed in b207f96, mirrored onto this axis).
		const labelTops = new Set(rows.map((r) => r.labelTop));
		const tickBaselines = new Set(rows.map((r) => r.tickTop));
		expect(labelTops.size).toBe(1);
		expect(tickBaselines.size).toBe(1);
		// And the magnification really is live, so "level" isn't passing by accident.
		expect(new Set(rows.map((r) => r.tickHeight)).size).toBeGreaterThan(1);
	});

	test("the ticks stand in the dissolve; the year labels sit past it", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.waitForFunction(
			() => !!document.querySelector(".hero-carousel[data-ready]"),
			undefined,
			{ timeout: 6000 }
		);

		const geo = await page.evaluate(() => {
			// The dissolve lives on .vc__grid — the CLIP alone — and runs from the ruler's
			// top edge down over the tick growth extent. See the foot-of-the-scene note in
			// src/pages/index.astro. It is measured against the clip's box.
			const grid = document.querySelector<HTMLElement>(".hero-carousel .vc__grid")!;
			const carousel = document.querySelector<HTMLElement>(".hero-carousel")!;

			// Resolve the band to px by probing a real box: getComputedStyle returns the
			// authored calc() for a custom property, unevaluated.
			const probe = document.createElement("div");
			carousel.appendChild(probe);
			probe.style.height = "var(--hero-vc-ruler-top)";
			const rulerTop = probe.getBoundingClientRect().height;
			probe.style.height = "var(--hero-vc-dissolve)";
			const band = probe.getBoundingClientRect().height;
			probe.remove();

			const gridBottom = grid.getBoundingClientRect().bottom;
			const labels = Array.from(
				document.querySelectorAll<HTMLElement>(".hero-carousel .vc__tick-year")
			).map((l) => Number(l.getBoundingClientRect().top.toFixed(1)));
			const ticks = Array.from(
				document.querySelectorAll<HTMLElement>(".hero-carousel .vc__tick")
			).map((t) => Number(t.getBoundingClientRect().top.toFixed(1)));
			return {
				masked:
					getComputedStyle(grid).maskImage !== "none" &&
					getComputedStyle(grid).maskImage.includes("gradient"),
				// Where the clip starts dissolving, and where it is fully gone.
				fadeStart: Number((gridBottom - rulerTop).toFixed(1)),
				fadeEnd: Number((gridBottom - rulerTop + band).toFixed(1)),
				labels,
				ticks,
			};
		});

		expect(geo.masked).toBe(true);
		// Every label is clear of the fade — the whole reason the years moved BELOW the
		// ticks, and the constraint that sizes the band (a taller one eats the type).
		for (const top of geo.labels) expect(top).toBeGreaterThanOrEqual(geo.fadeEnd);
		// And the ticks begin inside it, so they emerge out of the dissolving halftone
		// instead of starting on a hard line.
		for (const top of geo.ticks) expect(top).toBeLessThan(geo.fadeEnd);
	});

	test("ONE fade, on the clip alone, with the strip and caption below it", async ({
		page,
	}) => {
		// THE THREE BUGS THIS PINS, all of which showed up as the foot of the mobile hero
		// looking wrong:
		//
		//  1. SWALLOWED BY THE FADE. The clip's bottom fade used to start at 78% of the
		//     hero height, which at 390x844 put it ~120px ABOVE the bottom UI — the
		//     caption and the whole ruler sat inside it, and the halftone behind the
		//     ticks measured 9% of its mid-video strength (luminance 10.0 vs 24.6), so
		//     the scrubber appeared to float on flat black.
		//
		//  2. TWO FADES. Fixing (1) by giving the clip and the strip their own bottom
		//     gradients produced a second artifact: each `100%` resolves against its own
		//     box (full scene vs a ~46px strip), so the two ramps disagreed and each had
		//     its own hard start edge — read as two stacked fade-outs.
		//
		//  3. THE CAPTION READ AS HERO COPY. It used to sit ABOVE the ruler, which put it
		//     directly under the intro lede where it looked like one more line of the
		//     page's own text rather than a label on the video.
		//
		// The fix for all three is one gradient on the CLIP ONLY, ending at the ruler's
		// tick band, with the strip and then the caption stacked below it in that order.
		// These assertions encode that architecture: exactly one masked layer, no
		// ancestor or sibling re-masking, and the reading order of the foot. Geometry
		// rather than pixels — the scene is live video, so luminance is too noisy to
		// assert on, but "which layer carries the mask" is exact.
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.waitForFunction(
			() => !!document.querySelector(".hero-carousel[data-ready]"),
			undefined,
			{ timeout: 6000 }
		);

		const geo = await page.evaluate(() => {
			const carousel = document.querySelector<HTMLElement>(".hero-carousel")!;
			const main = document.querySelector<HTMLElement>(".hero-carousel .vc__main")!;
			const grid = document.querySelector<HTMLElement>(".hero-carousel .vc__grid")!;
			const ruler = document.querySelector<HTMLElement>(
				".hero-carousel .vc__ruler"
			)!;
			const caption = document.querySelector<HTMLElement>(
				".hero-carousel .vc__caption"
			)!;

			const probe = document.createElement("div");
			carousel.appendChild(probe);
			probe.style.height = "var(--hero-vc-ruler-top)";
			const rulerTopVar = probe.getBoundingClientRect().height;
			probe.style.height = "var(--hero-vc-dissolve)";
			const dissolve = probe.getBoundingClientRect().height;
			probe.remove();

			const g = grid.getBoundingClientRect();
			const r = ruler.getBoundingClientRect();
			const c = caption.getBoundingClientRect();
			return {
				gridMask: getComputedStyle(grid).maskImage,
				mainMask: getComputedStyle(main).maskImage,
				rulerMask: getComputedStyle(ruler).maskImage,
				fadeStart: g.bottom - rulerTopVar,
				fadeEnd: g.bottom - rulerTopVar + dissolve,
				rulerTop: r.top,
				rulerBottom: r.bottom,
				captionTop: c.top,
				captionBottom: c.bottom,
				sceneBottom: document
					.querySelector<HTMLElement>(".fh__scene")!
					.getBoundingClientRect().bottom,
				rulerOpacity: getComputedStyle(ruler).opacity,
				captionOpacity: getComputedStyle(caption).opacity,
				yearTops: Array.from(
					document.querySelectorAll<HTMLElement>(".hero-carousel .vc__tick-year")
				).map((l) => l.getBoundingClientRect().top),
			};
		});

		// ONE masked layer: the clip carries the gradient...
		expect(geo.gridMask).toContain("gradient");
		// ...and neither the shared parent nor the strip re-masks. The parent is the one
		// that matters most here: a mask there applies to the WHOLE subtree, which is
		// what dragged the ruler and caption into the fade (bug 1).
		expect(geo.mainMask).toBe("none");
		expect(geo.rulerMask).toBe("none");

		// Anchored to measured geometry, not a percentage of the hero (bug 1).
		expect(geo.gridMask).toContain("calc");
		expect(geo.gridMask).not.toContain("78%");

		// The dissolve BEGINS at the ruler's top edge, so the ticks emerge out of it.
		expect(Math.abs(geo.fadeStart - geo.rulerTop)).toBeLessThan(1);
		// ...and is spent before the year row (bug 2's constraint, mirrored).
		for (const top of geo.yearTops) expect(top).toBeGreaterThanOrEqual(geo.fadeEnd);

		// READING ORDER (bug 3): ruler, THEN caption, and the caption is the last thing
		// in the scene. This is what stops the caption reading as hero copy.
		expect(geo.captionTop).toBeGreaterThanOrEqual(geo.rulerBottom);
		expect(geo.captionBottom).toBeLessThanOrEqual(geo.sceneBottom);

		// Both rest at the same lowered opacity, so they read as one band of video
		// chrome rather than as page text.
		expect(geo.captionOpacity).toBe(geo.rulerOpacity);
		expect(Number(geo.rulerOpacity)).toBeLessThan(1);
	});

	test("the foot re-stacks when the caption wraps", async ({ page }) => {
		// THE BUG THIS PINS, which was silent and permanent. The caption's height is an
		// INPUT to where the ruler sits (the hero lifts the strip by exactly that much to
		// clear it), and the ruler's top is in turn what the hero reserves room for. So
		// publishMetrics() has to write --vc-caption-h BEFORE it measures the ruler —
		// otherwise it reports the position the ruler is about to leave.
		//
		// Nothing would ever correct that: publishMetrics runs from a ResizeObserver, and
		// the consequence of the write is that the ruler MOVES, not that it resizes, so no
		// second callback is delivered. The published extent stays one caption-height
		// short forever. Measured at a two-line caption: 27px short, and the heading group
		// overlapped the ruler by 3px.
		//
		// Asserted as an INVARIANT ACROSS WRAP COUNTS rather than against fixed numbers:
		// what must hold is that the three bands keep their spacing however tall the
		// caption gets.
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.waitForFunction(
			() => !!document.querySelector(".hero-carousel[data-ready]"),
			undefined,
			{ timeout: 6000 }
		);

		const measure = () =>
			page.evaluate(() => {
				const host = document.querySelector<HTMLElement>(".hero-carousel")!;
				const r = (s: string) =>
					document.querySelector<HTMLElement>(s)!.getBoundingClientRect();

				// The ruler's top edge as the STYLESHEET computes it, resolved to px by
				// probing a real box (getComputedStyle hands back the authored calc()).
				const probe = document.createElement("div");
				probe.style.height = "var(--hero-vc-ruler-top)";
				host.appendChild(probe);
				const wantExtent = probe.getBoundingClientRect().height;
				probe.remove();

				const ruler = r(".hero-carousel .vc__ruler");
				const caption = r(".hero-carousel .vc__caption");
				return {
					// What JS published vs. what CSS actually laid out. These must agree —
					// their disagreement IS the staleness.
					published: parseFloat(
						getComputedStyle(host).getPropertyValue("--vc-bottom-ui-extent")
					),
					laidOut: host.getBoundingClientRect().bottom - ruler.top,
					wantExtent,
					captionGap: caption.top - ruler.bottom,
					clearance: ruler.top - r(".hero-intro").bottom,
				};
			});

		const setCaption = (desc: string, loc: string) =>
			page.evaluate(
				([d, l]) => {
					document.querySelector(".hero-carousel .vc__desc")!.textContent = d;
					document.querySelector(".hero-carousel .vc__loc")!.textContent = l;
				},
				[desc, loc]
			);

		const rows = [await measure()];
		for (const [desc, loc] of [
			["JOINED FISKER AND THEN SOME MORE WORDS HERE", "SAN FRANCISCO CALIFORNIA"],
			[
				"A MUCH LONGER DESCRIPTION THAT IS GUARANTEED TO WRAP ONTO SEVERAL LINES",
				"SOMEWHERE VERY FAR AWAY INDEED",
			],
		]) {
			await setCaption(desc, loc);
			// The RO → publish → re-layout round trip needs a couple of frames.
			await page.waitForTimeout(600);
			rows.push(await measure());
		}

		for (const row of rows) {
			// The published extent describes where the ruler REALLY is (the staleness bug),
			// and matches what the stylesheet asked for.
			expect(Math.abs(row.published - row.laidOut)).toBeLessThan(1);
			expect(Math.abs(row.published - row.wantExtent)).toBeLessThan(1);
			// The caption never collides with the strip above it...
			expect(row.captionGap).toBeGreaterThan(0);
			// ...and the heading group still clears the whole foot.
			expect(row.clearance).toBeGreaterThan(0);
		}

		// The caption really did grow, so the invariants above aren't holding vacuously.
		expect(new Set(rows.map((r) => Math.round(r.laidOut))).size).toBe(rows.length);
	});

	test("nothing paints a hard-edged band across the strip", async ({ page }) => {
		// THE BUG THIS PINS. The ruler carried a legibility scrim — a to-bottom black
		// wash behind the year row — whose hard TOP edge darkened the strip, after which
		// the halftone brightened again before the real bottom dissolve. Measured
		// background luminance (dot pattern averaged out): ~14 under the wash, recovering
		// to ~25 below it, then fading. A decline, a recovery, then a second decline
		// reads as two fade-outs stacked on one edge.
		//
		// Asserted as a STYLE contract rather than by sampling pixels: the scene is live
		// video behind a halftone shader, so a luminance threshold here would be flaky.
		// What must hold is that nothing paints an opaque, hard-edged band across the
		// strip — any wash has to be feathered at both ends.
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.waitForFunction(
			() => !!document.querySelector(".hero-carousel[data-ready]"),
			undefined,
			{ timeout: 6000 }
		);

		const bg = await page.evaluate(() => {
			const ruler = document.querySelector<HTMLElement>(
				".hero-carousel .vc__ruler"
			)!;
			const cs = getComputedStyle(ruler);
			return { image: cs.backgroundImage, color: cs.backgroundColor };
		});

		// No background layer at all is the shipped answer. If one is ever reintroduced
		// it must START transparent — a gradient whose first stop is opaque is exactly
		// the hard top edge that produced the phantom second fade.
		const hasImage = bg.image !== "none" && bg.image.trim() !== "";
		if (hasImage) {
			const firstStop = bg.image.slice(0, bg.image.indexOf(",", bg.image.indexOf("(")));
			expect(
				/rgba\([^)]*,\s*0\s*\)|transparent/.test(firstStop),
				`the ruler's background must start transparent (feathered), got: ${bg.image}`
			).toBe(true);
		}
		// And no flat opaque fill, which would band the strip with two hard edges.
		expect(bg.color === "rgba(0, 0, 0, 0)" || bg.color === "transparent").toBe(true);
	});
});

test.describe("reveal — the /txt front page", () => {
	test("8. FRONT PAGE: /txt settles on a hard load", async ({ page }) => {
		// The index gained reveal targets when it became a broadsheet (the secondary
		// band and the briefs rail; the masthead and lead are deliberately ungated
		// because the lead art is this page's LCP element).
		//
		// Tests 6 and 7 already round-trip through /txt, but only via ClientRouter —
		// and on that path teardownReveal() marks every target "in" and disarms before
		// the new page mounts, so they would pass even if the reveal were broken here.
		// A HARD load is the path that actually exercises the coordinator on this page.
		//
		// The total > 0 assertion is the point: before the redesign /txt had zero
		// targets, so `faded === 0` was vacuously true. Without this the suite would
		// silently keep passing if the targets were ever dropped.
		await page.goto("/txt");
		await settleReveal(page);

		const state = await readReveal(page);
		expect(state.total, "the front page should have reveal targets").toBeGreaterThan(0);
		expect(state.faded).toBe(0);

		// `pending` is deliberately NOT asserted. Both bands sit below the fold and
		// this test never scrolls, so their IntersectionObservers never fire and the
		// coordinator never marks them "in" — they reach opacity 1 because the inline
		// 3s backstop drops the armed class instead. That IS the terminality property
		// this file exists to guard: measured here as pending 3, faded 0. Requiring
		// pending 0 would assert the reveal ran, which on an unscrolled page is not
		// something the mechanism promises.
	});
});
