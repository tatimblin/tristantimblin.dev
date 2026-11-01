/**
 * The perf project's `test` and its helpers.
 *
 * The suite's fixture (tests/fixtures/test.ts) already answers the media
 * bucket, TMDB, GitHub Pages and the Cursive agent locally; this adds the one
 * live service it leaves open, the Spotify stream, and installs the probe
 * (./probe.ts) in every page, so a budget measures the page and never the
 * network:
 *   - the Spotify SSE proxy answers one "now playing" message (playing, so the
 *     card's clock is live) and asks the player not to reconnect for a day
 *     (`retry:`), so a reconnect never lands inside a measurement;
 *   - its cover art (i.scdn.co) is poster-stub.jpg, with CORS (the player
 *     samples the cover's colour).
 */
import { join } from "node:path";
import { devices } from "@playwright/test";
import { test as base, expect, type Page, type CDPSession } from "../fixtures/test";
import { probe } from "./probe";

/** src/widgets/now-playing/config.ts's SPOTIFY_SSE_URL. */
export const SPOTIFY_SSE = "https://spotify-stream-player-j2yxapx3oa-uk.a.run.app/**";
export const COVER_PATTERN = "https://i.scdn.co/**";
const COVER = join(import.meta.dirname, "..", "fixtures", "poster-stub.jpg");

/** The two pages every budget is held on. */
export const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const { defaultBrowserType: _engine, ...pixel } = devices["Pixel 7"];
/** A touch phone (no fine pointer, so no Lenis). */
export const MOBILE = pixel;

/** A track two minutes into four, playing. */
export function nowPlaying() {
	return {
		track: "Perf Budget",
		url: "https://open.spotify.com/track/perf",
		album: "Counts, Not Milliseconds",
		albumUrl: "https://open.spotify.com/album/perf",
		artists: "The Stubs",
		artistUrl: "https://open.spotify.com/artist/perf",
		cover: "https://i.scdn.co/image/perf-640",
		covers: [{ url: "https://i.scdn.co/image/perf-640", width: 640, height: 640 }],
		progress: 120_000,
		duration: 240_000,
		playing: true,
		time: new Date().toISOString(),
	};
}

async function stubSpotify(page: Page): Promise<void> {
	await page.route(SPOTIFY_SSE, (route) =>
		route.fulfill({
			status: 200,
			headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
			body: `retry: 86400000\ndata: ${JSON.stringify(nowPlaying())}\n\n`,
		}),
	);
	await page.route(COVER_PATTERN, (route) =>
		route.fulfill({ path: COVER, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" } }),
	);
}

export const test = base.extend<{ perf: void; cdp: CDPSession }>({
	perf: [
		async ({ page }, use) => {
			// PERF_CPU=4: a CPU four times slower, roughly CI's runner, to check a
			// budget change holds there before pushing it.
			const slow = Number(process.env.PERF_CPU ?? 1);
			if (slow > 1) {
				const cdp = await page.context().newCDPSession(page);
				await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow });
			}
			await stubSpotify(page);
			await page.addInitScript(probe);
			await use();
		},
		{ auto: true },
	],
	cdp: async ({ page }, use) => {
		const session = await page.context().newCDPSession(page);
		await session.send("Performance.enable");
		await use(session);
	},
});

export { expect };
export type { Page, CDPSession };

/* ── reading the probe ── */

export interface Counts {
	/** rAF callbacks run, all scripts. */
	raf: number;
	rafBy: Record<string, number>;
	/** requestVideoFrameCallback callbacks run (the halftones' video loop). */
	rvfc: number;
	/** frame.ts: callbacks run, frames run, per label, registered now, running. */
	calls: number;
	frames: number;
	byLabel: Record<string, number>;
	callbacks: number;
	running: boolean;
}

export async function counts(page: Page): Promise<Counts> {
	return page.evaluate(() => {
		const P = (window as unknown as { __whoisPerf: any }).__whoisPerf;
		const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
		const f = P.frameStats?.() ?? { calls: 0, frames: 0, byLabel: {}, callbacks: 0, running: false };
		return {
			raf: sum(P.raf),
			rafBy: { ...P.raf },
			rvfc: sum(P.rvfc),
			calls: f.calls,
			frames: f.frames,
			byLabel: f.byLabel,
			callbacks: f.callbacks,
			running: f.running,
		};
	});
}

/** What ran in `ms` of doing nothing. */
export async function during(page: Page, ms: number, act?: () => Promise<void>) {
	const a = await counts(page);
	if (act) await act();
	else await page.waitForTimeout(ms);
	const b = await counts(page);
	const labels: Record<string, number> = {};
	for (const [k, v] of Object.entries(b.byLabel)) if (v - (a.byLabel[k] ?? 0)) labels[k] = v - (a.byLabel[k] ?? 0);
	const rafBy: Record<string, number> = {};
	for (const [k, v] of Object.entries(b.rafBy)) if (v - (a.rafBy[k] ?? 0)) rafBy[k] = v - (a.rafBy[k] ?? 0);
	return { raf: b.raf - a.raf, rafBy, rvfc: b.rvfc - a.rvfc, calls: b.calls - a.calls, byLabel: labels, end: b };
}

/** CDP's LayoutCount and RecalcStyleCount, now. */
export async function engine(cdp: CDPSession) {
	const { metrics } = await cdp.send("Performance.getMetrics");
	const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
	return { layouts: get("LayoutCount"), styles: get("RecalcStyleCount") };
}

/* ── driving the page ── */

/** The page's one continuous decoration: the copy's wobble, which churns at
 *  30fps for as long as the copy is in view (theme/wobble-text). Settling
 *  waits for everything else. */
export const CONTINUOUS = ["wobble-text"];

/** Wait until nothing has asked for a frame for `quietMs` (but the copy's
 *  wobble, while it is in view): the hero's intro over, the mounts done. */
export async function settle(page: Page, quietMs = 1000, timeout = 20_000) {
	// rAF callbacks other than the scheduler's own frames, and scheduler
	// callbacks other than the continuous ones.
	const busy = (c: Counts) => ({
		raf: c.raf - c.frames,
		calls: c.calls - CONTINUOUS.reduce((a, l) => a + (c.byLabel[l] ?? 0), 0),
	});
	const t0 = Date.now();
	let last = busy(await counts(page));
	let quietSince = Date.now();
	while (Date.now() - t0 < timeout) {
		await page.waitForTimeout(250);
		const now = busy(await counts(page));
		if (now.raf !== last.raf || now.calls !== last.calls) quietSince = Date.now();
		last = now;
		if (Date.now() - quietSince >= quietMs) return;
	}
	throw new Error(`the page never went quiet (${JSON.stringify((await counts(page)).rafBy)})`);
}

/** Past everything a load schedules for itself: the halftones' 3.2s intro and
 *  the reveal's 3s fail-visible backstop (Layout.astro), which restyles the
 *  page once more when it lifts. */
const LOAD_SETTLES_MS = 3600;

/** Load the homepage and let it settle. `alongside` runs from the moment the
 *  page has navigated, concurrently with the settling. */
export async function load(page: Page, alongside?: () => Promise<void>) {
	await page.goto("/");
	const side = alongside?.();
	side?.catch(() => {}); // rethrown below, by the await
	await page.waitForLoadState("load");
	await page.locator("stories-heading[data-ready]").waitFor({ state: "attached" });
	await page.evaluate(() => document.fonts.ready);
	const now = await page.evaluate(() => performance.now());
	if (now < LOAD_SETTLES_MS) await page.waitForTimeout(LOAD_SETTLES_MS - now);
	await settle(page);
	await side;
}

/** Resolves once the page is `ms` old (polled on a timer: a rAF poll would
 *  itself be a frame the probe counts). */
export async function pageAge(page: Page, ms: number) {
	await page.waitForFunction((t) => performance.now() >= t, ms, { polling: 25 });
}

/** Scroll (instantly) to `y`, then let the scroll's work finish. */
export async function scrollTo(page: Page, y: number) {
	await page.evaluate((top) => {
		const lenis = (window as unknown as { __lenis?: { scrollTo(y: number, o: object): void } }).__lenis;
		if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
		else window.scrollTo({ top, behavior: "instant" });
	}, y);
	await page.waitForTimeout(300);
}

/** Bring every widget card past the viewport, so all have mounted. */
export async function mountAll(page: Page) {
	const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
	for (let y = 0; y <= height + 1; y += 400) await scrollTo(page, Math.min(y, height));
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll<HTMLElement>("[data-widget]")].every((el) =>
				["mounted", "failed"].includes(el.dataset.widgetState ?? ""),
			),
		undefined,
		{ timeout: 10_000 },
	);
}

/** Fake a background tab: document.visibilityState "hidden", and the event. */
export async function setHidden(page: Page, hidden: boolean) {
	await page.evaluate((h) => {
		if (h) {
			Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
			Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
		} else {
			delete (document as { visibilityState?: unknown }).visibilityState;
			delete (document as { hidden?: unknown }).hidden;
		}
		document.dispatchEvent(new Event("visibilitychange"));
	}, hidden);
}

/** DOM mutations under each widget (and any open shadow root in it) while
 *  `act` runs: attribute, text and child-list changes. */
export async function widgetMutations(page: Page, act: () => Promise<void>) {
	await page.evaluate(() => {
		type Watch = { name: string; mo: MutationObserver };
		const w = window as unknown as { __mut: Record<string, number>; __mutObs: Watch[] };
		w.__mut = {};
		w.__mutObs = [];
		for (const el of document.querySelectorAll<HTMLElement>("[data-widget]")) {
			const name = el.dataset.widget!;
			w.__mut[name] = 0;
			const mo = new MutationObserver((list) => (w.__mut[name] += list.length));
			const opts = { subtree: true, attributes: true, childList: true, characterData: true };
			mo.observe(el, opts);
			for (const host of el.querySelectorAll("*")) if (host.shadowRoot) mo.observe(host.shadowRoot, opts);
			w.__mutObs.push({ name, mo });
		}
	});
	await act();
	return page.evaluate(() => {
		type Watch = { name: string; mo: MutationObserver };
		const w = window as unknown as { __mut: Record<string, number>; __mutObs: Watch[] };
		for (const { name, mo } of w.__mutObs) {
			w.__mut[name] += mo.takeRecords().length;
			mo.disconnect();
		}
		return w.__mut;
	});
}

/** Which widgets are within the activity margin (a quarter screen) of the
 *  viewport right now: the ones allowed to work. */
export async function activeWidgets(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("[data-widget]")]
			.filter((el) => {
				const r = el.getBoundingClientRect();
				const m = innerHeight * 0.25;
				return r.bottom >= -m && r.top <= innerHeight + m && r.width > 0;
			})
			.map((el) => el.dataset.widget!),
	);
}

/** Record a measured value next to its budget, in the report. */
export function observed(name: string, value: unknown, budget?: unknown) {
	test.info().annotations.push({
		type: "perf",
		description: `${name}: ${JSON.stringify(value)}${budget === undefined ? "" : ` (budget ${JSON.stringify(budget)})`}`,
	});
	if (process.env.PERF_LOG) console.log(`[perf] ${test.info().title} | ${name}: ${JSON.stringify(value)}${budget === undefined ? "" : ` / budget ${JSON.stringify(budget)}`}`);
}
