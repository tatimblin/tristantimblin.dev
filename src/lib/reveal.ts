/**
 * The asset-arrival reveal coordinator: holds `[data-reveal]` elements invisible
 * and eases them in once their asset has decoded AND they are scrolled into
 * view. The motion itself is CSS (src/styles/reveal.css, DS tokens); this
 * decides only WHEN.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH:
 *
 *  1. THE LOCKUP. Never mark anything inside `stories-heading`: the homepage's LCP
 *     element is the wordmark, so holding it back for `document.fonts.ready` trades a
 *     one-frame reflow for hundreds of ms of measured LCP. Each custom element
 *     fades its own generated layer from inside its package.
 *
 *  2. ANY PROPERTY BUT `opacity` AND `translate`. Both animate on the compositor, so
 *     a reveal costs the page no layout; tools/lint/composited.test.ts fails a
 *     transition on a geometry property.
 *
 *  3. `pointer-events`. The lockup's full-width box falls through to the parked
 *     videos card beneath it (HomeLayout.astro); an `auto` anywhere in that chain
 *     breaks reachability.
 *
 *  4. `.sh__sub`'s opacity. Its scroll-timeline animation with `fill-mode: both`
 *     forces `opacity: 1` at scroll 0 from the animation origin, which outranks
 *     anything set here.
 *
 * FAILING VISIBLE. The hidden rule requires BOTH `html.reveal-armed` (added by an
 * inline head script that also schedules its own removal) AND the absence of the
 * revealed state, so every failure path ends shown: no JS → never armed; bundle
 * 404s → the inline backstop disarms; an asset hangs → the deadline fires.
 * A widget card alone outlasts that backstop: once this coordinator has marked it
 * "pending" (which only a running coordinator can), it is held until it is reached
 * however late that is, so a card scrolled to after 3s still has its entrance.
 */

import { arrivals, type Arrival } from "@whois/design-system/lib/activity";
import { whenMounted } from "@whois/design-system/lib/widgets";

/** Cap on how long a reveal waits for its assets before revealing anyway. */
const DEADLINE_MS = 600;

const IN_VIEW_MARGIN = "0px 0px -10% 0px";
const IN_VIEW_THRESHOLD = 0.2;

/** `data-reveal="eager"`: fire before the element reaches the viewport, for one
 *  whose own entrance is scroll-driven (the videos card, parked in the opener,
 *  drops into its cell) and would otherwise play out behind an opacity of 0. */
const EAGER_MARGIN = "0px 0px 20% 0px";
const EAGER_THRESHOLD = 0;

/** `data-reveal="row"`: a card in a widget grid (Widget.astro marks them). It
 *  comes in when its TOP crosses the in-view line, whatever its height, so the
 *  cards of one row arrive in one observer callback and stagger across it. */
const ROW_THRESHOLD = 0;

/** The most steps of --reveal-stagger one arrival may spread over: a jump that
 *  brings a screenful in at once closes up its pitch, so the last card still
 *  starts soon and no two start together. */
const MAX_STAGGER_STEPS = 3;

const ARMED_CLASS = "reveal-armed";

/** Mirrors the inline head script's guard, so a re-run can't double-arm. */
declare global {
	interface Window {
		__revealArmed?: boolean;
	}
}

/** Resolve when an image is decoded — or has definitively failed. A 404 must read
 *  as "ready" (show the alt text) rather than "wait forever". */
function imageReady(img: HTMLImageElement): Promise<void> {
	if (img.complete && img.naturalWidth > 0) return Promise.resolve();
	return new Promise<void>((resolve) => {
		// decode() rejects on failure and for some cross-origin cases; both arms
		// resolve.
		if (typeof img.decode === "function") {
			img.decode().then(
				() => resolve(),
				() => resolve()
			);
			return;
		}
		const done = () => resolve();
		img.addEventListener("load", done, { once: true });
		img.addEventListener("error", done, { once: true });
	});
}

/** Resolve when a video has a frame, or has failed. */
function videoReady(video: HTMLVideoElement): Promise<void> {
	if (video.readyState >= 2) return Promise.resolve();
	return new Promise<void>((resolve) => {
		const done = () => resolve();
		video.addEventListener("loadeddata", done, { once: true });
		video.addEventListener("error", done, { once: true });
	});
}

/** Every asset carried by (or inside) a target. */
function assetsOf(el: HTMLElement): Promise<void>[] {
	const media: Promise<void>[] = [];
	const imgs =
		el instanceof HTMLImageElement ? [el] : Array.from(el.querySelectorAll("img"));
	for (const img of imgs) media.push(imageReady(img));
	const videos =
		el instanceof HTMLVideoElement ? [el] : Array.from(el.querySelectorAll("video"));
	// preload="none" videos never load until played; a poster is what actually
	// paints, so don't block on them.
	for (const v of videos) {
		if (v.preload !== "none") media.push(videoReady(v));
	}
	return media;
}

/** Settle `promise`, but never later than `ms`. */
function withDeadline(promise: Promise<unknown>, ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		const timer = window.setTimeout(finish, ms);
		promise.then(
			() => {
				window.clearTimeout(timer);
				finish();
			},
			() => {
				window.clearTimeout(timer);
				finish();
			}
		);
	});
}

class RevealCoordinator {
	/** Drops every wait on the shared observers (activity.ts) at teardown. */
	private watching = new AbortController();
	private timers: number[] = [];
	private destroyed = false;

	constructor() {
		const targets = Array.from(
			document.querySelectorAll<HTMLElement>("[data-reveal]")
		);

		// Not armed (reduced motion, Save-Data, or the backstop already fired):
		// nothing is hidden, so mark everything revealed and stop.
		if (!document.documentElement.classList.contains(ARMED_CLASS)) {
			for (const el of targets) el.dataset.revealState = "in";
			return;
		}

		if (!targets.length) {
			this.disarm();
			return;
		}

		// Explicitly pending, so "held deliberately" is distinguishable from "the
		// coordinator never saw this element" (the hidden rule matches both).
		for (const el of targets) {
			if (el.dataset.revealState !== "in") el.dataset.revealState = "pending";
		}

		const rows = targets.filter((el) => el.dataset.reveal === "row");
		if (rows.length) this.watchRows(rows);
		for (const el of targets) {
			if (el.dataset.reveal !== "row") this.runSolo(el);
		}
	}

	private async runSolo(el: HTMLElement) {
		// In view first, then the deadline: an element far down the page would
		// otherwise burn its budget off screen and arrive already revealed.
		await this.whenInView(el);
		if (this.destroyed) return;
		await this.whenReady([el]);
		if (this.destroyed) return;
		el.dataset.revealState = "in";
		this.scheduleDisarm();
	}

	/**
	 * The cards of a widget grid: each comes in as it reaches the view, and the
	 * ones that reach it in the same observer callback (a row, or everything a jump
	 * lands on) stagger top to bottom, left to right. Measured, not authored: the
	 * grid's dense packing puts them somewhere other than DOM order, differently per
	 * column count. On the widget runtime's own observers (activity.ts): the mount is
	 * its subscription a screen ahead, this is another at the in-view line.
	 */
	private watchRows(cards: HTMLElement[]) {
		const watch = arrivals(
			cards,
			(arrived) => {
				const landed = new Set(arrived.map((a) => a.el));
				// A jump can carry a card clean past the view with no report of its
				// own: shown at once, so it is there when the visitor scrolls back.
				for (const el of cards) {
					if (el.dataset.revealState === "in" || landed.has(el)) continue;
					if (el.getBoundingClientRect().bottom < 0) {
						watch.release(el);
						el.dataset.revealState = "in";
					}
				}
				if (arrived.length) void this.revealArrival(arrived);
				else this.scheduleDisarm();
			},
			{ margin: IN_VIEW_MARGIN, threshold: ROW_THRESHOLD, signal: this.watching.signal }
		);
	}

	private async revealArrival(arrived: Arrival[]) {
		// Sorted on the observer's own rects, so nothing here forces a layout. Rounded,
		// because the cards of a row sit on the same fractional pixel only nearly.
		const ordered = [...arrived]
			.sort(
				(a, b) => Math.round(a.rect.top) - Math.round(b.rect.top) || a.rect.left - b.rect.left
			)
			.map((a) => a.el as HTMLElement);

		await this.whenReady(ordered);
		if (this.destroyed) return;

		// Stagger via transition-delay rather than timers: it cannot outlive a teardown.
		const pitch = Math.min(1, MAX_STAGGER_STEPS / Math.max(1, ordered.length - 1));
		for (const [i, el] of ordered.entries()) {
			if (i > 0) el.style.transitionDelay = `calc(var(--reveal-stagger) * ${(i * pitch).toFixed(3)})`;
			el.dataset.revealState = "in";
		}
		this.scheduleDisarm();
	}

	/** A widget card also waits for its script's mount (the widget runtime loads
	 *  it as the card nears), so it never fades in half-built: a fan of posters with
	 *  no posters, a ring with no ticks. Under the deadline. */
	private whenReady(els: HTMLElement[]): Promise<void> {
		return withDeadline(
			Promise.all(els.flatMap((el) => [...assetsOf(el), whenMounted(el)])),
			DEADLINE_MS
		);
	}

	/** Resolve on first intersection; on the shared observers, one per margin and
	 *  threshold however many elements are waiting. */
	private whenInView(el: HTMLElement): Promise<void> {
		const eager = el.dataset.reveal === "eager";
		return new Promise<void>((resolve) => {
			arrivals(
				[el],
				(arrived) => {
					if (arrived.length) resolve();
				},
				{
					margin: eager ? EAGER_MARGIN : IN_VIEW_MARGIN,
					threshold: eager ? EAGER_THRESHOLD : IN_VIEW_THRESHOLD,
					signal: this.watching.signal,
				}
			);
		});
	}

	/** Disarm once nothing is left pending, so no later DOM change can be caught by
	 *  the hidden rule. */
	private scheduleDisarm() {
		const timer = window.setTimeout(() => {
			if (this.destroyed) return;
			const pending = document.querySelector(
				'[data-reveal]:not([data-reveal-state="in"])'
			);
			if (!pending) this.disarm();
		}, 0);
		this.timers.push(timer);
	}

	private disarm() {
		document.documentElement.classList.remove(ARMED_CLASS);
	}

	destroy() {
		this.destroyed = true;
		this.watching.abort();
		for (const t of this.timers) window.clearTimeout(t);
		this.timers = [];
		// A swap mid-flight must not strand anything hidden.
		for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
			el.dataset.revealState = "in";
		}
		this.disarm();
	}
}

let instance: RevealCoordinator | null = null;

export function initReveal(): void {
	if (instance) return;
	instance = new RevealCoordinator();
}

export function teardownReveal(): void {
	instance?.destroy();
	instance = null;
}

if (typeof document !== "undefined") {
	initReveal();
	// ClientRouter fires `astro:page-load` for the first load too; the singleton
	// guard stops a second coordinator binding over the same targets.
	document.addEventListener("astro:page-load", initReveal);
	document.addEventListener("astro:before-swap", teardownReveal);
}
