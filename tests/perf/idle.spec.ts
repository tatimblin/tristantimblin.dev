import { DESKTOP, MOBILE, activeWidgets, during, expect, load, mountAll, observed, scrollTo, setHidden, test, widgetMutations } from "./fixtures";

/**
 * AN IDLE PAGE DOES NOTHING. With nobody scrolling, the page asks for no
 * frames except to play what is on screen; in a background tab, or under
 * reduced motion, not even that; and a card out of sight does no work at all.
 *
 * "Frames" are counted three ways (./probe.ts): the shared scheduler's
 * callbacks (frame.ts, which every widget, wobble-text and Lenis run on), every
 * requestAnimationFrame callback from any script (the halftone and carousel
 * packages included), and requestVideoFrameCallback (a halftone's video loop:
 * the one thing allowed to run while it is on screen and playing).
 */

const IDLE_MS = 2000;

test.describe("desktop", () => {
	test.use(DESKTOP);

	test("settled at the top: no frame callbacks, no rAF", async ({ page }) => {
		await load(page);
		const idle = await during(page, IDLE_MS);
		observed("idle at the top", idle);
		expect(idle.calls, `frame callbacks while idle: ${JSON.stringify(idle.byLabel)}`).toBe(0);
		expect(idle.raf, `rAF while idle: ${JSON.stringify(idle.rafBy)}`).toBe(0);
		expect(idle.end.running, "the scheduler is stopped").toBe(false);
	});

	test("Lenis: no frames while idle, wakes on the wheel, settles after it", async ({ page }) => {
		await load(page);
		expect(await page.evaluate(() => !!(window as unknown as { __lenis?: unknown }).__lenis), "Lenis is on").toBe(true);

		const idle = await during(page, IDLE_MS);
		expect(idle.byLabel.lenis ?? 0, "Lenis frames while idle").toBe(0);

		await page.mouse.move(720, 450);
		const wheel = await during(page, 0, async () => {
			for (let i = 0; i < 5; i++) {
				await page.mouse.wheel(0, 120);
				await page.waitForTimeout(40);
			}
		});
		observed("Lenis frames during 5 wheel ticks", wheel.byLabel.lenis ?? 0);
		expect(wheel.byLabel.lenis ?? 0, "Lenis ran on the wheel").toBeGreaterThan(0);
		expect(await page.evaluate(() => scrollY), "and scrolled the page").toBeGreaterThan(0);

		// Settled: Lenis has let go of the loop.
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { __lenis: { isScrolling: unknown } }).__lenis.isScrolling), {
				timeout: 3000,
			})
			.toBe(false);
		await page.waitForTimeout(200);
		const after = await during(page, 1000);
		observed("Lenis frames once settled", after.byLabel.lenis ?? 0);
		expect(after.byLabel.lenis ?? 0, "Lenis frames once settled").toBe(0);
	});
});

for (const [device, use] of [
	["desktop", DESKTOP],
	["mobile", MOBILE],
] as const) {
	test.describe(device, () => {
		test.use(use);

		test("a hidden tab: no frame callbacks, no rAF, no video frames", async ({ page }) => {
			await load(page);
			await mountAll(page);
			// Mid-page, where the most runs: the copy's wobble, a halftone, cards.
			const mid = await page.evaluate(() => document.querySelector(".home__copy")!.getBoundingClientRect().top + scrollY - 200);
			await scrollTo(page, mid);
			const visible = await during(page, 1000);
			observed("visible, mid-page", visible);

			await setHidden(page, true);
			await page.waitForTimeout(300);
			const work = await widgetMutations(page, async () => {
				const hidden = await during(page, IDLE_MS);
				observed("hidden", hidden);
				expect(hidden.calls, `frame callbacks while hidden: ${JSON.stringify(hidden.byLabel)}`).toBe(0);
				expect(hidden.raf, `rAF while hidden: ${JSON.stringify(hidden.rafBy)}`).toBe(0);
				expect(hidden.rvfc, "video frame callbacks while hidden").toBe(0);
			});
			observed("widget DOM mutations while hidden", work);
			for (const [name, n] of Object.entries(work)) expect(n, `widget "${name}" worked while hidden`).toBe(0);

			// And it all comes back.
			await setHidden(page, false);
			await page.waitForTimeout(300);
			const back = await during(page, 1000);
			expect(back.calls + back.raf + back.rvfc, "frames once visible again").toBeGreaterThan(0);
		});

		test("an inactive widget does nothing", async ({ page }) => {
			await load(page);
			await mountAll(page);
			// Two places, so every card is out of sight in one of them: the top
			// (every card below the fold but the docking videos card) and the end.
			for (const at of ["top", "end"] as const) {
				await scrollTo(page, at === "top" ? 0 : await page.evaluate(() => document.documentElement.scrollHeight));
				await page.waitForTimeout(700);
				const active = await activeWidgets(page);
				let frames!: Awaited<ReturnType<typeof during>>;
				const work = await widgetMutations(page, async () => {
					frames = await during(page, IDLE_MS);
				});
				observed(`at the ${at}: active ${JSON.stringify(active)}`, { mutations: work, frames: frames.byLabel });
				for (const name of Object.keys(work)) {
					if (active.includes(name)) continue;
					expect(work[name], `inactive widget "${name}" changed its DOM (at the ${at})`).toBe(0);
					expect(frames.byLabel[name] ?? 0, `inactive widget "${name}" ran frame callbacks (at the ${at})`).toBe(0);
				}
			}
		});

		test.describe("reduced motion", () => {
			test.use({ contextOptions: { reducedMotion: "reduce" } });

			test("settled anywhere: no frames at all", async ({ page }) => {
				await load(page);
				await mountAll(page);
				const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
				for (const f of [0, 0.5, 1]) {
					await scrollTo(page, f * height);
					await page.waitForTimeout(500);
					const idle = await during(page, IDLE_MS);
					observed(`reduced motion at ${f}`, idle);
					expect(idle.calls, `frame callbacks at ${f}: ${JSON.stringify(idle.byLabel)}`).toBe(0);
					expect(idle.raf, `rAF at ${f}: ${JSON.stringify(idle.rafBy)}`).toBe(0);
					expect(idle.rvfc, `video frames at ${f}`).toBe(0);
				}
			});
		});
	});
}
