import { CLS, DOM, ENGINE, ENGINE_WINDOW_MS, JS_BEFORE_SCROLL, MEDIA_REQUESTS, WEBGL } from "./budgets";
import { DESKTOP, MOBILE, engine, expect, load, mountAll, observed, pageAge, test } from "./fixtures";
import { MEDIA_BASE } from "../fixtures/test";

/**
 * WHAT A LOAD COSTS: the structure of the homepage once it has settled, before
 * anyone scrolls, then once every card has mounted. Budgets: ./budgets.ts.
 */

for (const [device, use] of [
	["desktop", DESKTOP],
	["mobile", MOBILE],
] as const) {
	test.describe(device, () => {
		test.use(use);

		test("a load: contexts, media, scripts and engine work", async ({ page, cdp }) => {
			const live = { media: [] as string[], scripts: [] as string[] };
			page.on("request", (r) => {
				const url = r.url();
				if (url.startsWith(MEDIA_BASE)) live.media.push(url);
				else if (r.resourceType() === "script") live.scripts.push(new URL(url).pathname);
			});
			// Everything here is counted over a FIXED window, navigation to 6s, on
			// the page's own clock, however long the page then takes to settle (a
			// slow runner's can take longer): the copy's wobble restyles at 30fps
			// while it is in view (on a phone, from the first frame), and the
			// carousel moves to its next clip, fetching the one after, when the
			// first ends (the media stub runs 10s), so a window that ends "when
			// settled" would count a different amount of both each run.
			const before = await engine(cdp);
			let after!: Awaited<ReturnType<typeof engine>>;
			let media!: string[];
			let scripts!: string[];
			await load(page, async () => {
				await pageAge(page, ENGINE_WINDOW_MS);
				after = await engine(cdp);
				media = [...live.media];
				scripts = [...live.scripts];
			});

			const webgl = await page.evaluate(() => (window as unknown as { __whoisPerf: { webgl: number } }).__whoisPerf.webgl);
			observed("WebGL contexts", webgl, WEBGL[device]);
			expect(webgl, "WebGL contexts at load").toBeLessThanOrEqual(WEBGL[device]);

			observed("media requests", media.map((u) => u.slice(MEDIA_BASE.length)), MEDIA_REQUESTS[device]);
			expect(media.length, `media requests at load: ${media.join(", ")}`).toBeLessThanOrEqual(MEDIA_REQUESTS[device]);

			const widgets = scripts
				.map((p) => p.match(/\/widget-([a-z0-9-]+)\.[^/]+\.js$/)?.[1])
				.filter((n): n is string => !!n)
				.sort();
			observed("scripts before the first scroll", { files: scripts.length, widgets, list: scripts.map((p) => p.split("/").pop()) }, JS_BEFORE_SCROLL[device]);
			expect(scripts.length, `scripts before the first scroll:\n${scripts.join("\n")}`).toBeLessThanOrEqual(
				JS_BEFORE_SCROLL[device].files,
			);
			for (const name of widgets) {
				expect(JS_BEFORE_SCROLL[device].widgets, `widget-${name} loaded before the first scroll`).toContain(name);
			}

			const work = { layouts: after.layouts - before.layouts, styles: after.styles - before.styles };
			observed("engine work, load", work, ENGINE.load[device]);
			expect(work.layouts, "layouts during the load").toBeLessThanOrEqual(ENGINE.load[device].layouts);
			expect(work.styles, "style recalcs during the load").toBeLessThanOrEqual(ENGINE.load[device].styles);
		});

		test("every card mounted: layout shift, DOM size and containment", async ({ page }) => {
			await load(page);
			await mountAll(page);

			const cls = await page.evaluate(() => (window as unknown as { __whoisPerf: { cls: number } }).__whoisPerf.cls);
			observed("CLS", cls, CLS);
			expect(cls, "layout shift over a load and a scroll through every card").toBeLessThanOrEqual(CLS);

			const dom = await page.evaluate(() => ({
				total: document.querySelectorAll("*").length,
				widget: Object.fromEntries(
					[...document.querySelectorAll<HTMLElement>("[data-widget]")].map((el) => [
						el.dataset.widget!,
						el.querySelectorAll("*").length,
					]),
				),
			}));
			observed("DOM elements", dom, DOM);
			expect(dom.total, "DOM elements on the page").toBeLessThanOrEqual(DOM.total);
			for (const [name, n] of Object.entries(dom.widget)) {
				expect(DOM.widget[name], `widget "${name}" has no DOM budget (tests/perf/budgets.ts)`).toBeDefined();
				expect(n, `DOM elements in widget "${name}"`).toBeLessThanOrEqual(DOM.widget[name]);
			}

			// Every named card is a contained, mounted widget card.
			const cards = await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>("[data-widget]")].map((el) => {
					const style = getComputedStyle(el);
					return {
						name: el.dataset.widget!,
						state: el.dataset.widgetState,
						load: el.dataset.widgetLoad,
						mode: el.classList.contains("ds-widget--contain-layout")
							? "layout"
							: el.classList.contains("ds-widget--contain-auto")
								? "auto"
								: null,
						contain: style.contain,
						intrinsic: style.containIntrinsicSize,
					};
				}),
			);
			expect(cards.length, "named widget cards on the page").toBeGreaterThan(0);
			for (const card of cards) {
				const c = `widget "${card.name}"`;
				expect(card.state, `${c} mounted`).toBe("mounted");
				expect(["near", "idle", "eager"], `${c} has a load mode`).toContain(card.load);
				expect(card.mode, `${c} is a <Widget contain>`).not.toBeNull();
				expect(card.contain, `${c} is style-contained`).toMatch(/\bstyle\b/);
				if (card.mode === "layout") expect(card.contain, `${c} is layout-contained`).toMatch(/\blayout\b/);
				// What stands in for a skipped card's content: its own cell box.
				else expect(card.intrinsic, `${c} has an intrinsic size`).toMatch(/\d+px/);
			}

			// And the far ones are actually skippable: back at the top, a card more
			// than a screen away is content-visibility: auto.
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
			await page.waitForTimeout(500);
			const far = await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>(".ds-widget--contain-auto[data-widget]")]
					.filter((el) => el.getBoundingClientRect().top > 2.2 * innerHeight)
					.map((el) => ({ name: el.dataset.widget, cv: getComputedStyle(el).contentVisibility })),
			);
			for (const card of far) expect(card.cv, `far widget "${card.name}" is skippable`).toBe("auto");
		});
	});
}

test("every widget directory is a card on the homepage", async ({ page }) => {
	const { readdirSync, existsSync } = await import("node:fs");
	const { join } = await import("node:path");
	const root = join(import.meta.dirname, "..", "..", "src", "widgets");
	const dirs = readdirSync(root, { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(join(root, d.name, "client.ts")))
		.map((d) => d.name)
		.sort();
	await page.goto("/");
	const names = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("[data-widget]")].map((el) => el.dataset.widget!).sort(),
	);
	// So every budget below covers every widget: one that is not on the page
	// would escape them all.
	expect(names).toEqual(dirs);
});
