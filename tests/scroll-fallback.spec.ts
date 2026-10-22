import { test, expect } from "./fixtures/test";

/**
 * ONE MECHANISM PER ENGINE, AND THE EFFECT ALWAYS WORKS.
 *
 * The lockup's scroll effects are CSS scroll-progress timelines, gated on
 * `@supports (animation-timeline: scroll())`. That gate is what keeps them safe on
 * engines without the feature — but a gate alone would mean those engines get no
 * effect at all, which is what happened: Firefox 153 reports the feature as
 * unsupported, so the wipe and the intro fade simply did not exist there. The old
 * per-frame JS driver is kept behind the SAME feature test to cover them.
 *
 * Two mechanisms for one effect is a standing hazard, so this file pins both halves:
 *
 *   1. Exactly ONE of them drives it. If the CSS `@supports` condition and the JS
 *      feature test ever drift apart, an engine either runs both (the JS writes fight
 *      the animation) or neither (no effect, silently). Neither shows up as an error.
 *   2. The user-visible outcome is the same either way — the wipe advances with
 *      scroll, and the intro is visible at rest.
 *
 * RUNS IN BOTH ENGINES (see playwright.config.ts). It is deliberately written to
 * assert the same behaviour from either side of the branch rather than to expect a
 * particular engine, so it keeps working when Firefox ships scroll-driven animations
 * and simply swaps which path it takes.
 */

test("the wipe is driven by exactly one mechanism, and works either way", async ({
	page,
}) => {
	await page.goto("/");
	await page
		.locator("stories-heading[data-ready]")
		.waitFor({ state: "attached", timeout: 15_000 });

	const state = await page.evaluate(() => {
		const solid = document.querySelector<HTMLElement>(".sh__solid")!;
		return {
			supports:
				typeof CSS !== "undefined" &&
				typeof CSS.supports === "function" &&
				CSS.supports("animation-timeline", "scroll()"),
			// The CSS path's signature: a running animation on a scroll timeline.
			scrollAnimations: solid
				.getAnimations()
				.filter((a) => /ScrollTimeline|ViewTimeline/.test(a.timeline?.constructor?.name ?? ""))
				.length,
			// The JS path's signature: --sh-clip written as an INLINE style. The
			// stylesheet only ever declares it on the host, so an inline value on this
			// element can only have come from the fallback driver.
			inlineClip: solid.style.getPropertyValue("--sh-clip"),
		};
	});

	if (state.supports) {
		expect(state.scrollAnimations, "CSS should drive the wipe here").toBeGreaterThan(0);
		expect(
			state.inlineClip,
			"the JS fallback is ALSO running — the feature test and the @supports condition have drifted apart"
		).toBe("");
	} else {
		expect(
			state.scrollAnimations,
			"no scroll-timeline support, so nothing should be animating"
		).toBe(0);
		expect(
			state.inlineClip,
			"no scroll-timeline support and no JS fallback either — this engine gets no effect at all"
		).not.toBe("");
	}
});

test("the wipe advances with scroll on any engine", async ({ page }) => {
	// The outcome the two mechanisms exist to produce, asserted without caring which
	// one produced it. Reads the clip fraction rather than the raw string so the two
	// paths' different rounding (79.87% vs 79.8333%) doesn't matter.
	await page.goto("/");
	await page
		.locator("stories-heading[data-ready]")
		.waitFor({ state: "attached", timeout: 15_000 });

	const clipAt = async (y: number) => {
		await page.evaluate((v) => window.scrollTo(0, v), y);
		await page.waitForTimeout(250);
		return page.evaluate(() => {
			const cp = getComputedStyle(document.querySelector<HTMLElement>(".sh__solid")!).clipPath;
			const m = /inset\(([\d.]+)%/.exec(cp);
			return m ? Number(m[1]) / 100 : cp === "none" ? 0 : null;
		});
	};

	// The range is derived from the hero's own geometry, so rather than hardcode scroll
	// offsets, sample across a span wide enough to contain it at any viewport.
	const hidden = await clipAt(0);
	expect(hidden, "the solid layer should start fully clipped").toBeCloseTo(1, 1);

	const samples: number[] = [];
	for (let y = 100; y <= 900; y += 100) samples.push((await clipAt(y)) ?? NaN);

	// Monotonically revealing, and it actually gets there.
	for (let i = 1; i < samples.length; i++) {
		expect(
			samples[i],
			`the wipe went backwards between the ${i - 1}th and ${i}th sample: ${JSON.stringify(samples)}`
		).toBeLessThanOrEqual(samples[i - 1] + 0.001);
	}
	expect(
		Math.min(...samples),
		`the wipe never completed: ${JSON.stringify(samples)}`
	).toBeCloseTo(0, 1);
});

test("the intro is visible at rest on any engine", async ({ page }) => {
	// The fail-visible property, checked on whichever path this engine takes.
	await page.goto("/");
	await page
		.locator("stories-heading[data-ready]")
		.waitFor({ state: "attached", timeout: 15_000 });
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(250);

	const sub = await page.evaluate(() => {
		const cs = getComputedStyle(document.querySelector<HTMLElement>(".sh__sub")!);
		return { opacity: Number(cs.opacity), visibility: cs.visibility };
	});
	expect(sub.opacity).toBe(1);
	expect(sub.visibility).toBe("visible");
});
