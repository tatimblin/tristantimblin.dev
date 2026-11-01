/**
 * THE HOMEPAGE'S PERFORMANCE BUDGETS, in one place.
 *
 * Every number the perf project (tests/perf/*.spec.ts) holds the page to. They
 * are COUNTS and STRUCTURE (how many contexts, requests, chunks, nodes, frame
 * callbacks, layouts), never wall-clock milliseconds, so they hold the same on
 * a laptop GPU and on CI's software renderer (SwiftShader). The one timing
 * budget, the long task during a scroll, measures script time only (see
 * scroll.spec.ts for why that is stable).
 *
 * TO CHANGE ONE: change it here, in the same commit as the change that needs
 * it, and say why in the commit. A budget is raised deliberately or not at all
 * — never to make a red build green. Run `PERF_LOG=1 bun run test --project=perf`
 * to print every observed value next to its budget (theme/design-system/src/
 * lib/WIDGETS.md, "Performance budgets").
 */

/** Cumulative layout shift over a load and a scroll through every card. */
export const CLS = 0.01;

/** WebGL contexts once the page has loaded (the halftones). Desktop: the hero
 *  fabric and the videos card. Phone: the hero carousel only (the videos card
 *  is hidden there, and <Deferred> never builds the desktop scene). */
export const WEBGL = { desktop: 2, mobile: 1 };

/** Videos fetched from the media bucket in the load window (ENGINE_WINDOW_MS,
 *  below), before any scroll: each halftone's clip, plus one <link rel=prefetch> for
 *  the carousel's next clip (its crossfade needs it decoded on time). Desktop:
 *  the fabric, the videos card's first clip and its next. Phone: the hero
 *  carousel's first clip and its next. */
export const MEDIA_REQUESTS = { desktop: 3, mobile: 2 };

/** Script files fetched in the load window, before the first scroll, and
 *  which widget chunks may be among them: `eager` (videos), `idle` (now playing) and `near` cards within a
 *  screen of the first viewport. Every other card's chunk waits for the scroll.
 *  `files` is exact today: the page's 12 shared scripts, those widgets'
 *  chunks, and the shared chunks they import (Volo's faces and keys). */
export const JS_BEFORE_SCROLL = {
	desktop: { files: 17, widgets: ["now-playing", "videos", "volo"] },
	mobile: { files: 15, widgets: ["bike-stats", "now-playing", "videos"] },
};

/** DOM elements once every card has mounted (light DOM; a shadow root's are
 *  the element's own): the page, and each card. Two grow with the data, not
 *  the code — Volo by a few nodes a game, the A-List by one tick a film — and
 *  carry the headroom for a year of it. */
export const DOM = {
	total: 2600,
	widget: {
		videos: 64,
		"now-playing": 12,
		volo: 1450,
		"bike-stats": 90,
		cursive: 30,
		github: 450,
		readers: 160,
		amc: 260,
	} as Record<string, number>,
};

/** Each widget chunk's size, gzipped, in bytes (dist/_astro/widget-<name>.*.js),
 *  ~15% over what it is. */
export const WIDGET_GZIP = {
	amc: 7500,
	"bike-stats": 1600,
	cursive: 1300,
	github: 300,
	"now-playing": 7100,
	readers: 1300,
	videos: 1000,
	volo: 1200,
} as Record<string, number>;
/** A new widget's chunk, until it is given its own line above. */
export const WIDGET_GZIP_DEFAULT = 4000;

/** CDP LayoutCount / RecalcStyleCount: 1.5x the most seen across runs.
 *  `load`: navigation to ENGINE_WINDOW_MS. `scroll`: one scripted pass (30
 *  wheel ticks on desktop, 4 touch flings on a phone, then 800ms). */
export const ENGINE_WINDOW_MS = 6000;
export const ENGINE = {
	// Most seen (2026-10-31, 12 runs): load 70/141 desktop, 73/172 phone;
	// scroll 28/292 desktop, 22/185 phone.
	load: { desktop: { layouts: 105, styles: 212 }, mobile: { layouts: 110, styles: 258 } },
	scroll: { desktop: { layouts: 42, styles: 438 }, mobile: { layouts: 33, styles: 278 } },
};

/** Longest script time inside one animation frame during the wheel pass (ms). */
export const SCROLL_SCRIPT_MS = 50;

/**
 * Non-passive (scroll-blocking) wheel/touch listeners allowed besides Lenis's
 * own (which are found by identity, from window.__lenis). Each is matched on
 * the target's description and the event type, with the reason it must block.
 */
export const BLOCKING_LISTENERS: Array<{ target: RegExp; type: string; why: string }> = [
	{
		target: /^div\.wx-amc-fan\b/,
		type: "wheel",
		why:
			"The A-List fan scrubs on a HORIZONTAL wheel and must preventDefault it (or a trackpad swipe " +
			"navigates back). Scoped to the fan's own box, and vertical wheels return at once; " +
			"src/widgets/amc/fan.ts.",
	},
];
