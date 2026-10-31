import { test, expect } from "./fixtures/test";
import type { Page } from "@playwright/test";
import { upcomingCache, upcomingMovies } from "./fixtures/amc";

/**
 * THE A-LIST CARD. The fan, the gauge and the readout are built by the
 * widget's script from the films the page carries as JSON; the gauge is a
 * slider (one film a step), the header's glyph toggles DATE and GENRE, and a
 * booked film reads as a countdown with a calendar disc on its centre poster.
 * The real data may hold bookings of its own, so counts are taken from the
 * page rather than assumed.
 */

// Posters come from AMC's Cloudinary (and the fixture's from Wikipedia): not
// fetched in the suite; a card without its art is the wash.
const routePosters = async (page: Page) => {
	for (const host of ["https://amc-theatres-res.cloudinary.com/**", "https://upload.wikimedia.org/**"]) {
		await page.route(host, (route) => route.fulfill({ status: 404 }));
	}
};

/** The built home page with the fixture's two bookings added to the card's
 *  films, as the build would have written them. */
const withBookings = async (page: Page) => {
	await page.route(
		// The page itself, not another host's root (the player's stream, the agent).
		(url) => url.pathname === "/" && url.origin === new URL(test.info().project.use.baseURL ?? "http://localhost").origin,
		async (route) => {
			const res = await route.fetch();
			const html = await res.text();
			const out = html.replace(
				/(<script type="application\/json" data-amc-films[^>]*>)([\s\S]*?)(<\/script>)/,
				(_, open: string, json: string, close: string) => {
					const films = JSON.parse(json);
					for (const m of upcomingMovies()) {
						const meta = Object.values(upcomingCache).find((e) => e.amc_id === m.id)!;
						films.push({
							n: m.name,
							d: m.iso,
							g: meta.primary_genre,
							h: `https://www.imdb.com/find/?q=${encodeURIComponent(m.name!)}`,
							p: m.poster,
							u: true,
						});
					}
					return open + JSON.stringify(films).replace(/</g, "\\u003c") + close;
				},
			);
			expect(out).not.toBe(html);
			await route.fulfill({ response: res, body: out });
		},
	);
};

const open = async (page: Page) => {
	await routePosters(page);
	await page.goto("/");
	const widget = page.locator(".wx-amc");
	await widget.waitFor({ state: "attached" });
	await page.evaluate(() => document.querySelector(".wx-amc")?.scrollIntoView({ block: "center" }));
	await expect(widget).toHaveAttribute("data-ready", "");
	return widget;
};

test("the fan opens on the latest film seen; the gauge steps through them", async ({ page }) => {
	const widget = await open(page);
	const slider = widget.locator('[role="slider"]');
	const title = widget.locator(".wx-amc-title");
	const max = Number(await slider.getAttribute("aria-valuemax"));
	expect(max).toBeGreaterThan(1);
	// Bookings sit after the films seen; the fan opens on the last one seen.
	const seen = max - (await widget.locator(".wx-amc-tick[data-up]").count());
	await expect(slider).toHaveAttribute("aria-valuenow", String(seen));
	await expect(widget.locator(".wx-amc-card[data-active]")).toHaveCount(1);
	await expect(widget.locator(".wx-amc-tick")).toHaveCount(max);
	await expect(title).toHaveAttribute("href", /^https:\/\/www\.imdb\.com\/(title\/tt\d+\/|find\/\?q=)/);
	await expect(title).toHaveAttribute("target", "_blank");

	const latest = await title.textContent();
	await slider.focus();
	await page.keyboard.press("ArrowLeft");
	await expect(slider).toHaveAttribute("aria-valuenow", String(seen - 1));
	await expect(title).not.toHaveText(latest ?? "");
	await page.keyboard.press("Home");
	await expect(slider).toHaveAttribute("aria-valuenow", "1");
	await expect(widget.locator(".wx-amc-ro")).toHaveText(/’\d\d$/);
});

test("the mode glyph sorts by genre and back, the film staying put", async ({ page }) => {
	const widget = await open(page);
	const mode = widget.locator("[data-amc-mode]");
	const title = widget.locator(".wx-amc-title");
	const film = await title.textContent();

	// A toggle, "Sort by genre", pressed while it is; the glyph shows the mode.
	await expect(mode).toHaveAccessibleName("Sort by genre");
	await expect(mode).toHaveAttribute("aria-pressed", "false");
	await expect(mode.locator(".wx-amc-glyph--date")).toHaveCSS("opacity", "1");
	await expect(mode.locator(".wx-amc-glyph--genre")).toHaveCSS("opacity", "0");
	await mode.click();
	await expect(widget).toHaveAttribute("data-mode", "genre");
	await expect(mode).toHaveAccessibleName("Sort by genre");
	await expect(mode).toHaveAttribute("aria-pressed", "true");
	await expect(mode.locator(".wx-amc-glyph--genre")).toHaveCSS("opacity", "1");
	await expect(mode.locator(".wx-amc-glyph--date")).toHaveCSS("opacity", "0");
	await expect(title).toHaveText(film ?? "");
	await expect(widget.locator(".wx-amc-ro .wx-amc-gname")).toBeVisible();
	await expect(widget.locator(".wx-amc-ro")).toHaveText(/\d+\s*of\s*\d+/i);
	// One capsule per genre, the current one lit, a notch in it.
	await expect(widget.locator(".wx-amc-capsule[data-on]")).toHaveCount(1);
	await expect.poll(() => widget.locator(".wx-amc-notch").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

	await mode.click();
	await expect(widget).toHaveAttribute("data-mode", "date");
	await expect(title).toHaveText(film ?? "");

	// Toggled again mid-shuffle: it morphs back from where it was and settles
	// in DATE, the needle up, the capsules gone, the film the same.
	await mode.click();
	await page.waitForTimeout(150);
	await mode.click();
	await expect(widget).toHaveAttribute("data-mode", "date");
	await expect.poll(() => widget.locator(".wx-amc-needle").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
	await expect.poll(() => widget.locator(".wx-amc-capsule").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
	await expect(title).toHaveText(film ?? "");
});

test("a booked film: grey poster, a calendar disc at the centre only, the days to go", async ({ page }) => {
	await withBookings(page);
	const widget = await open(page);
	const slider = widget.locator('[role="slider"]');
	await slider.focus();
	await page.keyboard.press("End");
	await page.keyboard.press("ArrowLeft");
	await expect(widget.locator(".wx-amc-title")).toHaveText("The Hunger Games: Sunrise on the Reaping");
	await expect(widget.locator(".wx-amc-ro")).toHaveText(/in\s*22\s*days/i);
	await expect(widget.locator(".wx-amc-ro")).toHaveAttribute("data-up", "");

	const active = widget.locator(".wx-amc-card[data-active]");
	await expect(active).toHaveClass(/wx-amc-card--up/);
	await expect(active.locator(".wx-amc-badge")).toHaveCSS("opacity", "1");
	// Every other booking (Hexed, and any in the real data) shows no disc.
	const booked = await widget.locator(".wx-amc-tick[data-up]").count();
	// The fixture's two bookings at least, each with a booked tick.
	expect(booked).toBeGreaterThanOrEqual(2);
	const others = widget.locator(".wx-amc-card--up:not([data-active]) .wx-amc-badge");
	await expect(others).toHaveCount(booked - 1);
	for (const badge of await others.all()) await expect(badge).toHaveCSS("opacity", "0");
});
