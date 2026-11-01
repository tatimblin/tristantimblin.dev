import { DESKTOP, during, expect, load, mountAll, observed, scrollTo, settle, test, type Page } from "./fixtures";

/**
 * THE MOUNT LIFECYCLE. Every page load mounts each card exactly once, and a
 * view-transition navigation tears all of it down: away and back again, the
 * page holds the same observers, listeners and frame callbacks it held before,
 * however many round trips it makes. (A leak here is invisible on screen and
 * grows by a card's worth of work every navigation.)
 */

test.use(DESKTOP);

/** What the page is holding on to. */
async function held(page: Page) {
	return page.evaluate(() => {
		type L = { target: string; type: string; removed: boolean; once: boolean };
		const P = (window as unknown as {
			__whoisPerf: { listeners: L[]; observersLive: number; settled: Record<string, number>; frameStats: () => { callbacks: number } };
		}).__whoisPerf;
		const root = P.listeners.filter((l) => !l.removed && !l.once && (l.target === "window" || l.target === "document"));
		return {
			observers: P.observersLive,
			listeners: root.length,
			byType: root.reduce<Record<string, number>>((a, l) => ((a[`${l.target}:${l.type}`] = (a[`${l.target}:${l.type}`] ?? 0) + 1), a), {}),
			callbacks: P.frameStats().callbacks,
			settled: { ...P.settled },
			states: Object.fromEntries(
				[...document.querySelectorAll<HTMLElement>("[data-widget]")].map((el) => [el.dataset.widget!, el.dataset.widgetState]),
			),
		};
	});
}

async function roundTrip(page: Page) {
	// Dispatched, not hit-tested: the link is in the parallaxing hero
	// (tests/reveal.spec.ts test 6 says why).
	await page.evaluate(() =>
		[...document.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent?.trim() === "Writing")?.click(),
	);
	await page.waitForURL("**/txt/");
	await page.waitForFunction(() => !document.querySelector("[data-widget]"));
	await settle(page);
	await page.goBack();
	await page.waitForURL((u) => u.pathname === "/");
	await page.locator("[data-widget]").first().waitFor({ state: "attached" });
	await page.locator("stories-heading[data-ready]").waitFor({ state: "attached" });
	await settle(page);
}

async function steady(page: Page) {
	await mountAll(page);
	await scrollTo(page, 0);
	await settle(page);
	return held(page);
}

test("a view-transition round trip leaks nothing and mounts each card once", async ({ page }) => {
	await load(page);
	const loaded = await steady(page);
	const names = Object.keys(loaded.states);
	for (const name of names) expect(loaded.settled[`${name}:mounted`], `"${name}" mounted once`).toBe(1);

	// The baseline is taken after one round trip, not on the first load: the
	// other page's own scripts run once per document and keep their listeners
	// (the router's, the post list's), which is the page's working set, not a
	// leak. A leak is whatever grows with every trip after that.
	await roundTrip(page);
	const first = await steady(page);
	await roundTrip(page);
	const second = await steady(page);
	await roundTrip(page);
	const third = await steady(page);
	observed("held", { loaded, first, second, third });
	expect(first.observers, "live observers after a round trip").toBe(loaded.observers);
	expect(first.callbacks, "frame callbacks after a round trip").toBe(loaded.callbacks);

	for (const name of names) {
		expect(third.states[name], `"${name}" mounted after the round trips`).toBe("mounted");
		expect(third.settled[`${name}:mounted`], `"${name}" mounted once per page load`).toBe(4);
		expect(third.settled[`${name}:failed`] ?? 0, `"${name}" never failed`).toBe(0);
	}
	for (const [label, state] of [
		["after a second round trip", second],
		["after a third round trip", third],
	] as const) {
		expect(state.observers, `live observers ${label}`).toBe(first.observers);
		expect(state.byType, `window/document listeners ${label}`).toEqual(first.byType);
		expect(state.callbacks, `frame callbacks registered ${label}`).toBe(first.callbacks);
	}

	// And, back at the top, nothing is left running.
	const idle = await during(page, 1500);
	expect(idle.calls, `frame callbacks after the round trips: ${JSON.stringify(idle.byLabel)}`).toBe(0);
	expect(idle.raf, `rAF after the round trips: ${JSON.stringify(idle.rafBy)}`).toBe(0);
});
