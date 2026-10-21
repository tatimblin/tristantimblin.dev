import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { assetBase, realDist, serveEmbed, src } from "./fixtures/embed-route";

/**
 * A DEMO: /demo/<slug>, a live experiment filling the viewport (the
 * full-screen <Embed>), with one small panel over it. Every test routes the
 * bundle's bucket to the stub (tests/fixtures/embed-route.ts).
 *
 * What is asserted:
 *  1. The scene IS the page: it fills the viewport and nothing scrolls.
 *  2. It mounts at once (no scrolling near), with a labelled canvas and
 *     touch-action none, over the poster.
 *  3. The panel: the info toggle opens the notes, Esc closes them; the back
 *     link goes to /txt.
 *  4. Under reduced motion, the still frame (or the poster) and a note.
 *  5. Listing: on /txt among the posts, with its DEMO chip and its own
 *     number; in the feed and the sitemap; a draft in none of them.
 */

const DEMO = "/demo/sutro/";
const frame = (page: Page) => page.locator("[data-demo] [data-embed]");

test.describe("/demo/sutro/", () => {
	test("fills the viewport, scrolls nowhere, and mounts at once", async ({ page }) => {
		if (realDist) test.slow();
		const requests = await serveEmbed(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(DEMO);
		await expect(frame(page)).toHaveAttribute("data-state", "live", { timeout: 15_000 });
		expect(requests[0]).toBe(src);

		const box = (await frame(page).boundingBox())!;
		expect(box).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
		const scroll = await page.evaluate(() => ({
			h: document.documentElement.scrollHeight,
			w: document.documentElement.scrollWidth,
		}));
		expect(scroll).toEqual({ h: 900, w: 1440 });
		await page.mouse.wheel(0, 600);
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
		// No site footer under it.
		await expect(page.locator(".site-footer")).toHaveCount(0);

		// The canvas: the size of the viewport, an image with a name and a
		// description, touch-action none (a finger drags the grass).
		const canvas = frame(page).locator("[data-embed-stage] canvas");
		await expect(canvas).toHaveCount(1);
		const c = (await canvas.boundingBox())!;
		expect(c.width).toBe(1440);
		expect(c.height).toBe(900);
		await expect(canvas).toHaveAttribute("role", "img");
		await expect(page.getByRole("img", { name: "Sutro, a live scene" })).toHaveCount(1);
		await expect(canvas).toHaveAccessibleDescription(/Sutro Tower/);
		if (!realDist) {
			expect(await page.evaluate(() => (window as any).__embedStub)).toMatchObject({ mounts: 1, assetBase });
		}
		// The poster stays underneath, out of the accessibility tree while live.
		await expect(frame(page).locator("img")).toHaveAttribute("aria-hidden", "true");
	});

	test("passes touch-action none to mount()", async ({ page }) => {
		await page.route(src, (route) =>
			route.fulfill({
				contentType: "text/javascript",
				headers: { "access-control-allow-origin": "*" },
				body: "export function mount(el, opts) { window.__opts = opts; return { destroy() {} }; }",
			}),
		);
		await page.goto(DEMO);
		await expect(frame(page)).toHaveAttribute("data-state", "live");
		expect(await page.evaluate(() => (window as any).__opts)).toEqual({ assetBase, touchAction: "none" });
	});

	test("fills a phone too, with the panel folded to its header and title", async ({ page }) => {
		await serveEmbed(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(DEMO);
		await expect(frame(page)).toHaveAttribute("data-state", "live");
		expect((await frame(page).boundingBox())!).toEqual({ x: 0, y: 0, width: 390, height: 844 });
		const panel = page.locator("[data-demo-panel]");
		await expect(panel.getByRole("heading", { level: 1, name: "Sutro" })).toBeVisible();
		await expect(panel.locator("#demo-description")).toBeHidden();
		await panel.getByRole("button", { name: "About this demo" }).click();
		await expect(panel.locator("#demo-description")).toBeVisible();
		const p = (await panel.boundingBox())!;
		expect(p.x + p.width).toBeLessThanOrEqual(390);
	});

	test("the info toggle opens the notes; Esc closes them", async ({ page }) => {
		await serveEmbed(page);
		await page.goto(DEMO);
		const toggle = page.getByRole("button", { name: "About this demo" });
		const info = page.locator("#demo-info");
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await expect(info).toBeHidden();

		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(info).toBeVisible();
		await expect(info).toContainText("Notes");
		await expect(info).toContainText("Credits");

		await page.keyboard.press("Escape");
		await expect(info).toBeHidden();
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await expect(toggle).toBeFocused();

		// The button closes it too.
		await toggle.click();
		await toggle.click();
		await expect(info).toBeHidden();
	});

	test("the back link goes to /txt, which lists the demo", async ({ page }) => {
		await serveEmbed(page);
		await page.goto(DEMO);
		await page.getByRole("link", { name: "Writing" }).click();
		await expect(page).toHaveURL(/\/txt\/$/);
		await expect(page.locator(`a.stack__title[href="${DEMO}"]`)).toHaveCount(1);
	});

	test("the panel's theme chip flips the theme", async ({ page }) => {
		await serveEmbed(page);
		await page.goto(DEMO);
		const chip = page.locator("[data-demo-panel] [data-theme-toggle]");
		await expect(chip).toHaveAttribute("aria-pressed", "true");
		await chip.click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(chip).toHaveText("Light");
	});

	test.describe("under reduced motion", () => {
		test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: "reduce" }));

		test("shows the still frame, and says so", async ({ page }) => {
			await serveEmbed(page);
			await page.goto(DEMO);
			await expect(frame(page)).toHaveAttribute("data-state", "live");
			await expect(page.locator("[data-demo-motion]")).toBeVisible();
			await expect(page.locator("[data-demo-motion]")).toHaveText(/still frame/);
		});

		test("keeps the poster for a scene without a still frame", async ({ page }) => {
			// The registry's flag is false for such a scene; flip it on the frame
			// before the script runs.
			const requests = await serveEmbed(page);
			await page.addInitScript(() => {
				document.addEventListener("readystatechange", () => {
					const el = document.querySelector<HTMLElement>("[data-embed]");
					if (el) delete el.dataset.stillFrame;
				});
			});
			await page.goto(DEMO);
			await page.waitForTimeout(500);
			await expect(frame(page)).toHaveAttribute("data-state", "poster");
			expect(requests).toEqual([]);
			const poster = frame(page).locator("img");
			await expect(poster).toBeVisible();
			await expect(poster).toHaveAttribute("alt", /Sutro Tower/);
			await expect(page.locator("[data-demo-motion]")).toBeVisible();
		});
	});

	test("keeps the poster when the import fails", async ({ page }) => {
		await page.route(`${assetBase}**`, (route) => route.abort());
		await page.goto(DEMO);
		await expect(frame(page)).toHaveAttribute("data-state", "failed");
		await expect(frame(page).locator("img")).toBeVisible();
	});
});

test.describe("demos in the index, the feed and the sitemap", () => {
	test("Sutro is on /txt with its DEMO chip and its own number, never a txt number", async ({ page }) => {
		await page.goto("/txt/");
		const row = page.locator(".stack__post").filter({ has: page.locator(`a[href="${DEMO}"]`) });
		await expect(row).toHaveCount(1);
		await expect(row).toHaveAttribute("data-demo", "");
		await expect(row.locator(".stack__title .ds-chip")).toHaveText(/demo/i);
		await expect(row.locator(".stack__meta")).toHaveCount(0);
		await expect(row.locator("a.stack__read")).toHaveText(/view/i);
		// Interleaved by date: the rows run newest first across both kinds.
		const dates = await page
			.locator(".stack__post time.stack__date")
			.evaluateAll((ts) => ts.map((t) => t.getAttribute("datetime")!));
		expect([...dates].sort().reverse()).toEqual(dates);
	});

	test("the posts keep their numbers", async ({ page }) => {
		// The newest post's number is the count of posts: a demo would push it up.
		await page.goto("/txt/");
		const posts = await page.locator('.stack__post:not([data-demo]) a.stack__title').count();
		await page.goto("/txt/asserting-on-agent-behavior/");
		await expect(page.locator(".post__no")).toHaveText(`txt / ${String(posts).padStart(3, "0")}`);
	});

	test("Sutro is in the feed and the sitemap", async ({ request }) => {
		const rss = await (await request.get("/rss.xml")).text();
		expect(rss).toContain("https://tristantimblin.dev/demo/sutro/");
		expect(rss).toMatch(/<item><title>Sutro<\/title>.*<category>demo<\/category>/);
		const sitemap = await (await request.get("/sitemap-0.xml")).text();
		expect(sitemap).toContain("https://tristantimblin.dev/demo/sutro/");
	});

	test("a draft demo is in none of them, and not built", async ({ page, request }) => {
		// Every demo marked `draft: true` in src/content/demos (the unit test in
		// src/lib/blog.test.ts covers the filter itself).
		const dir = join(import.meta.dirname, "../src/content/demos");
		const drafts: string[] = [];
		for (const file of await readdir(dir)) {
			if (!/\.mdx?$/.test(file)) continue;
			const text = await readFile(join(dir, file), "utf8");
			if (/^draft:\s*true\s*$/m.test(text)) drafts.push(file.replace(/\.mdx?$/, ""));
		}
		await page.goto("/txt/");
		const rss = await (await request.get("/rss.xml")).text();
		const sitemap = await (await request.get("/sitemap-0.xml")).text();
		for (const slug of drafts) {
			await expect(page.locator(`a[href="/demo/${slug}/"]`)).toHaveCount(0);
			expect(rss).not.toContain(`/demo/${slug}/`);
			expect(sitemap).not.toContain(`/demo/${slug}/`);
			expect((await request.get(`/demo/${slug}/`)).status()).toBe(404);
		}
	});
});
