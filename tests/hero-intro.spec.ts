import { test, expect, type Page } from "./fixtures/test";
import { LOCKUP, VIDEOS, openHome, scrollAndSettle } from "./fixtures/opener";

/**
 * THE HERO INTRO'S FAILURE MODES. Its fade is `animation-timeline: scroll(root)`.
 * An engine without the feature keeps the rest of the declaration on the document
 * timeline, where `animation-duration: auto` is 0s and `fill-mode: both` paints the
 * to-keyframe (hidden) forever. The ordinary fade: home-opener and scroll-fallback.
 */

interface Sub {
	opacity: number;
	visibility: string;
	position: string;
	transform: string;
	/** Animations attached to the element, with the timeline class driving each. */
	animations: Array<{ name: string; timeline: string | null; playState: string }>;
}

function readSub(page: Page): Promise<Sub> {
	return page.evaluate((selector) => {
		const el = document.querySelector<HTMLElement>(selector);
		if (!el) throw new Error(`${selector} not found`);
		const cs = getComputedStyle(el);
		return {
			opacity: Number(cs.opacity),
			visibility: cs.visibility,
			position: cs.position,
			transform: cs.transform,
			animations: el.getAnimations().map((a) => ({
				name: (a as CSSAnimation).animationName ?? "(unnamed)",
				timeline: a.timeline?.constructor?.name ?? null,
				playState: a.playState,
			})),
		};
	}, LOCKUP.sub);
}

test.describe("hero intro", () => {
	test("past the fade it is hidden and takes no pointer, and it returns at the top", async ({ page }) => {
		await openHome(page);
		// Read off the CSS, so retuning the distance isn't a test failure.
		const span = await page.evaluate(
			(selector) => parseFloat(getComputedStyle(document.querySelector(selector)!).getPropertyValue("--sh-sub-fade-px")),
			LOCKUP.sub,
		);
		expect(span).toBeGreaterThan(0);

		await scrollAndSettle(page, span + 50, "frames");
		const out = await readSub(page);
		expect(out.opacity).toBe(0);
		expect(out.visibility).toBe("hidden");

		// A function of position, not a one-shot latch.
		await scrollAndSettle(page, 0, "frames");
		const back = await readSub(page);
		expect(back.opacity).toBe(1);
		expect(back.visibility).toBe("visible");
	});

	for (const reducedMotion of ["no-preference", "reduce"] as const) {
		// A transform or a re-pin would put the intro on the main thread's clock,
		// a few frames behind the page on a phone's compositor scroll. Relative only
		// so it paints over the word; it takes no offset.
		test(`it stays an in-flow box with no transform (${reducedMotion})`, async ({ browser }) => {
			const context = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 664 } });
			const page = await context.newPage();
			await openHome(page);
			for (const y of [0, 30, 60]) {
				await scrollAndSettle(page, y, "frames");
				const sub = await readSub(page);
				expect(sub.position, `at ${y}`).toBe("relative");
				expect(sub.transform, `at ${y}`).toBe("none");
			}
			await context.close();
		});
	}

	test("reduced motion: still shown well past the fade", async ({ browser }) => {
		const context = await browser.newContext({ reducedMotion: "reduce" });
		const page = await context.newPage();
		await openHome(page);
		await scrollAndSettle(page, 400, "frames");
		const scrolled = await readSub(page);
		expect(scrolled.opacity).toBe(1);
		expect(scrolled.visibility).toBe("visible");
		await context.close();
	});

	test("with every module dead the intro shows, and nothing drives it from the document timeline", async ({
		browser,
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await context.route("**/_astro/*.js", (route) => route.abort());

		await page.goto("/", { waitUntil: "load" }).catch(() => {
			/* aborted subresources are expected here */
		});

		const sub = await readSub(page);
		expect(sub.opacity).toBe(1);
		expect(sub.visibility).toBe("visible");

		// The bug is a document-timeline binding, not an animation existing: a scroll
		// timeline's progress is a position, and at rest that is 0.
		for (const a of sub.animations) {
			expect(
				a.timeline,
				`"${a.name}" is on ${a.timeline} — a document-timeline binding is the 0s-snap bug`
			).toMatch(/ScrollTimeline|ViewTimeline/);
		}

		await context.close();
	});

	test("every scroll-driven rule sits inside @supports", async ({ page }) => {
		// Read from the CSSOM: this spec runs in Chromium, which has the feature, so
		// the failure can't be reproduced by loading the page and an ungated rule
		// would pass every other test here.
		await openHome(page);

		const rules = await page.evaluate(() => {
			const found: Array<{ selector: string; gated: boolean; conditions: string[] }> = [];
			// A CSSStyleRule also has .cssRules (CSS nesting made it a grouping rule),
			// so check the rule and THEN recurse: an early `continue` on "has cssRules"
			// skips every style rule on the page.
			const walk = (list: CSSRuleList, conditions: string[]) => {
				for (const rule of Array.from(list)) {
					const condition =
						(rule as CSSSupportsRule | CSSMediaRule).conditionText ?? null;
					const inner = condition ? [...conditions, condition] : conditions;

					// Only rules that BIND a scroll or view timeline: `animation: none`
					// resets animation-timeline to `auto`, so the property's mere
					// presence would report a rule that removes a binding.
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

		// The lockup's three effects (the drift, the wipe, the fade) and the
		// videos card's dock.
		expect(rules.length).toBeGreaterThanOrEqual(4);
		for (const r of rules) {
			expect(
				r.gated,
				`"${r.selector}" sets animation-timeline outside @supports (conditions: ${JSON.stringify(r.conditions)}) — an engine without the feature will snap it to its to-keyframe`
			).toBe(true);
		}
	});

	test("the timeline longhands survive the production build", async ({ page }) => {
		// `animation` resets `animation-timeline`, so a minifier that folds the two
		// writes an invalid shorthand, the declaration drops and animation-name
		// computes to `none`. Nothing errors, and `animation-range` survives to look
		// plausible. Hence every part is a longhand, and this asserts the outcome: a
		// running animation on a scroll timeline. Dev doesn't minify, so this needs
		// the built site (playwright.config.ts).
		await openHome(page);

		const running = await page.evaluate(
			(selectors) =>
				selectors.map((selector) => {
					const el = document.querySelector(selector);
					const anims = el ? el.getAnimations() : [];
					return {
						selector,
						found: !!el,
						names: anims.map((a) => (a as CSSAnimation).animationName),
						timelines: anims.map((a) => a.timeline?.constructor?.name ?? "none"),
					};
				}),
			[LOCKUP.wordmark, LOCKUP.solid, LOCKUP.sub, VIDEOS.card],
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
});
