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
	test("years sit ABOVE the ticks, on one level row", async ({ page }) => {
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
					labelBottom: Number(l.bottom.toFixed(1)),
					tickTop: Number(t.top.toFixed(1)),
					tickBottom: Number(t.bottom.toFixed(1)),
					tickHeight: Number(t.height.toFixed(1)),
				};
			});
		});

		expect(rows.length).toBeGreaterThan(1);

		for (const row of rows) {
			// The year reads above its tick.
			expect(row.labelBottom).toBeLessThanOrEqual(row.tickTop + 0.5);
		}

		// Ticks are magnified per-frame toward the centre marker, so their TOPS vary.
		// The label row must nonetheless stay level — that only holds if the labels are
		// anchored to the shared baseline rather than to each tick's moving edge (the
		// bobbing-label bug fixed in b207f96, mirrored onto this axis).
		const labelBottoms = new Set(rows.map((r) => r.labelBottom));
		const tickBaselines = new Set(rows.map((r) => r.tickBottom));
		expect(labelBottoms.size).toBe(1);
		expect(tickBaselines.size).toBe(1);
		// And the magnification really is live, so "level" isn't passing by accident.
		expect(new Set(rows.map((r) => r.tickHeight)).size).toBeGreaterThan(1);
	});

	test("the tick roots fade out; the year labels do not", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.waitForFunction(
			() => !!document.querySelector(".hero-carousel[data-ready]"),
			undefined,
			{ timeout: 6000 }
		);

		const geo = await page.evaluate(() => {
			const ruler = document.querySelector<HTMLElement>(".hero-carousel .vc__ruler")!;
			const cs = getComputedStyle(ruler);
			const r = ruler.getBoundingClientRect();
			// The fade band, derived the same way the CSS derives it.
			const extent = parseFloat(cs.getPropertyValue("--vc-max-tick-h")) || 0;
			const band = extent * 0.6;
			const labels = Array.from(
				document.querySelectorAll<HTMLElement>(".hero-carousel .vc__tick-year")
			).map((l) => Number(l.getBoundingClientRect().bottom.toFixed(1)));
			const ticks = Array.from(
				document.querySelectorAll<HTMLElement>(".hero-carousel .vc__tick")
			).map((t) => Number(t.getBoundingClientRect().bottom.toFixed(1)));
			return {
				masked: cs.maskImage !== "none" && cs.maskImage.includes("gradient"),
				fadeStart: Number((r.bottom - band).toFixed(1)),
				labels,
				ticks,
			};
		});

		expect(geo.masked).toBe(true);
		// Every label is clear of the fade band — the whole reason the years moved up.
		for (const bottom of geo.labels) expect(bottom).toBeLessThanOrEqual(geo.fadeStart);
		// And the ticks reach into it, so they dissolve instead of ending on a hard line.
		for (const bottom of geo.ticks) expect(bottom).toBeGreaterThan(geo.fadeStart);
	});
});
