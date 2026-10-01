/**
 * The asset-arrival reveal coordinator: holds `[data-reveal]` elements invisible
 * and eases them in once their asset has decoded AND they are scrolled into
 * view. The motion itself is CSS (src/styles/reveal.css, DS tokens); this
 * decides only WHEN.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH:
 *
 *  1. THE HERO. Never mark anything inside `.fh`: the homepage's LCP element is
 *     the wordmark, so holding it back for `document.fonts.ready` trades a
 *     one-frame reflow for hundreds of ms of measured LCP. Each custom element
 *     fades its own generated layer from inside its package.
 *
 *  2. ANY PROPERTY BUT `opacity`. stories-heading's fitFold() measures `.sh__sub`
 *     (`position: fixed` on desktop) in viewport coordinates, so any ancestor with
 *     `transform`, `translate`, `filter`, `backdrop-filter`, `contain: paint` or
 *     `content-visibility` becomes its containing block and silently corrupts the
 *     fold (measured: `filter: blur(0px)` moved it 490px). Opacity is neither a
 *     containing block nor an input to any measurement.
 *
 *  3. `pointer-events`. The hero's full-width boxes fall through to the date
 *     scrubber beneath them (tests/hero-fold.spec.ts); an `auto` anywhere in that
 *     chain breaks reachability.
 *
 *  4. `.sh__sub`'s opacity. Its scroll-timeline animation with `fill-mode: both`
 *     forces `opacity: 1` at scroll 0 from the animation origin, which outranks
 *     anything set here.
 *
 * FAILING VISIBLE. The hidden rule requires BOTH `html.reveal-armed` (added by an
 * inline head script that also schedules its own removal) AND the absence of the
 * revealed state, so every failure path ends shown: no JS → never armed; bundle
 * 404s → the inline backstop disarms; an asset hangs → the group deadline fires.
 */

/** Cap on how long a group waits for its assets before revealing anyway. */
const DEADLINE_MS = 600;

const IN_VIEW_MARGIN = "0px 0px -10% 0px";
const IN_VIEW_THRESHOLD = 0.2;

/** `data-reveal-eager`: fire before the element reaches the viewport, for one
 *  whose own entrance is scroll-driven (the videos carousel parallaxes ~90vh as
 *  it docks) and would otherwise play out behind an opacity of 0. */
const EAGER_MARGIN = "0px 0px 20% 0px";
const EAGER_THRESHOLD = 0;

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
	private observers: IntersectionObserver[] = [];
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

		for (const [, members] of this.groupBy(targets)) this.runGroup(members);
	}

	/** Bucket by `data-reveal-group`; ungrouped elements each form their own group
	 *  so they reveal independently. */
	private groupBy(targets: HTMLElement[]): Map<string, HTMLElement[]> {
		const groups = new Map<string, HTMLElement[]>();
		for (const [i, el] of targets.entries()) {
			const name = el.dataset.revealGroup || `__solo-${i}`;
			const list = groups.get(name) ?? [];
			list.push(el);
			groups.set(name, list);
		}
		return groups;
	}

	private async runGroup(members: HTMLElement[]) {
		// In view first, then the deadline: a group far down the page would otherwise
		// burn its budget off screen and arrive already revealed.
		await Promise.all(members.map((el) => this.whenInView(el)));
		if (this.destroyed) return;

		await withDeadline(
			Promise.all(members.flatMap((el) => assetsOf(el))),
			DEADLINE_MS
		);
		if (this.destroyed) return;

		// Stagger via transition-delay rather than timers: it cannot outlive a teardown.
		const ordered = [...members].sort(
			(a, b) => this.orderOf(a, members) - this.orderOf(b, members)
		);
		for (const [i, el] of ordered.entries()) {
			if (i > 0) el.style.transitionDelay = `calc(var(--reveal-stagger) * ${i})`;
			el.dataset.revealState = "in";
		}

		this.scheduleDisarm();
	}

	private orderOf(el: HTMLElement, members: HTMLElement[]): number {
		const raw = Number(el.dataset.revealOrder);
		return Number.isFinite(raw) ? raw : members.indexOf(el);
	}

	/** Resolve on first intersection, then unobserve. */
	private whenInView(el: HTMLElement): Promise<void> {
		return new Promise<void>((resolve) => {
			const io = new IntersectionObserver(
				(entries, observer) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						observer.unobserve(entry.target);
						resolve();
					}
				},
				el.dataset.revealEager !== undefined
					? { rootMargin: EAGER_MARGIN, threshold: EAGER_THRESHOLD }
					: { rootMargin: IN_VIEW_MARGIN, threshold: IN_VIEW_THRESHOLD }
			);
			io.observe(el);
			this.observers.push(io);
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
		for (const io of this.observers) io.disconnect();
		this.observers = [];
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
