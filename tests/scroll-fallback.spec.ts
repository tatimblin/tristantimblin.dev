import { test, expect, lockupReady, type Page } from "./fixtures/test";

/**
 * THE SCROLL EFFECTS, BY OUTCOME. The lockup's drift, wipe and fade and the
 * videos card's dock and chrome are CSS scroll-progress timelines behind
 * `@supports (animation-timeline: scroll())`. Each test asserts the effect
 * where the engine has them and the static presentation where it doesn't, so
 * it holds in either kind of engine (playwright.config.ts runs it in Firefox
 * too).
 */

const hasTimelines = (page: Page) =>
	page.evaluate(() => CSS.supports("animation-timeline", "scroll()"));

async function scrollAndSettle(page: Page, y: number) {
	await page.evaluate((v) => window.scrollTo(0, v), y);
	await page.waitForTimeout(250);
}

/** The share of the solid word still clipped away (0 is the whole word). */
const readClip = (page: Page) =>
	page.evaluate(() => {
		const cp = getComputedStyle(document.querySelector<HTMLElement>(".sh__solid")!).clipPath;
		const m = /inset\(([\d.]+)%/.exec(cp);
		return m ? Number(m[1]) / 100 : cp === "none" ? 0 : null;
	});

const readLift = (page: Page) =>
	page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".wx-videos")!).transform).m42);

/** Read off the date, which fades with the frame. */
const readChrome = (page: Page) =>
	page.evaluate(() => Number(getComputedStyle(document.querySelector(".wx-videos__date")!).opacity));

const videosMounted = (page: Page) =>
	page.locator(".wx-videos[data-widget-state=mounted]").waitFor({ state: "attached", timeout: 15_000 });

test("the wipe advances with scroll, or the word is solid throughout", async ({ page }) => {
	await page.goto("/");
	await lockupReady(page);

	const clipAt = async (y: number) => {
		await scrollAndSettle(page, y);
		return readClip(page);
	};

	if (!(await hasTimelines(page))) {
		for (const y of [0, 300, 900]) expect(await clipAt(y), `clipped at scroll ${y}`).toBe(0);
		return;
	}

	expect(await clipAt(0), "the solid layer should start fully clipped").toBeCloseTo(1, 1);

	// The range comes from the hero's geometry, so sample a span that contains it
	// at any viewport.
	const samples: number[] = [];
	for (let y = 100; y <= 900; y += 100) samples.push((await clipAt(y)) ?? NaN);

	for (let i = 1; i < samples.length; i++) {
		expect(
			samples[i],
			`the wipe went backwards between the ${i - 1}th and ${i}th sample: ${JSON.stringify(samples)}`
		).toBeLessThanOrEqual(samples[i - 1] + 0.001);
	}
	expect(Math.min(...samples), `the wipe never completed: ${JSON.stringify(samples)}`).toBeCloseTo(0, 1);
});

test("the intro is visible at rest", async ({ page }) => {
	await page.goto("/");
	await lockupReady(page);
	await scrollAndSettle(page, 0);

	const sub = await page.evaluate(() => {
		const cs = getComputedStyle(document.querySelector<HTMLElement>(".sh__sub")!);
		return { opacity: Number(cs.opacity), visibility: cs.visibility };
	});
	expect(sub.opacity).toBe(1);
	expect(sub.visibility).toBe("visible");
});

test("the word drifts from the first pixel of scroll, then pins", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	await lockupReady(page);

	const topAt = async (y: number) => {
		await scrollAndSettle(page, y);
		return page.evaluate(() => document.querySelector(".sh__wordmark")!.getBoundingClientRect().top);
	};
	const rest = await topAt(0);
	const early = await topAt(20);
	if (await hasTimelines(page)) {
		// Moving at once, and only a fraction of the page.
		expect(rest - early, "still at scroll 20").toBeGreaterThan(1.5);
		expect(rest - early, "moving with the page, not drifting").toBeLessThan(6);
	} else {
		expect(Math.abs(rest - early), "held where it rests, with no drift").toBeLessThan(0.5);
	}
	// Then pinned: the same place across a stretch of scroll, held a little above
	// its rest, in the middle.
	const a = await topAt(280);
	const b = await topAt(380);
	expect(Math.abs(a - b), "pinned").toBeLessThan(0.5);
	expect(rest - a, "a small rise in all").toBeLessThan(50);
});

test("the card docks with scroll, or sits in its cell throughout", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	await videosMounted(page);

	const at = async (y: number) => {
		await scrollAndSettle(page, y);
		return readLift(page);
	};

	if (!(await hasTimelines(page))) {
		for (const y of [0, 200, 3000]) expect(await at(y), `lifted at scroll ${y}`).toBe(0);
		return;
	}

	const rest = await at(0);
	expect(rest, "parked above its slot at scroll 0").toBeLessThan(-100);
	const mid = await at(200);
	expect(mid).toBeGreaterThan(rest);
	expect(mid).toBeLessThan(0);
	expect(await at(3000), "docked: no lift left").toBe(0);
	expect(await at(0), "and lifted again on the way back up").toBeCloseTo(rest, 0);
});

test("the chrome fades on as the card docks, or is on throughout", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	await videosMounted(page);

	const at = async (y: number) => {
		await scrollAndSettle(page, y);
		return readChrome(page);
	};

	if (!(await hasTimelines(page))) {
		for (const y of [0, 3000]) expect(await at(y), `off at scroll ${y}`).toBe(1);
		return;
	}

	expect(await at(0), "bare at rest").toBe(0);
	expect(await at(3000), "on once docked").toBe(1);
	expect(await at(0), "and off again on the way back up").toBe(0);
});

/**
 * THE STATIC PRESENTATION, ON DEMAND. @supports can't be stubbed, so this
 * deletes the rules it gates, leaving the stylesheet such an engine applies,
 * and has CSS.supports answer as that engine would.
 */
async function loadWithoutTimelines(page: Page) {
	await page.addInitScript(() => {
		const supports = CSS.supports.bind(CSS) as (...args: string[]) => boolean;
		CSS.supports = ((...args: string[]) =>
			args.join(" ").includes("animation-timeline") ? false : supports(...args)) as typeof CSS.supports;
	});
	await page.goto("/");
	await lockupReady(page);
	await page.evaluate(() => {
		const strip = (parent: CSSStyleSheet | CSSGroupingRule) => {
			for (let i = parent.cssRules.length - 1; i >= 0; i--) {
				const rule = parent.cssRules[i];
				if (rule instanceof CSSSupportsRule && /^\(animation-timeline/.test(rule.conditionText)) parent.deleteRule(i);
				else if (rule instanceof CSSGroupingRule) strip(rule);
			}
		};
		for (const sheet of Array.from(document.styleSheets)) strip(sheet);
	});
}

test("without scroll timelines the page is static and complete", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await loadWithoutTimelines(page);
	await videosMounted(page);

	for (const y of [0, 400, 3000]) {
		await scrollAndSettle(page, y);
		expect(await readClip(page), `the word is clipped at scroll ${y}`).toBe(0);
		expect(await readLift(page), `the card is lifted at scroll ${y}`).toBe(0);
		expect(await readChrome(page), `the chrome is off at scroll ${y}`).toBe(1);
	}
	await scrollAndSettle(page, 0);
	const sub = await page.evaluate(() => getComputedStyle(document.querySelector(".sh__sub")!).opacity);
	expect(Number(sub)).toBe(1);
});

test("without scroll timelines the compact ruler is on and takes input", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await loadWithoutTimelines(page);
	await page.locator(".wx-videos__compact[data-ready]").waitFor({ state: "attached", timeout: 15_000 });

	await expect(page.locator(".wx-videos")).toHaveAttribute("data-vc-docked", "");
	const ruler = page.locator(".wx-videos__compact .vc__ruler");
	await expect(ruler).toHaveCSS("opacity", "1");
	await expect(ruler).toHaveCSS("pointer-events", "auto");
	expect(await ruler.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
});
