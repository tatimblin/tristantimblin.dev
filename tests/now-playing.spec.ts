import { join } from "node:path";
import { test, expect, type Page } from "./fixtures/test";

/**
 * The now-playing card's cover, measured in its shadow DOM. A 1×1 card has
 * no height to give a cover over the title, the artist and the ruler, so up to
 * a card of about 300px the art is a small tile BESIDE the title; above that
 * it is the cover over it. The one regression these catch is the art being
 * given what height is left, which is about 24px in a 208px card.
 */

/** src/widgets/now-playing/config.ts's SPOTIFY_SSE_URL. */
const SSE = "https://spotify-stream-player-j2yxapx3oa-uk.a.run.app/**";
const COVER = join(import.meta.dirname, "fixtures", "poster-stub.jpg");

const DESKTOP = { width: 1638, height: 980 };
const PHONE = { width: 390, height: 844 };
/** Two columns, each wide enough that the cover fits over the title. */
const TABLET = { width: 860, height: 900 };

/** About --space-8, allowing for the phone's subpixel card. */
const MIN_ART = 44;

const track = {
	track: "The Still Sea",
	url: "https://open.spotify.com/track/stub",
	album: "An Album",
	albumUrl: "https://open.spotify.com/album/stub",
	artists: "An Artist",
	artistUrl: "https://open.spotify.com/artist/stub",
	cover: "https://i.scdn.co/image/stub-640",
	covers: [{ url: "https://i.scdn.co/image/stub-640", width: 640, height: 640 }],
	progress: 120_000,
	duration: 240_000,
	playing: false,
	time: new Date().toISOString(),
};

type Message = Partial<typeof track>;

/** Answers the stream with one message, or never (`null`: the skeleton stays). */
async function stream(page: Page, message: Message | null): Promise<void> {
	await page.route(SSE, (route) => {
		if (!message) return;
		return route.fulfill({
			status: 200,
			headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
			body: `retry: 86400000\ndata: ${JSON.stringify({ ...track, ...message })}\n\n`,
		});
	});
	await page.route("https://i.scdn.co/**", (route) =>
		route.fulfill({ path: COVER, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" } }),
	);
}

async function open(page: Page, message: Message | null): Promise<void> {
	await stream(page, message);
	await page.goto("/");
	const card = page.locator('[data-widget="now-playing"]');
	await card.scrollIntoViewIfNeeded();
	await expect(card).toHaveAttribute("data-widget-state", "mounted", { timeout: 15_000 });
	// The player's first render: the skeleton's, or the message's.
	await page.waitForFunction(
		(loaded) => {
			const root = document.querySelector('[data-widget="now-playing"] spotify-player')?.shadowRoot;
			const details = root?.querySelector(".details");
			return !!details && (!loaded || !details.classList.contains("skeleton"));
		},
		message !== null,
	);
}

interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

async function measure(page: Page) {
	return page.evaluate(() => {
		const card = document.querySelector('[data-widget="now-playing"]')!;
		const player = card.querySelector("spotify-player")!;
		const shadow = player.shadowRoot!;
		const box = (el: Element | null): Box | null => {
			if (!el) return null;
			const { left, right, top, bottom, width, height } = el.getBoundingClientRect();
			return { left, right, top, bottom, width, height };
		};
		return {
			card: box(card)!,
			player: box(player)!,
			art: box(shadow.querySelector(".art")),
			text: box(shadow.querySelector(".text"))!,
			title: box(shadow.querySelector(".title"))!,
			progress: box(shadow.querySelector(".progress"))!,
		};
	});
}

for (const [name, viewport] of Object.entries({ desktop: DESKTOP, phone: PHONE })) {
	test.describe(`now playing's 1×1 card, ${name}`, () => {
		test.use({ viewport });

		for (const theme of ["light", "dark"]) {
			test(`the art is a tile beside the title (${theme})`, async ({ page }) => {
				await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
				await open(page, track);
				const { card, art, title, progress } = await measure(page);

				expect(art!.width, "art width").toBeGreaterThanOrEqual(MIN_ART);
				expect(art!.height, "art height").toBeGreaterThanOrEqual(MIN_ART);
				expect(Math.abs(art!.width - art!.height), "the art is square").toBeLessThanOrEqual(1);

				// Beside the title, level with it, not above it.
				expect(art!.right, "the art ends before the title").toBeLessThanOrEqual(title.left);
				expect(art!.bottom, "the title overlaps the art's row").toBeGreaterThan(title.top);
				expect(art!.top, "the title overlaps the art's row").toBeLessThan(title.bottom);

				// All of it inside the card: no floor pushing it past a fixed height.
				expect(art!.top, "inside the card").toBeGreaterThanOrEqual(card.top);
				expect(art!.left, "inside the card").toBeGreaterThanOrEqual(card.left);
				expect(art!.bottom, "above the ruler").toBeLessThanOrEqual(progress.top);
				expect(progress.bottom, "the ruler is in the card").toBeLessThanOrEqual(card.bottom);
			});
		}

		test("the skeleton holds the loaded card's boxes", async ({ page, context }) => {
			await open(page, null);
			const skeleton = await measure(page);

			const loadedPage = await context.newPage();
			await open(loadedPage, track);
			const loaded = await measure(loadedPage);

			for (const part of ["art", "progress"] as const) {
				const a = skeleton[part]!;
				const b = loaded[part]!;
				expect(Math.abs(a.left - b.left), `${part} left`).toBeLessThanOrEqual(1);
				expect(Math.abs(a.width - b.width), `${part} width`).toBeLessThanOrEqual(1);
				expect(Math.abs(a.height - b.height), `${part} height`).toBeLessThanOrEqual(1);
				// From the card's bottom: the two pages can be scrolled differently.
				expect(Math.abs(skeleton.card.bottom - a.bottom - (loaded.card.bottom - b.bottom)), `${part} bottom`).toBeLessThanOrEqual(1);
			}
		});

		test("a long title stays inside the card", async ({ page }) => {
			await open(page, {
				track: "The Still Sea And Everything That Came After It (Remastered 2011)",
				artists: "A Very Long Artist Name, Another Very Long Artist Name",
			});
			const { player, art, text } = await measure(page);

			expect(art!.width, "art width").toBeGreaterThanOrEqual(MIN_ART);
			expect(text.left, "the text starts after the art").toBeGreaterThanOrEqual(art!.right);
			expect(text.right, "the text ends at the player's edge").toBeLessThanOrEqual(player.right + 0.5);
		});

		test("no artwork: the text takes the row", async ({ page }) => {
			await open(page, { cover: "", covers: [] });
			const { player, art, text, progress } = await measure(page);

			expect(art, "no art element").toBeNull();
			expect(text.left, "the text starts at the edge").toBeLessThanOrEqual(player.left + 0.5);
			expect(text.right, "the text ends at the player's edge").toBeLessThanOrEqual(player.right + 0.5);
			expect(text.bottom, "the text sits above the ruler").toBeLessThanOrEqual(progress.top);
		});
	});
}

test.describe("now playing's card where the cover fits", () => {
	test.use({ viewport: TABLET });

	test("the art is the cover over the title", async ({ page }) => {
		await open(page, track);
		const { art, title } = await measure(page);

		expect(art!.height, "a cover, not a tile").toBeGreaterThanOrEqual(96);
		expect(art!.bottom, "over the title").toBeLessThanOrEqual(title.top);
	});
});
