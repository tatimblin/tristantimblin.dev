import { lockupReady, type Page } from "./test";

/**
 * The homepage opener's shared helpers. Selectors are plain strings: inside
 * page.evaluate() they have to be passed in as an argument, since the callback
 * runs in the page and can't see this module.
 */

export const LOCKUP = {
	root: "stories-heading",
	wordmark: ".sh__wordmark",
	outline: ".sh__outline",
	solid: ".sh__solid",
	tagline: ".sh__tagline",
	amp: ".sh__amp",
	sub: ".sh__sub",
	/** The page-authored intro, the last thing in the sub. */
	intro: ".sh__sub > :last-child",
} as const;

export const VIDEOS = {
	card: ".wx-videos",
	grid: ".wx-videos dotted-grid",
	wide: ".wx-videos__wide",
	compact: ".wx-videos__compact",
} as const;

/** The 16:9 clip above "tristan", on phones and tablets only. */
export const HOME_CLIP = ".home__clip";

/** Load the homepage, at a size if given, and wait for the lockup's final face. */
export async function openHome(page: Page, width?: number, height?: number): Promise<void> {
	if (width !== undefined && height !== undefined) await page.setViewportSize({ width, height });
	await page.goto("/");
	await lockupReady(page);
}

/**
 * Scroll to an absolute offset and let the page catch up: 250ms by default,
 * which also covers script reacting to the scroll and Firefox's timelines, or
 * "frames" for two animation frames where only Chromium's timelines are read.
 */
export async function scrollAndSettle(page: Page, y: number, how: "wait" | "frames" = "wait"): Promise<void> {
	await page.evaluate((v) => window.scrollTo(0, v), y);
	if (how === "wait") {
		await page.waitForTimeout(250);
		return;
	}
	await page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
	);
}

/** A custom property holding a length, resolved in px against the videos card. */
export function cardLength(page: Page, name: string): Promise<number> {
	return page.evaluate(
		([card, prop]) => {
			const probe = document.createElement("div");
			probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:var(${prop})`;
			document.querySelector(card)!.appendChild(probe);
			const h = probe.getBoundingClientRect().height;
			probe.remove();
			return h;
		},
		[VIDEOS.card, name] as const,
	);
}

/** The stylesheet's --vc-dock-travel, in px. */
export const dockTravel = (page: Page): Promise<number> => cardLength(page, "--vc-dock-travel");

/** How far the card is lifted off its cell, in px (0 once docked). */
export const dockLift = (page: Page): Promise<number> =>
	page.evaluate((card) => new DOMMatrix(getComputedStyle(document.querySelector(card)!).transform).m42, VIDEOS.card);
