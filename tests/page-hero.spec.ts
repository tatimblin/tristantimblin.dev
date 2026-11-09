import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";

/**
 * THE SECTION HERO (PageHero, on /txt and /about): the fabric halftone
 * under the page's title, persisted across the client router so moving between
 * the section pages keeps the picture running instead of rebuilding it — the
 * same element, the same canvas (so the same WebGL context), the intro not
 * replayed.
 */

/** The card row overlaps the frame's foot, clear of the title. */
async function expectOverlap(page: Page) {
	await page
		.locator(".page-hero__cards")
		.evaluate((row) => Promise.all(row.getAnimations({ subtree: true }).map((a) => a.finished)));
	const [grid, card, title] = await Promise.all(
		[".page-hero__grid", ".page-hero__cards .ds-card", ".page-hero h1"].map((s) =>
			page.locator(s).first().boundingBox(),
		),
	);
	expect(card!.y).toBeLessThan(grid!.y + grid!.height);
	expect(card!.y + card!.height).toBeGreaterThan(grid!.y + grid!.height);
	expect(title!.y + title!.height).toBeLessThanOrEqual(card!.y);
}

for (const [name, width] of [["desktop", 1440], ["phone", 390]] as const) {
	test(`/txt's top posts overlap the hero (${name})`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/txt/");
		const cards = page.locator(".page-hero__cards .ds-card");
		await expect(cards).toHaveCount(3);
		// A phone shows only the most read.
		await expect(cards.locator("visible=true")).toHaveCount(name === "phone" ? 1 : 3);
		await expect(cards.first()).toBeVisible();
		await expect(cards.first().locator("a")).toHaveAttribute("href", /^\/txt\/.+\/$/);
		await expectOverlap(page);
		// The row runs the content's full width (a phone's list bleeds past it).
		if (name === "desktop") {
			const last = (await cards.last().boundingBox())!;
			const list = (await page.locator("[data-stack]").boundingBox())!;
			expect(last.x + last.width).toBeCloseTo(list.x + list.width, 0);
			// READ rests on the row's foot, however long each blurb runs.
			const reads = await cards.locator(".top-post__read").evaluateAll((els) =>
				els.map((el) => Math.round(el.getBoundingClientRect().bottom)),
			);
			expect(new Set(reads).size).toBe(1);
		}
		// A heading, then at most three lines of blurb, spaced off both neighbours.
		await expect(cards.locator("h2.ds-heading")).toHaveCount(3);
		const blurbs = await cards.evaluateAll((els) =>
			els.filter((card) => card.checkVisibility()).map((card) => {
				const box = (s: string) => card.querySelector(s)!.getBoundingClientRect();
				const blurb = card.querySelector<HTMLElement>(".top-post__excerpt")!;
				return {
					lines: blurb.clientHeight / parseFloat(getComputedStyle(blurb).lineHeight),
					above: box(".top-post__excerpt").top - box(".top-post__title").bottom,
					below: box(".top-post__read").top - box(".top-post__excerpt").bottom,
				};
			}),
		);
		for (const { lines, above, below } of blurbs) {
			expect(lines).toBeLessThanOrEqual(3.01);
			expect(above).toBeGreaterThan(0);
			expect(below).toBeGreaterThan(0);
		}
	});

	test(`/about's photo overlaps the hero (${name})`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/about/");
		const cards = page.locator(".page-hero__cards .ds-card");
		await expect(cards).toHaveCount(1);
		await expect(cards.locator("img")).toHaveAttribute("alt", "Tristan Timblin");
		await expectOverlap(page);
	});
}

test("hovering a top post lights the card under its title, not over it", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/txt/");
	const card = page.locator(".page-hero__cards .ds-card").first();
	const fill = () => card.evaluate((el) => getComputedStyle(el).backgroundColor);
	const rest = await fill();
	const read = card.locator(".top-post__read");
	await expect(read).toHaveCSS("text-decoration-line", "underline");
	const blue = await read.evaluate((el) => getComputedStyle(el).color);

	await card.hover();
	await expect.poll(fill).not.toBe(rest);
	await expect(card.locator("a")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(read).toHaveCSS("text-decoration-line", "none");
	await expect(card.locator(".top-post__title")).toHaveCSS("color", blue);
});

test("the cards stagger in on arrival and out ahead of a navigation", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/txt/");
	const cards = page.locator(".page-hero__cards .ds-card");
	const delays = await cards.evaluateAll((els) =>
		els.map((el) => parseFloat(getComputedStyle(el).animationDelay)),
	);
	expect(delays[0]).toBe(0);
	expect(delays[1]).toBeGreaterThan(delays[0]);
	expect(delays[2]).toBeGreaterThan(delays[1]);

	await page.evaluate(() => {
		document.addEventListener(
			"astro:after-preparation",
			() => {
				const card = document.querySelector(".page-hero__cards .ds-card")!;
				(window as unknown as { __left: string }).__left = getComputedStyle(card).animationName;
			},
			{ once: true },
		);
	});
	await page.getByRole("link", { name: "About Me" }).click();
	await page.waitForURL("**/about/");
	expect(await page.evaluate(() => (window as unknown as { __left: string }).__left)).toBe("page-hero-card-out");
	await expect(cards).toHaveCSS("animation-name", "page-hero-card-in");
});

test("under reduced motion the cards simply sit there", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/txt/");
	await expect(page.locator(".page-hero__cards .ds-card").first()).toHaveCSS("animation-name", "none");
});

test("the halftone carries over between /txt and /about", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/txt/");
	await expect(page.locator(".page-hero h1")).toHaveText("Writing");
	await page.locator(".page-hero__grid[data-ready]").waitFor({ state: "attached" });

	await page.evaluate(() => {
		const grid = document.querySelector(".page-hero__grid") as HTMLElement & { __kept?: boolean };
		grid.__kept = true;
		(grid.querySelector("canvas") as HTMLCanvasElement & { __kept?: boolean }).__kept = true;
	});
	const kept = () =>
		page.evaluate(() => {
			const grid = document.querySelector(".page-hero__grid") as HTMLElement & { __kept?: boolean };
			const canvas = grid.querySelector("canvas") as (HTMLCanvasElement & { __kept?: boolean }) | null;
			return { element: !!grid.__kept, canvas: !!canvas?.__kept, ready: grid.hasAttribute("data-ready") };
		});

	await page.getByRole("link", { name: "About Me" }).click();
	await page.waitForURL("**/about/");
	await expect(page.locator(".page-hero h1")).toHaveText("About Me");
	expect(await kept()).toEqual({ element: true, canvas: true, ready: true });

	await page.getByRole("link", { name: "Writing" }).click();
	await page.waitForURL("**/txt/");
	await expect(page.locator(".page-hero h1")).toHaveText("Writing");
	expect(await kept()).toEqual({ element: true, canvas: true, ready: true });
});
