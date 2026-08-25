import { test, expect, type Page } from "@playwright/test";

/**
 * THE HERO INTRO FADE.
 *
 * The intro/CTAs under "other stories" are shown at rest and fade out over the first
 * sliver of scroll. The invariant that matters is the boring half — AT THE TOP OF THE
 * PAGE, THE INTRO IS VISIBLE — because that is the half that broke in production.
 *
 * WHAT WENT WRONG, and why these tests are shaped this way. The fade is
 * `animation-timeline: scroll(root)` over `0 100px`. An engine WITHOUT native
 * scroll-timeline support drops only the animation-timeline declaration and keeps the
 * rest, so the animation binds to the document timeline with
 * `animation-duration: auto` → 0s; with `fill-mode: both` a 0s animation is instantly
 * FINISHED, painting the element at its TO keyframe — `opacity: 0; visibility: hidden`.
 * The intro was then invisible at every scroll position. Measured at the time: hidden
 * at scroll 0 on 5/12 cold Firefox loads.
 *
 * THAT MECHANISM IS BACK, AND THE FIX IS THE GATE, NOT ITS ABSENCE. It was removed once
 * and re-driven from JS; the JS then had the opposite problem (a main-thread handler
 * cannot keep step with a compositor scroll on a phone), so it has returned to CSS —
 * this time wrapped in `@supports (animation-timeline: scroll())`, which means an
 * engine without the feature applies NOTHING and keeps the stylesheet's shown default.
 * That gate did not work before only because the site bundled a scroll-timeline
 * polyfill that does not transpile @supports conditions, so gating deleted the effect
 * on exactly the engines it existed for. The polyfill is gone (Section.astro dropped
 * it), so the gate is now the whole safety story — which is what tests 3 and 4 pin.
 *
 * Chromium (this suite's only engine) has native support and therefore CANNOT
 * reproduce the unsupported-engine path by loading the page. So the coverage is split:
 *
 *   1. AT REST      the intro is visible at scroll 0 (the regression, directly).
 *   2. FADES        it still fades out, and comes back — the effect is intact.
 *   3. FAIL-VISIBLE with every module dead, the intro is VISIBLE at rest, and nothing
 *                   drives it from the DOCUMENT timeline — that binding, not the
 *                   animation itself, is what painted the to-keyframe forever.
 *   4. GATED        the scroll-driven rules sit inside @supports, so an engine that
 *                   lacks the feature applies nothing instead of snapping to hidden.
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

	test("3. FAIL-VISIBLE: the intro shows with every module dead", async ({
		browser,
	}) => {
		// A missing bundle (dead JS, a throw, a 404) must still leave the intro VISIBLE
		// at rest. It is now the CSS that guarantees this rather than a JS default, and
		// the effect survives the outage entirely — the fade is not JS-driven any more.
		const context = await browser.newContext();
		const page = await context.newPage();
		await context.route("**/_astro/*.js", (route) => route.abort());

		await page.goto("/", { waitUntil: "load" }).catch(() => {
			/* aborted subresources are expected here */
		});

		const sub = await readSub(page);
		expect(sub.opacity).toBe(1);
		expect(sub.visibility).toBe("visible");

		// AND NOTHING IS ON THE DOCUMENT TIMELINE. This is the precise shape of the old
		// production bug: it was never "an animation exists", it was an animation bound
		// to the document timeline, where duration:auto resolves to 0s and fill:both
		// paints the to-keyframe (hidden) forever. A scroll timeline cannot do that —
		// its progress is a scroll position, and at rest that is 0.
		for (const a of sub.animations) {
			expect(
				a.timeline,
				`"${a.name}" is on ${a.timeline} — a document-timeline binding is the 0s-snap bug`
			).toMatch(/ScrollTimeline|ViewTimeline/);
		}

		await context.close();
	});

	test("4. GATED: every scroll-driven rule sits inside @supports", async ({
		page,
	}) => {
		// THE ONE THING HOLDING THE OLD BUG SHUT. An engine without scroll timelines
		// drops `animation-timeline` and keeps the rest, which lands the animation on
		// the document timeline and paints its to-keyframe forever. Wrapping the whole
		// declaration block in @supports means such an engine applies NOTHING and keeps
		// the stylesheet's static state instead.
		//
		// Asserted against the CSSOM rather than by loading an engine that lacks the
		// feature, because this suite has no such engine — Chromium supports it, so the
		// failure is structurally unreproducible here and only the SHAPE of the CSS can
		// be checked. An ungated rule would pass every other test in this file.
		await page.goto("/");
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });

		const rules = await page.evaluate(() => {
			const found: Array<{ selector: string; gated: boolean; conditions: string[] }> = [];
			// NB a CSSStyleRule also has .cssRules these days (CSS nesting made it a
			// grouping rule), so this must CHECK the rule and THEN recurse — an
			// early `continue` on "has cssRules" skips every style rule on the page.
			const walk = (list: CSSRuleList, conditions: string[]) => {
				for (const rule of Array.from(list)) {
					const condition =
						(rule as CSSSupportsRule | CSSMediaRule).conditionText ?? null;
					const inner = condition ? [...conditions, condition] : conditions;

					// Only rules that BIND to a scroll/view timeline. Matching on the
					// property's mere presence over-reports: `animation: none` resets
					// animation-timeline to `auto`, so the ≤900px rule that switches the
					// "&" parallax off would read as an ungated binding when it is the
					// opposite — a rule that removes one.
					const style = rule as CSSStyleRule;
					const timeline = style.style?.getPropertyValue("animation-timeline");
					if (timeline && /scroll\(|view\(/.test(timeline)) {
						found.push({
							selector: style.selectorText,
							gated: conditions.some((c) => /animation-timeline/.test(c)),
							conditions,
						});
					}

					const nested = (rule as CSSGroupingRule).cssRules;
					if (nested) walk(nested, inner);
				}
			};
			for (const sheet of Array.from(document.styleSheets)) {
				try {
					walk(sheet.cssRules, []);
				} catch {
					/* cross-origin sheet; none of ours */
				}
			}
			return found;
		});

		// The lockup's three effects: the wipe, the intro fade, the "&" parallax.
		expect(rules.length).toBeGreaterThanOrEqual(3);
		for (const r of rules) {
			expect(
				r.gated,
				`"${r.selector}" sets animation-timeline outside @supports (conditions: ${JSON.stringify(r.conditions)}) — an engine without the feature will snap it to its to-keyframe`
			).toBe(true);
		}
	});

	test("7. MINIFIER: the timeline longhands survive the production build", async ({
		page,
	}) => {
		// THE TRAP THIS EXISTS FOR, which is invisible in dev and silent in prod.
		// `animation-timeline` is deliberately NOT part of the `animation` shorthand —
		// the shorthand RESETS it. A CSS minifier that does not know this happily folds
		//
		//     animation: sh-heading-wipe linear both;
		//     animation-timeline: scroll(root block);
		//
		// into `animation: linear both sh-heading-wipe scroll(root)`, which is not valid
		// syntax, so the whole declaration is dropped and animation-name computes to
		// `none`. Nothing errors. The effect simply does not exist in the built site
		// while the source looks correct — and `animation-range`, a separate longhand,
		// survives, so even the computed styles look half-plausible.
		//
		// Measured: that is exactly what shipped on the first attempt here. The fix is to
		// write every part as a longhand so there is no shorthand to fold into, and this
		// asserts the OUTCOME rather than the syntax — an animation that is actually
		// running, on a scroll timeline, for each of the lockup's three effects.
		//
		// This is why the suite runs against `astro build` output and not the dev server
		// (see playwright.config.ts): dev does not minify, so dev cannot catch it.
		await page.goto("/");
		await page
			.locator("stories-heading[data-ready]")
			.waitFor({ state: "attached", timeout: 10_000 });

		const running = await page.evaluate(() =>
			[".sh__solid", ".sh__sub", ".sh__amp"].map((selector) => {
				const el = document.querySelector(selector);
				const anims = el ? el.getAnimations() : [];
				return {
					selector,
					found: !!el,
					names: anims.map((a) => (a as CSSAnimation).animationName),
					timelines: anims.map((a) => a.timeline?.constructor?.name ?? "none"),
				};
			})
		);

		for (const r of running) {
			expect(r.found, `${r.selector} is missing`).toBe(true);
			expect(
				r.names.filter(Boolean).length,
				`${r.selector} has no running animation — the minifier has most likely folded its longhands into an invalid \`animation\` shorthand`
			).toBeGreaterThan(0);
			expect(
				r.timelines,
				`${r.selector} is not on a scroll timeline`
			).toContain("ScrollTimeline");
		}
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
