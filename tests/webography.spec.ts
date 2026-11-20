import { test, expect, type Page } from "./fixtures/test";
import data from "../src/data/sites.json" with { type: "json" };

/**
 * WEBOGRAPHY (/txt/webography/) — every site, one line each
 * (src/components/SiteIndex.astro, data in src/data/sites.json), the post
 * template's list variant: the frontmatter's `facts` fill the details card,
 * and the full-row list has no "Intro" head.
 *
 *  1. Every site is a row, newest year first; the year prints once per year.
 *  2. Each row links its domain (no www.), off-site in a new tab.
 *  3. The details card: started May 12, 2016, last added Mar 14, 2026, 51
 *     sites; no reading time. The list spans the article.
 *  4. The dot names the company: a bubble on hover and on keyboard focus,
 *     and the dot's accessible description either way. Both themes.
 *  5. A phone does not scroll sideways.
 */
const URL = "/txt/webography/";
const ROW = "[data-site-index] [data-site]";

const domainOf = (url: string) => new globalThis.URL(url).hostname.replace(/^www\./, "");

const bubbleShown = (page: Page, n: number) =>
	page
		.locator(`${ROW} [role="tooltip"]`)
		.nth(n)
		.evaluate((el) => getComputedStyle(el).visibility === "visible" && getComputedStyle(el).opacity === "1");

test.describe("/txt/webography/", () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("every site is a row, newest first, each linking its domain", async ({ page }) => {
		await page.goto(URL);
		await expect(page.getByRole("article").getByRole("heading", { level: 1 })).toHaveText("Webography");

		const rows = page.locator(ROW);
		await expect(rows).toHaveCount(data.sites.length);
		expect(data.sites.length).toBe(51);

		const years = await page.locator("[data-site-index] .site-index__when").allTextContents();
		expect(years[0]).toBe("2026");
		expect(years.at(-1)).toBe("2016");
		expect(years).toEqual([...new Set(years)]);

		const links = rows.locator("a");
		const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
		expect(hrefs).toEqual(data.sites.map((s) => s.url));
		const domains = await links.evaluateAll((as) => as.map((a) => a.firstChild!.textContent!.trim()));
		expect(domains).toEqual(data.sites.map((s) => domainOf(s.url)));
		expect(domains.some((d) => d.startsWith("www."))).toBe(false);
		await expect(links.first()).toHaveAttribute("target", "_blank");
		await expect(links.first()).toHaveAttribute("rel", "noreferrer");
	});

	test("the details card is the list's stats; no Intro head, and the list spans the row", async ({ page }) => {
		await page.goto(URL);
		const card = page.locator("[data-post-strip]");
		const labels = await card.locator(".ds-stat__label").allTextContents();
		expect(labels.map((l) => l.trim())).toEqual(["Started", "Last added", "Sites"]);
		await expect(card.locator('time[datetime="2016-05-12"]')).toHaveText("May 12, 2016");
		await expect(card.locator('time[datetime="2026-03-14"]')).toHaveText("Mar 14, 2026");
		// The count in the card is the list's length.
		await expect(card.locator(".ds-stat").nth(2)).toContainText(String(data.sites.length));
		await expect(card).not.toContainText(/words|min/);

		await expect(page.locator(".ds-prose-section__head")).toHaveCount(0);
		await expect(page.locator(".ds-prose-section__title", { hasText: "Intro" })).toHaveCount(0);
		const article = (await page.locator("article[data-post]").boundingBox())!;
		const list = (await page.locator("[data-site-index]").boundingBox())!;
		expect(Math.abs(list.x - article.x)).toBeLessThanOrEqual(1);
		expect(Math.abs(list.width - article.width)).toBeLessThanOrEqual(1);
	});

	for (const theme of ["light", "dark"] as const) {
		test(`${theme}: the dot names the company on hover and on focus`, async ({ page }) => {
			await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
			await page.goto(URL);
			await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

			const tip = page.locator(`${ROW} .site-index__tip .ds-tooltip__trigger`).first();
			await expect(tip).toHaveAccessibleDescription(data.sites[0].company);
			expect(await bubbleShown(page, 0)).toBe(false);

			await tip.hover();
			await expect.poll(() => bubbleShown(page, 0)).toBe(true);
			await expect(page.locator(`${ROW} [role="tooltip"]`).first()).toHaveText(data.sites[0].company);

			await page.mouse.move(0, 0);
			await expect.poll(() => bubbleShown(page, 0)).toBe(false);

			// Keyboard: the dot is a tab stop and shows the same bubble.
			const second = page.locator(`${ROW} .site-index__tip .ds-tooltip__trigger`).nth(1);
			await second.focus();
			await page.keyboard.press("Shift+Tab");
			await page.keyboard.press("Tab");
			await expect(second).toBeFocused();
			await expect.poll(() => bubbleShown(page, 1)).toBe(true);

			// The dot is a colour, not the text ink.
			const dot = await page
				.locator(`${ROW} .site-index__dot`)
				.first()
				.evaluate((el) => getComputedStyle(el, "::before").backgroundColor);
			expect(dot).not.toBe("rgba(0, 0, 0, 0)");
		});
	}

	test("desktop: the domain sits on its title's line, and no title is cut", async ({ page }) => {
		await page.goto(URL);
		const rows = await page.locator(ROW).evaluateAll((rows) =>
			rows.map((r) => {
				const t = r.querySelector<HTMLElement>(".site-index__title")!;
				const a = r.querySelector("a")!.getBoundingClientRect();
				return { cut: t.scrollWidth > t.clientWidth, sameLine: Math.abs(a.top - t.getBoundingClientRect().top) < 4 };
			}),
		);
		expect(rows.every((r) => r.sameLine)).toBe(true);
		expect(rows.filter((r) => r.cut).length).toBe(0);
	});

	test("a phone: the domain drops under the title, nothing cut, no sideways scroll", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto(URL);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(0);
		const rows = await page.locator(ROW).evaluateAll((rows) =>
			rows.map((r) => {
				const t = r.querySelector(".site-index__title")!.getBoundingClientRect();
				const a = r.querySelector("a")!;
				return { below: a.getBoundingClientRect().top >= t.bottom - 1, cut: a.scrollWidth > a.clientWidth };
			}),
		);
		expect(rows.every((r) => r.below)).toBe(true);
		expect(rows.some((r) => r.cut)).toBe(false);
	});
});
