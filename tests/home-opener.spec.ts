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
		const box = (el: Element | null, carrier: Element | null = el) => {
			const r = el!.getBoundingClientRect();
			const t = getComputedStyle(carrier!).translate;
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
			/** The picture, between the card's empty header and footer bands. Inside
			 *  the card, so it is the card that carries its entrance. */
			picture: box(document.querySelector(".wx-videos dotted-grid"), document.querySelector(".wx-videos")),
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
		picture: Box;
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

/** Where the word holds: its sticky `top`. */
const holdTop = (page: Page) =>
	page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".sh__wordmark")!).top));

/** The scroll at which the first row arrives under the held word (a gap below it). */
const meetAt = (rest: { first: Box; word: Box }, top: number) => rest.first.y - 24 - top - rest.word.h;

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

test("the tagline wobbles whole, its ampersand oversized", async ({ page }) => {
	await open(page, 1440, 900);
	const wobble = page.locator(".sh__tagline wobble-text");
	await expect(wobble).toHaveText("& other stories");
	await expect.poll(() => wobble.evaluate((el) => getComputedStyle(el).filter)).toContain("url(");
	const [rest, amp] = await wobble.evaluate((el) => [
		parseFloat(getComputedStyle(el).fontSize),
		parseFloat(getComputedStyle(el.querySelector(".sh__amp")!).fontSize),
	]);
	expect(amp).toBe(rest * 2.25);
	// Up against the word's foot, and painted over it.
	const [ampBox, word] = await Promise.all([
		page.locator(".sh__amp").boundingBox(),
		page.locator(".sh__wordmark").boundingBox(),
	]);
	expect(ampBox!.y).toBeLessThan(word!.y + word!.height);
	await expect(page.locator(".sh__sub")).toHaveCSS("z-index", "2");
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

	test("the word drifts from the first pixel, holds, wipes to solid while held, and wobbles", async ({
		page,
	}) => {
		await open(page, 1440, 900);
		const rest = await at(page, 0);
		const early = await at(page, 20);
		expect(rest.word.y - early.word.y, "moves at once").toBeGreaterThan(1.5);
		expect(rest.word.y - early.word.y, "a fraction of the page").toBeLessThan(6);
		expect(early.clip, "no wipe before the pin").toBe(1);
		const top = await holdTop(page);
		expect(rest.word.y - top, "a few dozen px in all").toBeGreaterThan(20);
		expect(rest.word.y - top, "not leaving the middle").toBeLessThan(50);

		// Sample up to the row's arrival: the word holds still while the clip runs 1 → 0.
		const meet = meetAt(rest, top);
		const samples = [];
		for (let y = 0; y <= meet; y += 10) samples.push({ y, ...(await at(page, y)) });
		const held = samples.filter((s) => Math.abs(s.word.y - top) < 0.5);
		expect(held.length).toBeGreaterThan(10);
		// Starts as it holds (within a sample), done before the row arrives.
		expect(held[0].clip).toBeGreaterThan(0.9);
		expect(held[held.length - 1].clip).toBe(0);
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
	test("at rest: a 1×2 tile in the right column, the scrubber dormant, only 'tristan' over it", async ({ page }) => {
		await open(page, 390, 844);
		const s = await at(page, 0);
		// Right column, a 1×2 of the phone's cells. The word's box follows its glyph
		// advances, which Chromium on Linux rounds, hence the 1%.
		expect(Math.abs(s.card.right - s.word.right)).toBeLessThan(s.word.w * 0.01);
		expect(Math.abs(s.card.w - s.first.w)).toBeLessThan(1);
		expect(s.card.h).toBeGreaterThan(2 * s.first.w);
		// "tristan" spans the content width and runs over the picture; nothing else does.
		expect(overlaps(s.word, s.picture)).toBe(true);
		expect(overlaps(s.tagline, s.picture)).toBe(false);
		expect(overlaps(s.intro, s.picture)).toBe(false);
		expect(overlaps(s.tagline, s.card), "nor the tile's box").toBe(false);
		expect(overlaps(s.intro, s.card), "nor the tile's box").toBe(false);
		// The scrubber is faded out and locked until the card docks, and the tile
		// takes no input.
		const dormant = await page.evaluate(() => {
			const ruler = document.querySelector<HTMLElement>(".wx-videos .vc__ruler")!;
			return {
				opacity: getComputedStyle(ruler).opacity,
				inert: ruler.inert,
				host: getComputedStyle(document.querySelector(".wx-videos video-carousel")!).pointerEvents,
			};
		});
		expect(dormant).toEqual({ opacity: "0", inert: true, host: "none" });
	});

	test("the word moves at once; the wipe waits until it is clear of the picture", async ({ page }) => {
		await open(page, 390, 844);
		const rest = await at(page, 0);
		const early = await at(page, 20);
		expect(rest.word.y - early.word.y).toBeGreaterThan(1.5);
		let wipeStart = -1;
		for (let y = 0; y <= 400; y += 2) {
			const s = await at(page, y);
			if (s.clip < 1) {
				// The solid layer's opaque box must already be off the picture.
				expect(s.solid.bottom, `wipe began over the picture at ${y}`).toBeLessThanOrEqual(s.picture.y);
				wipeStart = y;
				break;
			}
		}
		expect(wipeStart).toBeGreaterThan(0);
		// ...and neither the wipe's backdrop nor the finished word ever cuts into the
		// picture, all the way to the dock, while the tile climbs back past the held word.
		const travel = await dockTravel(page);
		for (let y = wipeStart; y <= travel; y += 8) {
			const s = await at(page, y);
			expect(s.solid.bottom, `the backdrop covers the picture at ${y}`).toBeLessThanOrEqual(s.picture.y);
		}
		const docked = await at(page, Math.ceil(travel));
		expect(Math.abs(docked.card.y - docked.first.y)).toBeLessThan(1);
	});

	for (const [w, h] of [
		[390, 844],
		[360, 740],
		[320, 568],
		[430, 932],
		[820, 1180],
		[900, 1200],
	] as const) {
		test(`at ${w}×${h} the wipe is done before the row arrives, clear of the picture`, async ({ page }) => {
			await open(page, w, h);
			const rest = await at(page, 0);
			const top = await holdTop(page);
			const meet = meetAt(rest, top);
			const atMeet = await at(page, Math.floor(meet));
			expect(atMeet.clip, "wiped before the row arrives").toBe(0);
			for (let y = Math.floor(meet) - 200; y <= Math.ceil(meet) + 40; y += 8) {
				const s = await at(page, y);
				if (s.clip < 1) {
					expect(s.solid.bottom, `the backdrop covers the picture at ${y}`).toBeLessThanOrEqual(s.picture.y);
				}
			}
		});

		test(`at ${w}×${h} the word overlaps the picture's top by half a word, and only the word does`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			expect(Math.abs(s.word.bottom - s.picture.y - s.word.h / 2), "half a word over the picture").toBeLessThan(1.5);
			expect(overlaps(s.tagline, s.picture), "not the tagline").toBe(false);
			expect(overlaps(s.intro, s.picture), "not the blurb").toBe(false);
			// It still lands exactly in its cell.
			const travel = await dockTravel(page);
			const docked = await at(page, Math.ceil(travel));
			expect(Math.abs(docked.card.y - docked.first.y), "landed in its cell").toBeLessThan(1);
		});
	}
});

/** The copy's distance below "tristan" when it simply follows the word: .sh__sub's margin (--space-3). */
const COPY_MARGIN = 12;

test.describe("the copy on the picture's axis (compact step)", () => {
	const mid = (a: { y: number }, b: { bottom: number }) => (a.y + b.bottom) / 2;

	for (const [w, h] of [
		[390, 844],
		[412, 915],
		[430, 932],
		[600, 900],
		[768, 1024],
		[900, 1200],
	] as const) {
		test(`at ${w}×${h} the copy is centred on the picture, clear of the word and the picture`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			expect(Math.abs(mid(s.tagline, s.intro) - mid(s.picture, s.picture)), "on the picture's midpoint").toBeLessThan(2);
			expect(s.tagline.y - s.word.bottom, "below the word").toBeGreaterThanOrEqual(COPY_MARGIN - 0.5);
			for (const b of [s.tagline, s.intro]) {
				expect(overlaps(b, s.word), "not on the word").toBe(false);
				expect(overlaps(b, s.picture), "not on the picture").toBe(false);
			}
			// The word still overlaps the picture by half its height.
			expect(Math.abs(s.word.bottom - s.picture.y - s.word.h / 2)).toBeLessThan(1.5);
		});
	}

	for (const [w, h, name] of [
		[320, 568, "a phone whose copy is taller than the room"],
		[360, 740, "a phone whose copy is taller than the room"],
		[844, 390, "a short window, whose picture runs past the fold"],
	] as const) {
		test(`at ${w}×${h}, ${name}: the copy sits directly under the word`, async ({ page }) => {
			await open(page, w, h);
			const s = await at(page, 0);
			expect(Math.abs(s.tagline.y - s.word.bottom - COPY_MARGIN), "directly under the word").toBeLessThan(1);
			for (const b of [s.tagline, s.intro]) {
				expect(overlaps(b, s.word), "not on the word").toBe(false);
				expect(overlaps(b, s.picture), "not on the picture").toBe(false);
			}
			expect(s.tagline.y, "on the first screen").toBeLessThan(h);
		});
	}

	test("a large root font keeps the copy under the word, off the picture", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.addInitScript(() => {
			document.addEventListener("DOMContentLoaded", () => {
				document.documentElement.style.fontSize = "250%";
			});
		});
		await page.goto("/");
		await page.locator("stories-heading[data-ready]").waitFor({ state: "attached", timeout: 15_000 });
		const s = await at(page, 0);
		expect(s.tagline.y, "below the word").toBeGreaterThanOrEqual(s.word.bottom);
		expect(overlaps(s.intro, s.picture), "off the picture").toBe(false);
	});

	test("desktop: the copy follows the word, in plain flow", async ({ page }) => {
		await open(page, 1440, 900);
		const s = await at(page, 0);
		expect(Math.abs(s.tagline.y - s.word.bottom - COPY_MARGIN)).toBeLessThan(1);
		const sub = await page.evaluate(() => {
			const cs = getComputedStyle(document.querySelector(".sh__sub")!);
			return { display: cs.display, minBlockSize: cs.minBlockSize };
		});
		expect(sub.display).toBe("block");
		expect(["auto", "0px"]).toContain(sub.minBlockSize);
	});

	test("reduced motion: the card is docked below, so the copy stays under the word", async ({ browser }) => {
		const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		await page.goto("/");
		await page.locator("stories-heading[data-ready]").waitFor({ state: "attached", timeout: 15_000 });
		const s = await at(page, 0);
		expect(Math.abs(s.tagline.y - s.word.bottom - COPY_MARGIN), "directly under the word").toBeLessThan(1);
		await context.close();
	});

	test("print: the copy stays under the word", async ({ page }) => {
		await open(page, 390, 844);
		await page.emulateMedia({ media: "print" });
		const s = await at(page, 0);
		expect(Math.abs(s.tagline.y - s.word.bottom - COPY_MARGIN), "directly under the word").toBeLessThan(1);
	});

	test("it still fades on the same scroll and is not sticky", async ({ page }) => {
		await open(page, 430, 932);
		const rest = await at(page, 0);
		expect(rest.subOpacity).toBe(1);
		const near = await at(page, 60);
		expect(near.subOpacity, "the fade is under way").toBeLessThan(1);
		expect(near.subOpacity).toBeGreaterThan(0);
		expect(Math.abs(rest.tagline.y - near.tagline.y - 60), "moves with the page").toBeLessThan(0.5);
		const gone = await at(page, 100);
		expect(gone.subOpacity).toBe(0);
	});
});

/** The page's whole scroll. */
const maxScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

test.describe("the word holds in the middle", () => {
	for (const [w, h] of [
		[1440, 900],
		[1920, 1200],
		[1638, 980],
		[390, 844],
	] as const) {
		test(`at ${w}×${h} it stays near its rest until the first row meets it, and never overlaps the row`, async ({
			page,
		}) => {
			await open(page, w, h);
			const rest = await at(page, 0);
			const top = await holdTop(page);
			const meet = meetAt(rest, top);
			const rise = rest.word.y - top;
			expect(rise, "a few dozen px in all").toBeGreaterThan(20);
			expect(rise, "not leaving the middle").toBeLessThan(50);
			for (let y = 0; y <= meet; y += 8) {
				const s = await at(page, y);
				expect(s.word.y, `above its hold at ${y}`).toBeGreaterThanOrEqual(top - 0.5);
				expect(s.word.y, `below its rest at ${y}`).toBeLessThanOrEqual(rest.word.y + 0.5);
				expect(s.word.bottom, `into the first row at ${y}`).toBeLessThanOrEqual(s.first.y);
			}
			// The row arrives one gap below it, and from there they leave together.
			const met = await at(page, Math.ceil(meet));
			expect(Math.abs(met.first.y - met.word.bottom - 24), "a gap above the row").toBeLessThan(1.5);
			const later = await at(page, Math.ceil(meet) + 120);
			expect(Math.abs(met.word.y - later.word.y - 120), "rides up with the row").toBeLessThan(1.5);
			expect(later.first.y - later.word.bottom, "the same gap").toBeGreaterThanOrEqual(23);
		});
	}
});

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
		// its rest. A tall page may end with the word still in view.
		test(`at ${w}×${h} the word can settle`, async ({ page }) => {
			await open(page, w, h);
			const rest = await at(page, 0);
			const max = await maxScroll(page);
			const top = await holdTop(page);
			const settle = meetAt(rest, top);
			expect(max, "scroll enough to settle").toBeGreaterThanOrEqual(settle);
			const settled = await at(page, settle);
			expect(Math.abs(settled.word.y - top), "still pinned as it settles").toBeLessThan(1.5);
			expect(Math.abs(settled.first.y - settled.word.bottom - 24), "rests a gap above the row").toBeLessThan(1.5);
			const end = await at(page, max);
			expect(Math.abs(end.card.y - end.first.y), "and the card has landed").toBeLessThan(1);
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
			// The group's top on a phone is the word over the picture, and its foot the
			// picture's (the tile's empty bands aren't part of what's seen); on a desktop
			// it is the tile's own (the lockup centres inside its height).
			const phone = w <= 900;
			const top = phone ? s.word.y : Math.min(s.word.y, s.card.y);
			const foot = phone ? s.picture.bottom : s.card.bottom;
			const above = top - header;
			const below = s.first.y - foot;
			expect(Math.abs(above - below), `above ${above}, below ${below}`).toBeLessThan(1.5);
		});
	}

	test("a phone keeps the word's overlap of the picture, the empty header band parked above it", async ({ page }) => {
		await open(page, 390, 844);
		const s = await at(page, 0);
		expect(Math.abs(s.picture.y - (s.word.y + s.word.h / 2))).toBeLessThan(1);
		expect(s.picture.y - s.card.y, "the header's empty band above the picture").toBeGreaterThan(40);
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

	test("the fades still start at the top; the wipe starts at the hold and ends before the row", async ({ page }) => {
		await open(page, 1440, 900);
		const rest = await at(page, 0);
		const near = await at(page, 60);
		expect(near.clip, "no wipe before the pin").toBe(1);
		expect(near.subOpacity, "the fade is under way").toBeLessThan(1);
		const gone = await at(page, 100);
		expect(gone.subOpacity).toBe(0);
		const top = await holdTop(page);
		const late = await at(page, Math.floor(meetAt(rest, top)) - 4);
		expect(Math.abs(late.word.y - top), "still held as the row arrives").toBeLessThan(1);
		expect(late.clip, "wiped before the row arrives").toBe(0);
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
	// No drift: it holds where it rests from the first pixel (plain sticky).
	expect(Math.abs(rest.word.y - s.word.y)).toBeLessThan(0.5);
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
