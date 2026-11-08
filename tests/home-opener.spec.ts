import { test, expect, MEDIA_BASE, type Page } from "./fixtures/test";

/**
 * THE HOMEPAGE OPENER (src/layouts/HomeLayout.astro): "tristan", "& other stories"
 * and the intro in the left column, the videos card parked in the right one; on
 * scroll the word drifts, pins and wipes to solid, the rest of the lockup fades,
 * and the card drops into its 1×2 cell. The checks follow the opener's acceptance
 * list, in a real engine, at the desktop and phone sizes it was drawn for.
 * (JS-off parity and layout shift: hero-first-frame.spec.ts. One mechanism per
 * engine: scroll-fallback.spec.ts.)
 */

type Box = { x: number; y: number; w: number; h: number; right: number; bottom: number };

async function at(page: Page, y: number) {
	await page.evaluate((v) => window.scrollTo(0, v), y);
	await page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
	);
	return page.evaluate(() => {
		// The cards carry the reveal's entrance (`translate`, a rise that may be held
		// or mid-flight); the geometry here is the painted box without it.
		const box = (el: Element | null) => {
			const r = el!.getBoundingClientRect();
			const t = getComputedStyle(el!).translate;
			const dy = t === "none" ? 0 : parseFloat(t.split(" ")[1] ?? "0") || 0;
			const y = r.y - dy;
			return { x: r.x, y, w: r.width, h: r.height, right: r.right, bottom: y + r.height };
		};
		const solid = document.querySelector<HTMLElement>(".sh__solid")!;
		const m = /inset\(([\d.]+)%/.exec(getComputedStyle(solid).clipPath);
		return {
			word: box(document.querySelector(".sh__wordmark")),
			solid: box(solid),
			tagline: box(document.querySelector(".sh__tagline")),
			intro: box(document.querySelector(".sh__sub > :last-child")),
			card: box(document.querySelector(".wx-videos")),
			first: box(document.querySelector('[data-widget="now-playing"]')),
			subOpacity: Number(getComputedStyle(document.querySelector(".sh__sub")!).opacity),
			/** 1 = all outline, 0 = all solid. */
			clip: m ? Number(m[1]) / 100 : getComputedStyle(solid).clipPath === "none" ? 0 : 1,
		};
	}) as Promise<{
		word: Box;
		solid: Box;
		tagline: Box;
		intro: Box;
		card: Box;
		first: Box;
		subOpacity: number;
		clip: number;
	}>;
}

const overlaps = (a: Box, b: Box) =>
	a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;

/** The stylesheet's --vc-dock-travel, in px. */
function dockTravel(page: Page): Promise<number> {
	return page.evaluate(() => {
		const probe = document.createElement("div");
		probe.style.cssText = "position:absolute;visibility:hidden;width:0;height:var(--vc-dock-travel)";
		const card = document.querySelector(".wx-videos")!;
		card.appendChild(probe);
		const h = probe.getBoundingClientRect().height;
		probe.remove();
		return h;
	});
}

async function open(page: Page, width: number, height: number) {
	await page.setViewportSize({ width, height });
	await page.goto("/");
	await page.locator("stories-heading[data-ready]").waitFor({ state: "attached", timeout: 15_000 });
}

test("no halftone hero: the only grid is the card's, and no fabric is asked for", async ({ page }) => {
	const media: string[] = [];
	page.on("request", (r) => {
		if (r.url().startsWith(MEDIA_BASE)) media.push(r.url());
	});
	await open(page, 1440, 900);
	await page.waitForTimeout(1000);
	expect(await page.locator("dotted-grid").count()).toBe(1);
	await expect(page.locator(".wx-videos dotted-grid")).toHaveCount(1);
	expect(media.filter((u) => /fabric/.test(u))).toEqual([]);
});

test("one heading names the lockup; its layers are hidden from assistive tech", async ({ page }) => {
	await open(page, 1440, 900);
	await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
	await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Tristan & other stories");
	for (const s of [".sh__outline", ".sh__solid", ".sh__tagline"]) {
		await expect(page.locator(s)).toHaveAttribute("aria-hidden", "true");
	}
});

test("the stated header band is the real one", async ({ page }) => {
	// HomeLayout states --home-header-h so the pin's start is known without a
	// script; it must stay the bar's real height.
	await open(page, 1440, 900);
	const got = await page.evaluate(() => {
		const probe = document.createElement("div");
		probe.style.cssText = "position:absolute;visibility:hidden;height:var(--home-header-h)";
		document.querySelector(".home")!.appendChild(probe);
		const stated = probe.getBoundingClientRect().height;
		probe.remove();
		return { stated, real: document.querySelector(".site-header")!.getBoundingClientRect().height };
	});
	expect(Math.abs(got.stated - got.real)).toBeLessThanOrEqual(1);
});

test.describe("desktop 1440×900", () => {
	test("at rest: the lockup left of the carousel, nothing overlapping", async ({ page }) => {
		await open(page, 1440, 900);
		const s = await at(page, 0);
		for (const [name, b] of Object.entries({ word: s.word, tagline: s.tagline, intro: s.intro })) {
			expect(b.right, `${name} runs into the carousel`).toBeLessThan(s.card.x);
			expect(overlaps(b, s.card), name).toBe(false);
		}
		// The carousel is a 1×2 tile: its width is a card's, its height two and a gap.
		expect(Math.abs(s.card.w - s.first.w)).toBeLessThan(1);
		expect(s.card.h).toBeGreaterThan(2 * s.first.w);
		// The lockup centres beside the tile (the copy's stated height, not its
		// measured one, decides its side), both above the cards.
		const lockupMid = (s.word.y + s.intro.bottom) / 2;
		const cardMid = (s.card.y + s.card.bottom) / 2;
		expect(Math.abs(lockupMid - cardMid), "on one axis").toBeLessThan(6);
		expect(s.card.bottom).toBeLessThan(s.first.y);
	});

	test("the speed reads a little faster than the page, and it lands in its cell", async ({ page }) => {
		await open(page, 1440, 900);
		const travel = await dockTravel(page);
		const rest = await at(page, 0);
		const s = await at(page, 40);
		const docSpeed = (s.card.y + 40 - rest.card.y) / 40;
		expect(docSpeed, "faster than the page").toBeGreaterThan(1.3);
		expect(docSpeed, "but not a drop").toBeLessThan(1.6);
		// Never ahead of its cell, and in it at the end of the range.
		for (const q of [0.25, 0.5, 0.75, 0.95]) {
			const m = await at(page, Math.round(travel * q));
			expect(m.card.y, `still above its cell at ${q}`).toBeLessThan(m.first.y);
		}
		const landed = await at(page, Math.ceil(travel));
		expect(Math.abs(landed.card.y - landed.first.y)).toBeLessThan(1);
		// The cell comes to rest where the card started on the screen.
		expect(Math.abs(landed.card.y - rest.card.y)).toBeLessThan(2);
	});

	test("at 100px the intro and '& other stories' are gone, 'tristan' is not", async ({ page }) => {
		await open(page, 1440, 900);
		const s = await at(page, 100);
		expect(s.subOpacity).toBe(0);
		expect(s.word.bottom).toBeGreaterThan(0);
		expect(await page.locator(".sh__wordmark").isVisible()).toBe(true);
	});

	test("the word drifts from the first pixel, pins, wipes to solid while pinned, and wobbles", async ({
		page,
	}) => {
		await open(page, 1440, 900);
		const rest = await at(page, 0);
		const early = await at(page, 10);
		expect(rest.word.y - early.word.y, "moves at once").toBeGreaterThan(5);
		expect(rest.word.y - early.word.y, "slower than the page").toBeLessThan(9.5);
		expect(early.clip, "no wipe before the pin").toBe(1);

		// Sample the pinned stretch: the word holds still while the clip runs 1 → 0.
		const samples = [];
		// Past the pin (at 1.25 × the word's distance to the sticky line) and the
		// wipe's whole range, to the pin's end.
		for (let y = 0; y <= 745; y += 10) samples.push({ y, ...(await at(page, y)) });
		const pinTop = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".sh__wordmark")!).top));
		const pinned = samples.filter((s) => Math.abs(s.word.y - pinTop) < 0.5);
		expect(pinned.length).toBeGreaterThan(10);
		const firstPinned = pinned[0];
		const lastPinned = pinned[pinned.length - 1];
		// Starts as it pins (within a sample), done before it lets go.
		expect(firstPinned.clip).toBeGreaterThan(0.9);
		expect(lastPinned.clip).toBe(0);
		for (let i = 1; i < samples.length; i++) expect(samples[i].clip).toBeLessThanOrEqual(samples[i - 1].clip + 1e-3);
		// The solid layer carries the wobble's displacement filter.
		const filter = await page.evaluate(
			() => getComputedStyle(document.querySelector(".sh__solid wobble-text")!).filter,
		);
		expect(filter).toMatch(/url\(/);
	});

	test("the word comes to rest above the first row and leaves with it", async ({ page }) => {
		await open(page, 1440, 900);
		const a = await at(page, 900);
		const b = await at(page, 1000);
		expect(a.word.bottom).toBeLessThanOrEqual(a.first.y);
		expect(a.first.y - a.word.bottom, "rests directly above the row").toBeLessThan(40);
		expect(Math.abs(a.word.y - a.first.y - (b.word.y - b.first.y)), "moves with the grid").toBeLessThan(0.5);
	});

	test("the carousel outruns the scroll, then sits in its cell", async ({ page }) => {
		await open(page, 1440, 900);
		const rest = await at(page, 0);
		const s1 = await at(page, 100);
		// Its document position moved further than the page scrolled.
		expect(s1.card.y + 100 - rest.card.y).toBeGreaterThan(100);
		const docked = await at(page, 900);
		// In its cell: the top of the first card row, two rows tall, its column's width.
		expect(Math.abs(docked.card.y - docked.first.y)).toBeLessThan(0.5);
		expect(Math.abs(docked.card.w - docked.first.w)).toBeLessThan(0.5);
		const later = await at(page, 1000);
		expect(Math.abs(later.card.y - docked.card.y + 100)).toBeLessThan(0.5);
	});
});

test.describe("phone 390×844", () => {
	test("at rest: a 1×2 tile in the right column, no scrubber, only 'tristan' over it", async ({ page }) => {
		await open(page, 390, 844);
		const s = await at(page, 0);
		// Right column, a 1×2 of the phone's cells.
		expect(Math.abs(s.card.right - s.word.right)).toBeLessThan(1);
		expect(Math.abs(s.card.w - s.first.w)).toBeLessThan(1);
		expect(s.card.h).toBeGreaterThan(2 * s.first.w);
		// "tristan" spans the content width and runs over the tile; nothing else does.
		expect(overlaps(s.word, s.card)).toBe(true);
		expect(overlaps(s.tagline, s.card)).toBe(false);
		expect(overlaps(s.intro, s.card)).toBe(false);
		// No scrubber, and the tile takes no input.
		await expect(page.locator(".wx-videos .vc__ruler")).toBeHidden();
		expect(
			await page.evaluate(() => getComputedStyle(document.querySelector(".wx-videos video-carousel")!).pointerEvents),
		).toBe("none");
	});

	test("the word moves at once; the wipe waits until it is clear of the tile", async ({ page }) => {
		await open(page, 390, 844);
		const rest = await at(page, 0);
		const early = await at(page, 10);
		expect(rest.word.y - early.word.y).toBeGreaterThan(5);
		let started = false;
		for (let y = 0; y <= 400; y += 2) {
			const s = await at(page, y);
			if (s.clip < 1) {
				// The solid layer's opaque box must already be off the picture.
				expect(s.solid.bottom, `wipe began over the tile at ${y}`).toBeLessThanOrEqual(s.card.y);
				started = true;
				break;
			}
		}
		expect(started).toBe(true);
		// ...and the tile stays clear of the pinned word on the way down.
		const travel = await dockTravel(page);
		for (let y = 80; y <= travel; y += 40) {
			const s = await at(page, y);
			if (s.clip < 1 && s.word.y < 20) {
				expect(s.solid.bottom, `the word covers the tile at ${y}`).toBeLessThanOrEqual(s.card.y);
			}
		}
		const docked = await at(page, Math.ceil(travel));
		expect(Math.abs(docked.card.y - docked.first.y)).toBeLessThan(1);
	});
});

/** The page's whole scroll. */
const maxScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

test.describe("the opener is its own first screen", () => {
	for (const [w, h] of [
		[1440, 900],
		[390, 844],
	] as const) {
		test(`at ${w}×${h} the first row starts just below the fold`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			expect(s.first.y, "above the fold").toBeGreaterThanOrEqual(h);
			expect(s.first.y, "not far below it").toBeLessThan(h + 40);
			expect(s.card.y, "the parked card is above the fold").toBeLessThan(h);
		});
	}

	for (const [w, h] of [
		[1920, 1200],
		[2560, 1440],
	] as const) {
		test(`at ${w}×${h} the opener is capped and the cards peek in`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			expect(s.first.y, "the opener stopped growing").toBeLessThan(1000);
			expect(s.first.y, "the row peeks in").toBeLessThan(h);
			expect(s.first.y, "but it is still a first screen").toBeGreaterThan(900);
		});

		// The tall-window defect: the page ran out of scroll with the word short of
		// its rest, or ended with its letters cropped by the top of the window.
		test(`at ${w}×${h} the word can settle and the page doesn't end on it`, async ({ page }) => {
			await open(page, w, h);
			const rest = await at(page, 0);
			const max = await maxScroll(page);
			const settle = rest.first.y - 24 - rest.word.h - 16;
			expect(max, "scroll enough to settle").toBeGreaterThanOrEqual(settle);
			const settled = await at(page, settle);
			expect(Math.abs(settled.word.y - 16), "still pinned as it settles").toBeLessThan(1.5);
			expect(Math.abs(settled.first.y - settled.word.bottom - 24), "rests a gap above the row").toBeLessThan(1.5);
			const end = await at(page, max);
			expect(Math.abs(end.card.y - end.first.y), "and the card has landed").toBeLessThan(1);
			expect(end.word.bottom, "the word has gone, not half-gone").toBeLessThanOrEqual(0);
		});
	}

	test("if the opener ever outreaches the page's scroll, the dock lands at the page's end", async ({ page }) => {
		await open(page, 2560, 1440);
		// The settle floor keeps this from happening on its own; without it the
		// timeline's min(travel, 100%) is what lands the card.
		await page.addStyleTag({ content: ".home { min-block-size: 0 !important; }" });
		const travel = await dockTravel(page);
		const max = await maxScroll(page);
		expect(travel, "the geometry this guards").toBeGreaterThan(max);
		const end = await at(page, max);
		expect(Math.abs(end.card.y - end.first.y)).toBeLessThan(1);
	});

	for (const [w, h, name] of [
		[1440, 900, "desktop"],
		[1920, 1200, "a tall window"],
		[2560, 1440, "a very tall window"],
		[390, 844, "a phone"],
	] as const) {
		test(`${name}: the group is centred between the header and the first row`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			const header = await page.evaluate(() => document.querySelector(".site-header")!.getBoundingClientRect().bottom);
			// The group's top on a phone is the word over the tile's top; on a
			// desktop the tile's own (the lockup centres inside its height).
			const top = Math.min(s.word.y, s.card.y);
			const above = top - header;
			const below = s.first.y - s.card.bottom;
			expect(Math.abs(above - below), `above ${above}, below ${below}`).toBeLessThan(1.5);
		});
	}

	test("a phone keeps the word's overlap of the tile", async ({ page }) => {
		await open(page, 390, 844);
		const s = await at(page, 0);
		expect(Math.abs(s.card.y - (s.word.y + s.word.h / 2))).toBeLessThan(1);
	});

	test("a short window is top-anchored, not pushed under the header", async ({ page }) => {
		await open(page, 844, 390);
		const s = await at(page, 0);
		const header = await page.evaluate(() => document.querySelector(".site-header")!.getBoundingClientRect().bottom);
		expect(s.word.y, "below the header").toBeGreaterThanOrEqual(header);
		expect(s.word.y - header, "at the opener's top").toBeLessThan(10);
	});

	for (const [w, h, name] of [
		[844, 390, "a short landscape window"],
		[1440, 500, "a short desktop window"],
	] as const) {
		test(`in ${name} the opener still holds the parked card and its content`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			expect(s.first.y).toBeGreaterThanOrEqual(h);
			expect(s.card.bottom, "the parked card clears the first row").toBeLessThan(s.first.y);
			expect(s.intro.bottom, "the lockup fits").toBeLessThanOrEqual(s.first.y);
		});
	}

	test("a large root font grows the opener, and the card still lands", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.addInitScript(() => {
			document.addEventListener("DOMContentLoaded", () => {
				document.documentElement.style.fontSize = "250%";
			});
		});
		await page.goto("/");
		await page.locator("stories-heading[data-ready]").waitFor({ state: "attached", timeout: 15_000 });
		const s = await at(page, 0);
		expect(s.intro.bottom, "the row holds its content").toBeLessThanOrEqual(s.first.y);
		const docked = await at(page, 3000);
		expect(Math.abs(docked.card.y - docked.first.y)).toBeLessThan(1);
	});

	test("the wipe and the fades start where they did, over a longer pin", async ({ page }) => {
		await open(page, 1440, 900);
		const near = await at(page, 60);
		expect(near.clip, "no wipe before the pin").toBe(1);
		const gone = await at(page, 100);
		expect(gone.subOpacity).toBe(0);
		const late = await at(page, 740);
		expect(Math.abs(late.word.y - 16), "still pinned deep into the opener").toBeLessThan(1);
		expect(late.clip, "wiped before the pin ends").toBe(0);
	});
});

test("reduced motion: no drift, wipe, fade or parallax, and everything shows", async ({ browser }) => {
	const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	await page.goto("/");
	await page.locator("stories-heading[data-ready]").waitFor({ state: "attached", timeout: 15_000 });
	const rest = await at(page, 0);
	expect(rest.clip, "the word is solid").toBe(0);
	expect(rest.subOpacity).toBe(1);
	// The carousel renders in its cell, with no lift.
	expect(Math.abs(rest.card.y - rest.first.y)).toBeLessThan(0.5);
	const s = await at(page, 40);
	// The word moves 1:1 with the page until it pins (sticky, no drift).
	expect(rest.word.y - s.word.y).toBeCloseTo(40, 0);
	expect(s.subOpacity).toBe(1);
	expect(s.clip).toBe(0);
	expect(
		await page.evaluate(() =>
			[".sh__wordmark", ".sh__solid", ".sh__sub", ".wx-videos"].flatMap((q) =>
				document.querySelector(q)!.getAnimations().map((a) => (a as CSSAnimation).animationName),
			),
		),
	).toEqual([]);
	await context.close();
});

test("print shows the intro and '& other stories'", async ({ page }) => {
	await open(page, 1440, 900);
	await at(page, 400);
	await page.emulateMedia({ media: "print" });
	const sub = await page.evaluate(() => {
		const cs = getComputedStyle(document.querySelector(".sh__sub")!);
		return { opacity: Number(cs.opacity), visibility: cs.visibility };
	});
	expect(sub).toEqual({ opacity: 1, visibility: "visible" });
	// No fold on paper: the opener is only as tall as the parked card needs.
	const fit = await page.evaluate(() => ({
		opener: document.querySelector("stories-heading")!.getBoundingClientRect().height,
		card: (document.querySelector(".wx-videos") as HTMLElement).offsetHeight,
	}));
	expect(fit.opener).toBeLessThanOrEqual(fit.card + 1);
});
