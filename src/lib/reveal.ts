/**
 * The asset-arrival reveal coordinator.
 *
 * THE PROBLEM. Content that carries an asset — a post image, a gallery thumb —
 * snaps in at full strength the instant that asset decodes, in whatever order the
 * network finishes. Nothing on this site had a mount-time entrance, so the page
 * assembled visibly rather than arriving.
 *
 * WHAT THIS DOES. Holds marked elements invisible, then eases them in once their
 * asset is decoded AND they are scrolled into view. This is a coordinator, not an
 * animation library: the motion is two declarations in src/styles/reveal.css and
 * the durations are DS tokens. What lives here is only the decision of WHEN.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH — read before extending:
 *
 *  1. THE HERO. Never mark anything inside `.fh`. The homepage's Largest
 *     Contentful Paint element is the SVG wordmark text (measured: ~323k px² at
 *     156ms), so holding the hero back to wait for `document.fonts.ready` would
 *     trade a one-frame reflow for hundreds of ms of *measured* LCP — paying a
 *     real metric to hide a cosmetic one. The lockup's font-swap jump is fixed at
 *     its source instead (self-hosted/preloaded faces), and each custom element
 *     fades the layer it generates from inside its own package.
 *
 *  2. ANY PROPERTY BUT `opacity`. The hero's layout is load-bearing CSS
 *     arithmetic (--hero-lead / --hero-height in FullHeroLayout.astro) and
 *     `stories-heading`'s fitFold() measures `.sh__sub` — which is
 *     `position: fixed` on desktop — in VIEWPORT-ABSOLUTE coordinates. Any
 *     ancestor with `transform`, `translate`, `filter`, `backdrop-filter`,
 *     `contain: paint` or `content-visibility` becomes the containing block for
 *     that fixed element and silently corrupts the fold. Measured on this page:
 *     `opacity` on an ancestor leaves `.sh__sub` at its viewport anchor, while
 *     `filter: blur(0px)` moves it 490px — right out of a 900px viewport. Opacity
 *     is the one visual verb that is neither a containing block for fixed
 *     descendants nor an input to getBoundingClientRect / getBBox /
 *     ResizeObserver. Use it and nothing else.
 *
 *  3. `pointer-events`. The hero relies on a five-level `none → auto`
 *     fall-through chain so its invisible full-width boxes don't swallow the date
 *     scrubber's drags (asserted in tests/hero-fold.spec.ts). Writing `auto`
 *     anywhere in that chain breaks reachability.
 *
 *  4. `.sh__sub`'s opacity. It already animates opacity + visibility on a
 *     scroll-timeline with `animation-fill-mode: both`, so at scroll 0 the
 *     animation's before-phase forces `opacity: 1` from the animation origin —
 *     which outranks any transition or declaration here. A reveal on that element
 *     would appear to do nothing at all.
 *
 * FAILING VISIBLE. Hiding content from JS is only safe if every failure path ends
 * with it shown. The hidden rule requires BOTH `html.reveal-armed` (added by a
 * dependency-free inline script in the document head, which also schedules its own
 * removal) AND the absence of the revealed state. So removing the class or setting
 * the state each independently reveals, and neither depends on this module loading:
 * no JS → never armed → visible. Bundle 404s or throws → the inline backstop
 * disarms → visible. An asset hangs → the per-group deadline fires → visible.
 *
 * Lifecycle follows the Videos.astro idiom (module singleton + `astro:page-load`
 * bind + `astro:before-swap` teardown) rather than a `data-` marker, because this
 * owns cross-element state and must genuinely rebuild per navigation.
 */

/** Cap on how long a group waits for its assets before revealing anyway. Assets
 *  here are below the fold and already decoded by the time they're scrolled to,
 *  so this is a backstop for the pathological case, not the common path. */
const DEADLINE_MS = 600;

/** Fire slightly before the element scrolls in, so it is already settling as it
 *  enters rather than starting once fully on screen. */
const IN_VIEW_MARGIN = "0px 0px -10% 0px";
const IN_VIEW_THRESHOLD = 0.2;

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
		// decode() is the honest signal — paintable, not merely downloaded — but it
		// REJECTS on a decode failure and for some cross-origin cases, so both arms
		// resolve. An unhandled rejection here would surface as a console error on
		// every affected page.
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

/** Settle `promise`, but never later than `ms`. "Reveal on ready OR deadline" is
 *  the whole safety property: a source that never settles must not translate into
 *  permanently hidden content. */
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

		// Not armed (no JS at parse time, reduced motion, Save-Data, or the backstop
		// already fired) — then nothing is hidden and there is nothing to schedule.
		// Reveal everything defensively and stop, so a stale attribute can never
		// leave content invisible.
		if (!document.documentElement.classList.contains(ARMED_CLASS)) {
			for (const el of targets) el.dataset.revealState = "in";
			return;
		}

		if (!targets.length) {
			this.disarm();
			return;
		}

		// Mark every target explicitly as pending. The hidden CSS rule is written as
		// :not([data-reveal-state="in"]), so it already matches an unmarked element and
		// the reveal LOOKS right without this — but then "pending" exists only in the
		// documentation, and nothing (a test, a devtools inspection, a future consumer
		// keying off the state) can distinguish "held deliberately" from "the
		// coordinator never saw this element".
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
		// Wait for the group to be reachable before spending its deadline: a group
		// far down the page would otherwise burn its budget while off screen and be
		// revealed by the time it is scrolled to.
		await Promise.all(members.map((el) => this.whenInView(el)));
		if (this.destroyed) return;

		await withDeadline(
			Promise.all(members.flatMap((el) => assetsOf(el))),
			DEADLINE_MS
		);
		if (this.destroyed) return;

		// Stagger via transition-delay rather than a setTimeout chain: the delay is
		// declarative, inspectable in devtools, and cannot outlive a teardown.
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

	/**
	 * One-shot IntersectionObserver: resolve on first intersection, then unobserve.
	 *
	 * Only the OBSERVER SHAPE is shared with the widgets' own reveals — this module
	 * owns its lifecycle separately (initReveal is bound to astro:page-load below,
	 * which is what makes it survive a ClientRouter swap).
	 */
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
				{ rootMargin: IN_VIEW_MARGIN, threshold: IN_VIEW_THRESHOLD }
			);
			io.observe(el);
			this.observers.push(io);
		});
	}

	/** Drop the armed class once nothing is left pending, so the mechanism goes
	 *  inert and no later DOM change can be caught by the hidden rule. */
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
		// A swap mid-flight must not strand anything hidden: reveal every member
		// outright, then disarm.
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
	// ClientRouter fires `astro:page-load` for the FIRST load as well, so the
	// singleton guard above is what stops a second coordinator binding over the
	// same targets (the double-wiring bug documented in src/pages/index.astro).
	document.addEventListener("astro:page-load", initReveal);
	document.addEventListener("astro:before-swap", teardownReveal);
}
