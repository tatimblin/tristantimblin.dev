import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect, type BrowserContext, type Page, type Request } from "./fixtures/test";
import {
	GOATCOUNTER_ENDPOINT,
	GOATCOUNTER_SRC,
} from "../src/lib/analytics/count";

/**
 * PAGE-VIEW COUNTING (src/lib/analytics/count.ts).
 *
 * Off the production host nothing GoatCounter is ever requested — not the
 * script, not a count — and under automation neither, so the suite (here, on
 * localhost, with navigator.webdriver true) never adds to the site's counts.
 * Every page carries the path it is counted under as a build-time meta.
 *
 * The last block simulates production: https://tristantimblin.dev is routed to
 * the local build, count.js is served from a committed copy of the pinned
 * version (so its integrity hash really is checked), and sendBeacon is
 * replaced with a recorder, so nothing reaches GoatCounter there either.
 */

const GOATCOUNTER = /goatcounter\.com|gc\.zgo\.at/;

function recordGoatCounter(context: BrowserContext): Request[] {
	const requests: Request[] = [];
	context.on("request", (request) => {
		if (GOATCOUNTER.test(request.url())) requests.push(request);
	});
	return requests;
}

const hitPath = (page: Page) =>
	page.locator('meta[name="hit-path"]').getAttribute("content");

/** Click a same-site link and confirm the client router handled it (the window survived). */
async function softNavigate(page: Page, selector: string, url: RegExp) {
	await page.evaluate(() => ((window as unknown as { __soft: boolean }).__soft = true));
	await page.locator(selector).first().click();
	await expect(page).toHaveURL(url);
	await page.waitForFunction(() => document.readyState === "complete");
	expect(
		await page.evaluate(() => (window as unknown as { __soft?: boolean }).__soft ?? false),
		"a soft navigation, not a full load",
	).toBe(true);
}

test.describe("off the production host", () => {
	test("hard load, soft navigation and a 404: hit-path set, nothing requested", async ({
		page,
		context,
	}) => {
		const requests = recordGoatCounter(context);

		await page.goto("/privacy/");
		expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
		expect(await hitPath(page)).toBe("/privacy/");

		await softNavigate(page, '.site-header a[href="/txt/"]', /\/txt\/$/);
		expect(await hitPath(page)).toBe("/txt/");

		await page.goto("/txt/mega-desk/?utm_source=test#intro");
		expect(await hitPath(page)).toBe("/txt/mega-desk/");

		const res = await page.goto("/no-such-page-here/?x=1");
		expect(res?.status()).toBe(404);
		expect(await hitPath(page)).toBe("/404/");

		await page.goto("/");
		expect(await hitPath(page)).toBe("/");

		await page.waitForTimeout(500);
		expect(requests.map((r) => r.url())).toEqual([]);
		expect(await page.evaluate(() => "goatcounter" in window)).toBe(false);
		await expect(page.locator("script[data-goatcounter]")).toHaveCount(0);
	});

	test("on localhost, even without webdriver, nothing is requested", async ({ page, context }) => {
		await context.addInitScript(() =>
			Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }),
		);
		const requests = recordGoatCounter(context);
		await page.goto("/");
		expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
		await softNavigate(page, 'a[href="/txt/"]', /\/txt\/$/);
		await page.waitForTimeout(500);
		expect(requests.map((r) => r.url())).toEqual([]);
		expect(await page.evaluate(() => "goatcounter" in window)).toBe(false);
	});
});

test.describe("on the production host (simulated)", () => {
	const PROD = "https://tristantimblin.dev";

	/** Route production to the local build and GoatCounter to fixtures; return the beacons sent. */
	async function simulate(context: BrowserContext, baseURL: string, { webdriver = false } = {}) {
		const script = await readFile(join(import.meta.dirname, "fixtures/goatcounter-count.v5.js"));
		const leaked: string[] = [];

		await context.route(`${PROD}/**`, async (route) => {
			const url = new URL(route.request().url());
			try {
				const response = await route.fetch({
					url: `${baseURL.replace(/\/$/, "")}${url.pathname}${url.search}`,
				});
				await route.fulfill({ response });
			} catch {
				// A late asset (the carousel's tick sound) still in flight as the
				// test ends; nothing to answer.
				await route.abort().catch(() => {});
			}
		});
		await context.route(GOATCOUNTER, (route) => {
			if (route.request().url() === GOATCOUNTER_SRC) {
				return route.fulfill({
					body: script,
					contentType: "text/javascript",
					headers: { "access-control-allow-origin": "*" },
				});
			}
			// Anything else (a count that slipped past the beacon recorder) is
			// answered here, never sent, and fails the test below.
			leaked.push(route.request().url());
			return route.fulfill({ status: 204 });
		});
		await context.addInitScript((automated) => {
			if (!automated) {
				Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
			}
			const sent: string[] = [];
			(window as unknown as { __beacons: string[] }).__beacons = sent;
			navigator.sendBeacon = (url: string | URL) => {
				sent.push(String(url));
				return true;
			};
		}, webdriver);
		return leaked;
	}

	const beacons = (page: Page) =>
		page.evaluate(() =>
			(window as unknown as { __beacons: string[] }).__beacons.map((u) => {
				const url = new URL(u);
				return {
					endpoint: `${url.origin}${url.pathname}`,
					p: url.searchParams.get("p"),
					r: url.searchParams.get("r"),
				};
			}),
		);

	test("counts the hard load and each soft navigation, by hit-path", async ({ page, context, baseURL }) => {
		const leaked = await simulate(context, baseURL!);
		const scripts: string[] = [];
		context.on("request", (r) => {
			if (r.url().includes("gc.zgo.at")) scripts.push(r.url());
		});

		await page.goto(`${PROD}/privacy/?utm_source=x`);
		await expect.poll(() => beacons(page)).toEqual([
			{ endpoint: GOATCOUNTER_ENDPOINT, p: "/privacy/", r: null },
		]);
		await expect(page.locator("script[data-goatcounter]")).toHaveAttribute(
			"data-goatcounter-settings",
			'{"no_onload":true}',
		);

		await softNavigate(page, '.site-header a[href="/txt/"]', /\/txt\/$/);
		await expect.poll(() => beacons(page)).toHaveLength(2);
		// After a soft navigation the referrer is left out, not re-credited.
		expect((await beacons(page))[1]).toEqual({ endpoint: GOATCOUNTER_ENDPOINT, p: "/txt/", r: null });

		await softNavigate(page, '.site-header a[href="/"]', /tristantimblin\.dev\/$/);
		await expect.poll(async () => (await beacons(page)).map((b) => b.p)).toEqual(["/privacy/", "/txt/", "/"]);

		expect(scripts, "count.js loaded once").toEqual([GOATCOUNTER_SRC]);
		expect(leaked).toEqual([]);
	});

	test("a 404 counts as /404/", async ({ page, context, baseURL }) => {
		const leaked = await simulate(context, baseURL!);
		await page.goto(`${PROD}/wp-login.php`);
		await expect.poll(async () => (await beacons(page)).map((b) => b.p)).toEqual(["/404/"]);
		expect(leaked).toEqual([]);
	});

	test("#toggle-goatcounter opts this browser out", async ({ page, context, baseURL }) => {
		const leaked = await simulate(context, baseURL!);
		page.on("dialog", (dialog) => dialog.accept());
		await page.goto(`${PROD}/#toggle-goatcounter`);
		await expect.poll(() => page.evaluate(() => localStorage.getItem("skipgc"))).toBe("t");
		await page.goto(`${PROD}/txt/`);
		await page.waitForFunction(() => typeof window.goatcounter?.count === "function");
		await page.waitForTimeout(300);
		expect(await beacons(page)).toEqual([]);
		expect(leaked).toEqual([]);
	});

	test("under automation, even on the production host, nothing loads", async ({ page, context, baseURL }) => {
		const requests = recordGoatCounter(context);
		await simulate(context, baseURL!, { webdriver: true });
		await page.goto(`${PROD}/`);
		await page.waitForTimeout(500);
		expect(requests.map((r) => r.url())).toEqual([]);
		expect(await beacons(page)).toEqual([]);
	});
});
