import { BLOCKING_LISTENERS, ENGINE, SCROLL_SCRIPT_MS } from "./budgets";
import { DESKTOP, MOBILE, engine, expect, load, mountAll, observed, scrollTo, test, type CDPSession, type Page } from "./fixtures";

/**
 * A SCROLL STAYS ON THE COMPOSITOR'S SIDE. Nothing may block it (a non-passive
 * wheel or touch listener makes the compositor wait for the main thread on
 * every event), and nothing the page runs while it scrolls may hold the main
 * thread for a whole frame's budget.
 *
 * THE LONG-TASK BUDGET, AND WHY IT IS STABLE ON CI. A long task is measured in
 * milliseconds, and CI renders with SwiftShader, where a frame's raster and
 * WebGL work are many times slower than on a GPU. So this budget is held on
 * the SCRIPT time inside each long animation frame (the Long Animation Frames
 * API's per-script durations), not on the frame's duration: rendering is what
 * SwiftShader slows most, and its cost is held by count instead (the
 * layout/style-recalc ceiling below). Script slows with a slower CPU too, but
 * no frame of this pass comes near 50ms of it even throttled 6x
 * (PERF_CPU=6), so a widget whose wheel or scroll handler, or frame callback,
 * takes 50ms trips it on any machine and nothing else does.
 */

async function wheelPass(page: Page, cdp: CDPSession, device: "desktop" | "mobile") {
	if (device === "desktop") {
		await page.mouse.move(720, 450);
		for (let i = 0; i < 30; i++) {
			await page.mouse.wheel(0, 100);
			await page.waitForTimeout(40);
		}
	} else {
		// Four upward swipes of raw touch events, ~1900px/s, each released into a
		// fling. Not Input.synthesizeScrollGesture with a touch source: on Linux
		// headless Chromium (CI) that scrolls nothing at all, even on a bare page,
		// while dispatched touches scroll there as they do on macOS. They also run
		// the page's touchstart/touchmove listeners, which a scroll pass should.
		for (let i = 0; i < 4; i++) {
			await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 700 }] });
			for (let s = 1; s <= 20; s++) {
				await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 700 - 30 * s }] });
				await page.waitForTimeout(16);
			}
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await page.waitForTimeout(150);
		}
	}
	// Let the last of it (Lenis's glide, a fling) finish.
	await page.waitForTimeout(800);
}

for (const [device, use] of [
	["desktop", DESKTOP],
	["mobile", MOBILE],
] as const) {
	test.describe(device, () => {
		test.use(use);

		test("a scroll pass: no long script, bounded engine work", async ({ page, cdp }) => {
			await load(page);
			const start = await page.evaluate(() => performance.now());
			const before = await engine(cdp);
			await wheelPass(page, cdp, device);
			const after = await engine(cdp);
			const y = await page.evaluate(() => scrollY);
			expect(y, "the pass scrolled the page").toBeGreaterThan(1000);

			const frames = await page.evaluate(
				(t0) =>
					(window as unknown as { __whoisPerf: { loafs: Array<{ t: number; d: number; scripts: Array<{ d: number; src: string; inv: string }> }> } }).__whoisPerf.loafs.filter(
						(l) => l.t >= t0,
					),
				start,
			);
			const script = frames.map((f) => ({
				ms: Math.round(f.scripts.reduce((a, s) => a + s.d, 0)),
				frame: Math.round(f.d),
				who: f.scripts.map((s) => `${s.src} ${s.inv} ${Math.round(s.d)}ms`),
			}));
			const worst = Math.max(0, ...script.map((s) => s.ms));
			observed("long animation frames during the pass", { count: frames.length, worstScriptMs: worst }, SCROLL_SCRIPT_MS);
			for (const s of script) {
				expect(s.ms, `a frame ran ${s.ms}ms of script during the scroll: ${s.who.join("; ")}`).toBeLessThan(SCROLL_SCRIPT_MS);
			}

			const work = { layouts: after.layouts - before.layouts, styles: after.styles - before.styles };
			observed("engine work, scroll pass", work, ENGINE.scroll[device]);
			expect(work.layouts, "layouts during the scroll pass").toBeLessThanOrEqual(ENGINE.scroll[device].layouts);
			expect(work.styles, "style recalcs during the scroll pass").toBeLessThanOrEqual(ENGINE.scroll[device].styles);
		});

		test("no scroll-blocking listeners but Lenis's own", async ({ page }) => {
			await load(page);
			await mountAll(page);
			await scrollTo(page, 0);
			const blocking = await page.evaluate(() => {
				type L = { target: string; type: string; passive: boolean; removed: boolean; fn: unknown; src: string };
				const P = (window as unknown as { __whoisPerf: { listeners: L[] } }).__whoisPerf;
				const vs = (window as unknown as { __lenis?: { virtualScroll?: Record<string, unknown> } }).__lenis?.virtualScroll;
				const lenis = new Set(vs ? [vs.onWheel, vs.onTouchStart, vs.onTouchMove] : []);
				return P.listeners
					// `src` "?" is no page script: Playwright's own injected hit-target
					// listeners.
					.filter((l) => !l.removed && !l.passive && l.src !== "?")
					.filter((l) => ["wheel", "mousewheel", "touchstart", "touchmove"].includes(l.type))
					.map((l) => ({ target: l.target, type: l.type, lenis: lenis.has(l.fn), src: l.src }));
			});
			observed("non-passive wheel/touch listeners", blocking);
			for (const l of blocking) {
				if (l.lenis) continue;
				const allowed = BLOCKING_LISTENERS.find((a) => a.type === l.type && a.target.test(l.target));
				expect(
					allowed,
					`a non-passive ${l.type} listener on ${l.target}, from ${l.src} (make it passive, or allowlist it in tests/perf/budgets.ts with why)`,
				).toBeDefined();
			}
		});
	});
}
