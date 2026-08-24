import { test, expect, type Page } from "@playwright/test";

/**
 * THE HERO INTRO FADE.
 *
 * The intro/CTAs under "other stories" are shown at rest and fade out over the first
 * sliver of scroll. The invariant that matters is the boring half — AT THE TOP OF THE
 * PAGE, THE INTRO IS VISIBLE — because that is the half that broke in production.
 *
 * WHAT WENT WRONG, and why these tests are shaped this way. The fade used to be
 * `animation-timeline: scroll(root)` with `animation-range: 0 100px`. An engine
 * without native scroll-timeline support DROPS the animation-timeline declaration and
 * keeps the rest, so the animation binds to the document timeline with
 * `animation-duration: auto` → 0s; with `fill-mode: both` a 0s animation is instantly
 * FINISHED, painting the element at its TO keyframe. The to-keyframe was
 * `opacity: 0; visibility: hidden`, so the intro was invisible at every scroll
 * position. The bundled polyfill only adopts an animation from its `animationstart`
 * hook, which is a race against first paint — so the symptom was INTERMITTENT
 * ("sometimes the intro doesn't show") rather than a clean, findable failure.
 * Measured before the fix: hidden at scroll 0 on 5/12 cold Firefox loads.
 *
 * Chromium (this suite's only engine) has native support and therefore CANNOT
 * reproduce that bug by loading the page. So the coverage here is split:
 *
 *   1. AT REST      the intro is visible at scroll 0 (the regression, directly).
 *   2. FADES        it still fades out, and comes back — the effect is intact.
 *   3. FAIL-VISIBLE with the JS driver dead, the intro is VISIBLE, not hidden. This
 *                   is the engine-independent assertion: it pins the CSS's default
 *                   state, which is what every unsupported/failed path lands on.
 *   4. NO TIMELINE  no scroll/view-timeline drives the sub any more — the mechanism
 *                   whose fallback is invisible content must not come back.
 *   6. SCROLLS FREE the intro's MOTION is flow layout, not a scroll-driven transform.
 *
 * On (6): the intro was once `position: absolute` inside the sticky pin, which glued it
 * to the viewport, so the driver wrote translateY(-scrollY) on it every frame to fake
 * ordinary scrolling. Touch scrolling runs on the compositor thread and that transform
 * ran on the main one, so on a phone the intro rode permanently a few frames behind the
 * rest of the page — visibly laggy, and unfixable by making the handler cheaper, since
 * the two are not the same clock. It is a static sibling of the pin now and the browser
 * moves it for free. This test fails if anything re-pins it.
 */

interface Sub {
	opacity: number;
	visibility: string;
	position: string;
	/** Viewport-space top edge, for checking it travels with the page. */
	top: number;
	/** Any transform on the element — must stay `none`; see (6) in the header. */
	transform: string;
	/** Animations attached to the element, with the timeline class driving each. */
	animations: Array<{ name: string; timeline: string | null; playState: string }>;
}

async function readSub(page: Page): Promise<Sub> {
	return page.evaluate(() => {
		const el = document.querySelector<HTMLElement>(".sh__sub");
		if (!el) throw new Error(".sh__sub not found");
		const cs = getComputedStyle(el);
		return {
			opacity: Number(cs.opacity),
			visibility: cs.visibility,
			position: cs.position,
			top: el.getBoundingClientRect().top,
			transform: cs.transform,
			animations: el.getAnimations().map((a) => ({
				name: (a as CSSAnimation).animationName ?? "(unnamed)",
				timeline: a.timeline?.constructor?.name ?? null,
				playState: a.playState,
			})),
		};
	});
}

/** Scroll to an absolute offset and let the rAF-coalesced driver publish. */
async function scrollTo(page: Page, y: number) {
	await page.evaluate((v) => window.scrollTo(0, v), y);
	// Two frames: one for the scroll event → schedule(), one for the rAF write.
	await page.evaluate(
		() =>
			new Promise<void>((r) =>
				requestAnimationFrame(() => requestAnimationFrame(() => r()))
			)
	);
}

test.describe("hero intro — the fade at rest", () => {
	test("1. AT REST: the intro is visible at the top of the page", async ({
		page,
	}) => {
		await page.goto("/");
		// The lockup measures itself after fonts load; wait for the settle signal it
		// publishes rather than a bare timeout.
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });
		await scrollTo(page, 0);

		const sub = await readSub(page);
		expect(sub.opacity).toBe(1);
		expect(sub.visibility).toBe("visible");
	});

	test("2. FADES: it fades out on scroll, and returns at the top", async ({
		page,
	}) => {
		await page.goto("/");
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });

		// Read the fade distance from CSS rather than restating 100px, so retuning the
		// token doesn't turn into a test failure.
		const span = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>(".sh__sub")!;
			return parseFloat(
				getComputedStyle(el).getPropertyValue("--sh-sub-fade-px")
			);
		});
		expect(span).toBeGreaterThan(0);

		await scrollTo(page, 0);
		expect((await readSub(page)).opacity).toBe(1);

		// Mid-fade: strictly between the endpoints, so this fails if the fade has
		// become a step function (which is exactly what a 0s animation looks like).
		await scrollTo(page, span / 2);
		const mid = (await readSub(page)).opacity;
		expect(mid).toBeGreaterThan(0.1);
		expect(mid).toBeLessThan(0.9);

		// Past the end: fully out, and no longer a pointer target.
		await scrollTo(page, span + 50);
		const out = await readSub(page);
		expect(out.opacity).toBe(0);
		expect(out.visibility).toBe("hidden");

		// Reversible — the fade is a function of position, not a one-shot latch.
		await scrollTo(page, 0);
		const back = await readSub(page);
		expect(back.opacity).toBe(1);
		expect(back.visibility).toBe("visible");
	});

	test("3. FAIL-VISIBLE: the intro shows with the JS driver dead", async ({
		browser,
	}) => {
		// The whole point of the rewrite: the CSS's own default state must be SHOWN, so
		// that a missing driver (dead bundle, throw, unsupported engine) degrades to
		// visible content. This is the assertion that generalises past Chromium.
		const context = await browser.newContext();
		const page = await context.newPage();
		await context.route("**/_astro/*.js", (route) => route.abort());

		await page.goto("/", { waitUntil: "load" }).catch(() => {
			/* aborted subresources are expected here */
		});

		const sub = await readSub(page);
		expect(sub.opacity).toBe(1);
		expect(sub.visibility).toBe("visible");
		// With no JS, nothing publishes the fade properties at all.
		expect(sub.animations).toHaveLength(0);

		await context.close();
	});

	test("4. NO TIMELINE: the fade is not driven by a scroll/view timeline", async ({
		page,
	}) => {
		await page.goto("/");
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });

		// A ScrollTimeline/ViewTimeline here means the CSS mechanism whose unsupported
		// fallback is INVISIBLE CONTENT has come back. The driver is JS by design; see
		// the .sh__sub note in packages/stories-heading/src/styles.css.
		const sub = await readSub(page);
		const timelines = sub.animations.map((a) => a.timeline ?? "");
		expect(timelines.filter((t) => /ScrollTimeline|ViewTimeline/.test(t))).toEqual(
			[]
		);
	});

	test("6. SCROLLS FREE: the intro moves with the page, untouched by JS", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 664 });
		await page.goto("/");
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });

		await scrollTo(page, 0);
		const rest = await readSub(page);
		// Not sticky, not absolute inside the sticky pin — a plain in-flow box. This is
		// the structural half of the assertion: it is what makes the rest possible.
		expect(rest.position).toBe("static");
		expect(rest.transform).toBe("none");

		// And the behavioural half: its viewport position falls by exactly the scroll
		// distance, because flow layout — not a driver — is what moves it. A tolerance of
		// 1px covers sub-pixel layout only; a re-pinned intro is off by the whole 60px,
		// and one "helpfully" re-animated by JS drifts by whatever the shift was.
		for (const y of [30, 60]) {
			await scrollTo(page, y);
			const now = await readSub(page);
			expect(now.transform).toBe("none");
			expect(Math.abs(now.top - (rest.top - y))).toBeLessThan(1);
		}
	});

	test("5. REDUCED MOTION: shown, in flow, and never faded", async ({
		browser,
	}) => {
		const context = await browser.newContext({ reducedMotion: "reduce" });
		const page = await context.newPage();
		await page.goto("/");
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });

		// In normal flow (not fixed to the viewport) and fully shown — scrolled or not.
		const atTop = await readSub(page);
		expect(atTop.opacity).toBe(1);
		expect(atTop.position).toBe("static");

		await scrollTo(page, 400);
		const scrolled = await readSub(page);
		expect(scrolled.opacity).toBe(1);
		expect(scrolled.visibility).toBe("visible");

		await context.close();
	});
});
