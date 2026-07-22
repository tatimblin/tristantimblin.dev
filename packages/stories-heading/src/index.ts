/** Clamp `x` to [0, 1]. */
function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * `<stories-heading>` — the "& other stories" lockup as a sticky heading.
 *
 * "&" and "other stories" share a baseline; the "&" is far larger, so its top
 * overlaps "tristan" while "other stories" stays clear below the wordmark. The
 * whole lockup pins (position: sticky) and stays FIXED for --sh-reveal +
 * --sh-hold of scroll — during --sh-reveal the outline→solid font-swap wipes in
 * (--sh-clip 1→0); through --sh-hold it simply holds — then the paragraph rising
 * from below reaches it and pushes it away.
 *
 * Light-DOM contract (authored by the Astro wrapper):
 *   [data-sh-track] — reserves the pin scroll distance in normal flow.
 *   [data-sh-pin]   — position:sticky element holding the lockup while pinned.
 *   .sh__amp        — the big ampersand.
 *   .sh__heading    — "other stories".
 *   .sh__solid      — the solid-face layers (in "&" + heading); clipped in.
 *
 * The host exposes one custom property read by the stylesheet:
 *   --sh-clip  fraction 1→0 of each solid layer hidden from the top (the wipe).
 *
 * Lifecycle mirrors the sibling packages (sticky-heading / video-carousel): a
 * `listeners` cleanup array, a `rafId` guard, a `ResizeObserver`, reduced-motion
 * handling, and full teardown (Layout uses ClientRouter view transitions).
 */
export class StoriesHeadingElement extends HTMLElement {
	private track: HTMLElement | null = null;
	private pin: HTMLElement | null = null;
	private amp: HTMLElement | null = null;
	private heading: HTMLElement | null = null;

	private resizeObserver: ResizeObserver | null = null;
	private reducedMotion: MediaQueryList | null = null;
	private listeners: Array<() => void> = [];
	private rafId: number | null = null;

	/** Distance (px) to slide the "&" down to go from baseline- to top-aligned
	    with "other stories". Set by --sh-amp-size vs --sh-heading-size, measured. */
	private travelPx = 0;

	connectedCallback() {
		this.track = this.querySelector<HTMLElement>("[data-sh-track]");
		this.pin = this.querySelector<HTMLElement>("[data-sh-pin]");
		this.amp = this.querySelector<HTMLElement>(".sh__amp");
		this.heading = this.querySelector<HTMLElement>(".sh__heading");

		this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onMotionChange = () => this.update();
		this.reducedMotion.addEventListener("change", onMotionChange);
		this.listeners.push(() =>
			this.reducedMotion?.removeEventListener("change", onMotionChange)
		);

		const onScroll = () => this.schedule();
		window.addEventListener("scroll", onScroll, { passive: true });
		this.listeners.push(() => window.removeEventListener("scroll", onScroll));

		// A viewport resize rescales the wordmark (a vw clamp) and moves its
		// baseline, so re-anchor. Also covers the stacked-layout breakpoint.
		const onResize = () => {
			this.measure();
			this.schedule();
		};
		window.addEventListener("resize", onResize, { passive: true });
		this.listeners.push(() => window.removeEventListener("resize", onResize));

		// A resize changes both the ampersand travel and the pinned distance.
		this.resizeObserver = new ResizeObserver(() => {
			this.measure();
			this.schedule();
		});
		this.resizeObserver.observe(this);
		if (this.amp) this.resizeObserver.observe(this.amp);

		// Anchor after fonts load — the wordmark's measured height (hence its
		// baseline) shifts once the web font swaps in.
		this.measure();
		this.update();
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => {
				this.measure();
				this.schedule();
			});
		}
	}

	/**
	 * The lockup pins with plain CSS `position: sticky` at a viewport-relative
	 * line (--sh-top, a vh value) — so the stick point never depends on the hero
	 * video's height. Measured here: the pin's own rendered height, published as
	 * --sh-pin-height so the track can reserve the reveal + hold distance ON TOP
	 * of it (the pin stays stuck for trackHeight − pinHeight); and the "&"'s top
	 * gap over "other stories" (--travelPx), the exact slide to top-align them.
	 * Skipped in the stacked layout, where nothing pins.
	 */
	private measure() {
		if (!this.pin) return;

		const stacked = window.matchMedia("(max-width: 900px)").matches;
		if (stacked) {
			this.style.removeProperty("--sh-pin-height");
			this.travelPx = 0;
			this.style.removeProperty("--sh-amp-shift");
			this.style.removeProperty("--sh-amp-travel");
			return;
		}

		// Measure the natural top-gap with the "&" untransformed: zero the shift,
		// then read both boxes (reading a rect flushes layout). The taller "&"
		// box starts higher, so headingTop − ampTop is how far to drop it to
		// top-align. Scales with the font-size difference automatically. Publish
		// it as --sh-amp-travel so the pin reserves that descent as bottom
		// padding — done BEFORE reading pin height below so it's counted in.
		if (this.amp && this.heading) {
			this.style.setProperty("--sh-amp-shift", "0px");
			const ampTop = this.amp.getBoundingClientRect().top;
			const headingTop = this.heading.getBoundingClientRect().top;
			this.travelPx = Math.max(0, headingTop - ampTop);
			this.style.setProperty("--sh-amp-travel", `${this.travelPx.toFixed(1)}px`);
		}

		this.style.setProperty(
			"--sh-pin-height",
			`${this.pin.offsetHeight.toFixed(1)}px`
		);
	}

	disconnectedCallback() {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.listeners.forEach((off) => off());
		this.listeners = [];
	}

	/** Coalesce scroll-driven updates to one write per frame. */
	private schedule() {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.update();
		});
	}

	private update() {
		// Reduced motion: skip the wipe and land the "&" at its top-aligned rest.
		if (this.reducedMotion?.matches) {
			this.style.setProperty("--sh-clip", "0");
			this.style.setProperty("--sh-amp-shift", `${this.travelPx.toFixed(2)}px`);
			return;
		}

		// The outline→solid wipe runs linearly over --sh-reveal of pinned scroll.
		const revealed = this.progress();
		this.style.setProperty("--sh-clip", (1 - revealed).toFixed(4));

		// The "&" slides down over the FULL pinned distance so it reaches
		// top-aligned exactly as the pin releases.
		this.style.setProperty(
			"--sh-amp-shift",
			`${(this.travelPx * this.progressFull()).toFixed(2)}px`
		);
	}

	/**
	 * Reveal progress 0→1: 0 the instant the pin sticks (the track's top reaches
	 * the sticky offset --sh-top), 1 after --sh-reveal has been scrolled past
	 * that point. Driven by a fixed scroll distance (not element heights).
	 */
	private progress(): number {
		if (!this.track || !this.pin) return 1;
		const revealPx = this.cssPx("--sh-reveal", 0.6 * window.innerHeight);
		if (revealPx <= 0) return 1;
		const stickyTop = parseFloat(getComputedStyle(this.pin).top) || 0;
		const top = this.track.getBoundingClientRect().top;
		return clamp01((stickyTop - top) / revealPx);
	}

	/**
	 * Progress 0→1 over the FULL pinned distance (--sh-reveal + --sh-hold): 0 the
	 * instant the pin sticks, 1 the instant it releases. Drives the "&" slide so
	 * its speed is set by the whole sticky distance, not just the reveal.
	 */
	private progressFull(): number {
		if (!this.track || !this.pin) return 1;
		const revealPx = this.cssPx("--sh-reveal", 0.6 * window.innerHeight);
		const holdPx = this.cssPx("--sh-hold", 0.6 * window.innerHeight);
		const pinnedPx = revealPx + holdPx;
		if (pinnedPx <= 0) return 1;
		const stickyTop = parseFloat(getComputedStyle(this.pin).top) || 0;
		const top = this.track.getBoundingClientRect().top;
		return clamp01((stickyTop - top) / pinnedPx);
	}

	/** Resolve a CSS length custom property on the host to pixels. */
	private cssPx(prop: string, fallback: number): number {
		const raw = getComputedStyle(this).getPropertyValue(prop).trim();
		if (!raw) return fallback;
		if (raw.endsWith("vh")) return (parseFloat(raw) / 100) * window.innerHeight;
		const n = parseFloat(raw);
		return Number.isFinite(n) ? n : fallback;
	}
}

if (
	typeof customElements !== "undefined" &&
	!customElements.get("stories-heading")
) {
	customElements.define("stories-heading", StoriesHeadingElement);
}
