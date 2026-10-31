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
// `requested`, if given, collects the poster URLs asked for.
const routePosters = async (page: Page, requested?: Set<string>) => {
	for (const host of ["https://amc-theatres-res.cloudinary.com/**", "https://upload.wikimedia.org/**"]) {
		await page.route(host, (route) => {
			requested?.add(route.request().url());
			return route.fulfill({ status: 404 });
		});
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

const open = async (page: Page, requested?: Set<string>) => {
	await routePosters(page, requested);
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
	// The fixture's two bookings at least, each with a booked tick.
	const booked = await widget.locator(".wx-amc-tick[data-up]").count();
	expect(booked).toBeGreaterThanOrEqual(2);
	// Every other booking on the fan (Hexed, next to it, and any in the real
	// data) shows no disc. Only the fan's posters are drawn, so Hexed's is
	// there and a booking far off it isn't.
	const others = widget.locator(".wx-amc-card--up:not([data-active]) .wx-amc-badge");
	await expect(widget.locator('.wx-amc-card--up:not([data-active]):visible')).not.toHaveCount(0);
	expect(await others.count()).toBeLessThanOrEqual(booked - 1);
	for (const badge of await others.all()) await expect(badge).toHaveCSS("opacity", "0");
});

test("the fan recycles a few cards, and requests only the posters on it", async ({ page }) => {
	// A long history: the real films padded to 400, each with its own poster.
	const FILMS = 400;
	await page.route(
		(url) => url.pathname === "/" && url.origin === new URL(test.info().project.use.baseURL ?? "http://localhost").origin,
		async (route) => {
			const res = await route.fetch();
			const html = (await res.text()).replace(
				/(<script type="application\/json" data-amc-films[^>]*>)([\s\S]*?)(<\/script>)/,
				(_, open: string, json: string, close: string) => {
					const real = JSON.parse(json) as { d: string; u?: true }[];
					const seen = real.filter((f) => !f.u);
					const pad = Array.from({ length: FILMS - real.length }, (_, k) => ({
						n: `Padding ${k}`,
						d: "2020-01-01",
						g: "Other",
						h: `https://www.imdb.com/find/?q=padding-${k}`,
						p: `https://upload.wikimedia.org/padding/${k}.jpg`,
					}));
					// Before the real films, so the fan still opens on the latest seen.
					const films = [...pad, ...seen.map((f, k) => ({ ...f, p: `https://upload.wikimedia.org/real/${k}.jpg` })), ...real.filter((f) => f.u)];
					return open + JSON.stringify(films).replace(/</g, "\\u003c") + close;
				},
			);
			await route.fulfill({ response: res, body: html });
		},
	);
	const requested = new Set<string>();
	const widget = await open(page, requested);
	const slider = widget.locator('[role="slider"]');
	await expect(slider).toHaveAttribute("aria-valuemax", String(FILMS));
	// Every film still has its tick: the gauge is the whole history.
	await expect(widget.locator(".wx-amc-tick")).toHaveCount(FILMS);

	// At rest: a window of films round the centre, K either side (the
	// outermost pair clear). K is however many fit the card's width: on the
	// 2×1, more than the 1×1's three.
	const now = Number(await slider.getAttribute("aria-valuenow")) - 1;
	const drawn = () =>
		widget.locator(".wx-amc-card:visible").evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.film)).sort((a, b) => a - b));
	const atLoad = await drawn();
	const K = now - atLoad[0];
	expect(K).toBeGreaterThan(3);
	const hi = Math.min(FILMS - 1, now + K);
	expect(atLoad).toEqual(Array.from({ length: hi - (now - K) + 1 }, (_, k) => now - K + k));
	// The pool: a window leaving and one arriving, and two piles (arc.ts poolSize).
	const pool = 2 * (2 * K + 1) + 2;
	const cards = widget.locator(".wx-amc-card");
	expect(await cards.count()).toBeLessThanOrEqual(pool);

	// Only those posters were asked for.
	const films = await widget.locator("[data-amc-films]").evaluate((el) => JSON.parse(el.textContent ?? "[]"));
	const near = new Set(atLoad.map((i) => films[i].p));
	await expect.poll(() => requested.size).toBeGreaterThan(0);
	for (const url of requested) expect(near).toContain(url);

	// Moving and shuffling recycle the same few cards.
	await slider.focus();
	for (let k = 0; k < 12; k++) await page.keyboard.press("ArrowLeft");
	await expect(slider).toHaveAttribute("aria-valuenow", String(now + 1 - 12));
	await page.waitForTimeout(600); // the glide lands
	const mode = widget.locator("[data-amc-mode]");
	await mode.click();
	await page.waitForTimeout(150);
	expect(await cards.count()).toBeLessThanOrEqual(pool);
	await mode.click();
	await expect(slider).toHaveAttribute("aria-valuenow", String(now + 1 - 12));
	await expect.poll(() => widget.locator(".wx-amc-card:visible").count()).toBe(2 * K + 1);
	expect(await cards.count()).toBeLessThanOrEqual(pool);
	// Still nowhere near one request per film: the windows passed through.
	expect(requested.size).toBeLessThan(4 * (2 * K + 1) + 20);
});
