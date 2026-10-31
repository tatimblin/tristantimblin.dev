import { test, expect, POSTER_STUB, TMDB_PATTERN } from "./fixtures/test";
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

// Posters come from TMDB's CDN, else AMC's Cloudinary (and the fixture's
// from Wikipedia). TMDB's are answered with a tiny stub image
// (tests/fixtures/test.ts); the others 404, and the card falls back to its
// placeholder. `requested`, if given, collects the poster URLs asked for.
const routePosters = async (page: Page, requested?: Set<string>) => {
	for (const host of ["https://amc-theatres-res.cloudinary.com/**", "https://upload.wikimedia.org/**"]) {
		await page.route(host, (route) => {
			requested?.add(route.request().url());
			return route.fulfill({ status: 404 });
		});
	}
	await page.route(TMDB_PATTERN, (route) => {
		requested?.add(route.request().url());
		// A poster named broken.jpg fails, to test the fallback.
		if (route.request().url().endsWith("/broken.jpg")) return route.fulfill({ status: 404 });
		return route.fulfill({ path: POSTER_STUB, contentType: "image/jpeg" });
	});
};

type FilmJson = { n: string; d: string; g: string; h: string; p: string | null; u?: true };

/** The built home page with the card's films rewritten by `edit`. */
const withFilms = async (page: Page, edit: (films: FilmJson[]) => FilmJson[]) => {
	await page.route(
		(url) => url.pathname === "/" && url.origin === new URL(test.info().project.use.baseURL ?? "http://localhost").origin,
		async (route) => {
			const res = await route.fetch();
			const html = (await res.text()).replace(
				/(<script type="application\/json" data-amc-films[^>]*>)([\s\S]*?)(<\/script>)/,
				(_, open: string, json: string, close: string) =>
					open + JSON.stringify(edit(JSON.parse(json))).replace(/</g, "\\u003c") + close,
			);
			await route.fulfill({ response: res, body: html });
		},
	);
};

/** Navigator.connection.saveData, as a browser with Data Saver on reports it. */
const saveData = (page: Page) =>
	page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }));

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
	// Data Saver on: this counts the posters the fan itself asks for, so the
	// prefetch the focus below would start (tested on its own) stays off.
	await saveData(page);
	const requested = new Set<string>();
	const widget = await open(page, requested);
	const slider = widget.locator('[role="slider"]');
	await expect(slider).toHaveAttribute("aria-valuemax", String(FILMS));
	// Every film still has its tick: the gauge is the whole history.
	await expect(widget.locator(".wx-amc-tick")).toHaveCount(FILMS);

	// At rest: the centre and three either side (the outermost pair clear),
	// on a pool of at most 16 cards (fan.ts's POOL).
	const now = Number(await slider.getAttribute("aria-valuenow")) - 1;
	const lo = Math.max(0, now - 3);
	const hi = Math.min(FILMS - 1, now + 3);
	const cards = widget.locator(".wx-amc-card");
	await expect(widget.locator(".wx-amc-card:visible")).toHaveCount(hi - lo + 1);
	expect(await cards.count()).toBeLessThanOrEqual(16);

	// Only those posters were asked for: the films within three of the centre.
	const films = await widget.locator("[data-amc-films]").evaluate((el) => JSON.parse(el.textContent ?? "[]"));
	const near = new Set(films.slice(lo, hi + 1).map((f: { p: string | null }) => f.p));
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
	expect(await cards.count()).toBeLessThanOrEqual(16);
	await mode.click();
	await expect(slider).toHaveAttribute("aria-valuenow", String(now + 1 - 12));
	await expect.poll(() => widget.locator(".wx-amc-card:visible").count()).toBe(7);
	expect(await cards.count()).toBeLessThanOrEqual(16);
	// Still nowhere near one request per film.
	expect(requested.size).toBeLessThan(60);
});

test("a film with no poster shows its title on its genre's tint; a booked one's is grey; a failed poster falls back", async ({ page }) => {
	let latest = "";
	let failing = "";
	const booked = "A Booked Film";
	await withFilms(page, (films) => {
		const seen = films.filter((f) => !f.u);
		const last = seen[seen.length - 1];
		const prev = seen[seen.length - 2];
		latest = last.n;
		failing = prev.n;
		last.p = null;
		prev.p = "https://image.tmdb.org/t/p/w185/broken.jpg";
		return [...seen, { n: booked, d: "2099-01-01", g: "Drama", h: "https://www.imdb.com/find/?q=x", p: null, u: true }];
	});
	const widget = await open(page);
	const active = widget.locator(".wx-amc-card[data-active]");
	await expect(widget.locator(".wx-amc-title")).toHaveText(latest);
	await expect(active).toHaveAttribute("data-ph", "");
	await expect(active.locator(".wx-amc-ph")).toBeVisible();
	await expect(active.locator(".wx-amc-ph")).toHaveText(latest);
	await expect(active.locator(".wx-amc-art")).toHaveCount(0);
	// The tint is the genre's colour mixed into the card, not the plain wash.
	const tint = await active.locator(".wx-amc-ph").evaluate((el) => getComputedStyle(el).backgroundColor);
	const wash = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(tint).not.toBe(wash);

	// The poster before it 404s: its card shows the placeholder, not a blank.
	const failed = widget.locator(".wx-amc-card", { has: page.locator(".wx-amc-ph", { hasText: failing }) }).first();
	await expect(failed).toHaveAttribute("data-ph", "");
	await expect(failed.locator(".wx-amc-ph")).toBeVisible();

	// The booked film's placeholder is grey, even at the centre.
	const slider = widget.locator('[role="slider"]');
	await slider.focus();
	await page.keyboard.press("End");
	await expect(widget.locator(".wx-amc-title")).toHaveText(booked);
	await expect(active).toHaveClass(/wx-amc-card--up/);
	await expect(active.locator(".wx-amc-ph")).toHaveText(booked);
	await expect(active.locator(".wx-amc-ph")).toHaveCSS("filter", /grayscale\(1\)/);
});

/** Every film a TMDB poster of its own; the returned function reads how many. */
const tmdbFilms = async (page: Page) => {
	let count = 0;
	await withFilms(page, (films) => {
		count = films.length;
		return films.map((f, k) => ({ ...f, p: `https://image.tmdb.org/t/p/w185/film-${k}.jpg` }));
	});
	return () => count;
};

test("posters are prefetched on the first hover, not on load", async ({ page }) => {
	const total = await tmdbFilms(page);
	const requested = new Set<string>();
	const widget = await open(page, requested);
	await page.waitForTimeout(500);
	// On load: only the fan's own seven (the centre ±3).
	expect(requested.size).toBeGreaterThan(0);
	expect(requested.size).toBeLessThanOrEqual(7);
	expect(await widget.getAttribute("data-prefetch")).toBeNull();

	await widget.locator(".wx-amc-fan").hover();
	await expect(widget).toHaveAttribute("data-prefetch", "on");
	await expect.poll(() => requested.size).toBe(total());

	// Recycled onto a card, a warmed poster shows at once: no hidden art.
	const slider = widget.locator('[role="slider"]');
	await slider.focus();
	await page.keyboard.press("Home");
	await expect(slider).toHaveAttribute("aria-valuenow", "1");
	await page.waitForTimeout(600); // the glide lands
	const arts = widget.locator(".wx-amc-card:visible .wx-amc-art");
	await expect(arts).not.toHaveCount(0);
	for (const art of await arts.all()) await expect(art).not.toHaveCSS("visibility", "hidden");
});

test("focus starts the prefetch too; Data Saver turns it off", async ({ page, browser }) => {
	const total = await tmdbFilms(page);
	const requested = new Set<string>();
	const widget = await open(page, requested);
	await widget.locator('[role="slider"]').focus();
	await expect(widget).toHaveAttribute("data-prefetch", "on");
	await expect.poll(() => requested.size).toBe(total());

	const ctx = await browser.newContext();
	const saver = await ctx.newPage();
	await saveData(saver);
	await tmdbFilms(saver);
	const asked = new Set<string>();
	const w2 = await open(saver, asked);
	await w2.locator(".wx-amc-fan").hover();
	await w2.locator('[role="slider"]').focus();
	await expect(w2).toHaveAttribute("data-prefetch", "off");
	await saver.waitForTimeout(500);
	expect(asked.size).toBeLessThanOrEqual(7);
	await ctx.close();
});
