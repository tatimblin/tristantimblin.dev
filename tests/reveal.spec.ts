import { test, expect, type Page } from "./fixtures/test";

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
 *   3. HERO-FREE    nothing in the lockup is ever gated (its wordmark is the LCP
 *                   element, so a reveal there would delay a real metric).
 *   4. REDUCED      the reduced-motion visitor is never armed at all.
 *   5. TOKENS       the motion tokens survive the production build (the canary for
 *                   a silently-dropped declaration — see the longhands note in
 *                   src/styles/reveal.css).
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
		await page.goto("/txt/mega-desk/");

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
		await page.goto("/txt/mega-desk/");

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

		// The lockup must contain no reveal targets: the homepage's LCP element is
		// the wordmark text inside it, so gating anything here would trade a real
		// metric for a cosmetic one. A guard against a future "improvement" that
		// extends the reveal upward into the opener. (The grid around it holds the
		// cards, which legitimately ARE revealed.)
		expect(await page.locator("stories-heading [data-reveal]").count()).toBe(0);
		expect(await page.locator("stories-heading[data-reveal]").count()).toBe(0);

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
		// Navigate by dispatching the click rather than locator.click(): the navigation
		// is what this test cares about, not the hit-testing.
		await page.evaluate(() => {
			const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
				(a) => a.textContent?.trim() === "Writing"
			);
			link?.click();
		});
		await page.waitForURL("**/txt/");
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
		// The bike drawing (BikeStats.astro) is hidden while the page is armed and its
		// card hasn't been marked `data-reveal-state="in"` by the reveal coordinator.
		// Astro executes a component's bundled script exactly once, but ClientRouter
		// replaces the DOM on every navigation — so anything that marks the card from
		// module scope ends up on a detached node and the fresh card never comes in.
		// Its resting state is then `opacity: 0`, so the regression is INVISIBLE
		// CONTENT, not a missing flourish. (Measured on the old ::before watermark,
		// which had its own observer: 0.66 on first load, 0 after a round trip.)
		const bikeOpacity = () =>
			page
				.locator(".wx-baywheels .wx-bw-bike")
				.evaluate((el: Element) => parseFloat(getComputedStyle(el).opacity));

		// POLL, don't sample. Coming in starts a CSS TRANSITION on .wx-bw-bike, so
		// the bike takes ~1s to reach its resting opacity of 1 — and settleReveal() does not
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
				.poll(bikeOpacity, {
					timeout: 8000,
					message: `the bike drawing never faded in (${when})`,
				})
				.toBeGreaterThan(0);

		// Plain scroll, NOT locator.scrollIntoViewIfNeeded() — see the note on the same
		// call in "the widget row is held until scrolled to". This widget sits in
		// the widget grid, the row that never fully settles (its reveal transition and the
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
		await page.waitForURL("**/txt/");
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
			document.querySelector('[data-widget="cursive"]')?.scrollIntoView({ block: "center" })
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
		// mapped <Img> takes them off the image's import (Astro reads the file at
		// build time), so a re-export can't desync the numbers.
		await page.goto("/txt/mega-desk/");
		const imgs = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLImageElement>(".ds-prose img")).map(
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

test.describe("reveal — the /txt index", () => {
	test("8. INDEX: /txt has no reveal targets and nothing hidden on a hard load", async ({
		page,
	}) => {
		// The index is a plain list of links, with no images to wait for. The
		// reveal is an ASSET-arrival mechanism — it holds a region back until
		// its image has decoded — so the index carries no targets at all. This
		// pins that: the coordinator has nothing to hold, and the page is fully
		// visible on a hard load — the path tests 6 and 7 do not exercise, since
		// ClientRouter tears the reveal down before a swapped page mounts.
		await page.goto("/txt/");
		const state = await readReveal(page);
		expect(state.total, "the index should carry no reveal targets").toBe(0);
		expect(state.faded).toBe(0);
		await expect(page.locator("a.stack__title").first()).toBeVisible();
	});
});
