/** --sh-drift-rate in styles.css (and the 15% stop of its keyframes). */
const DRIFT_RATE = 0.15;

/** Clamp `x` to [0, 1]. */
function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * `<stories-heading>` — the "tristan / & other stories" lockup.
 *
 * NOTHING HERE LAYS IT OUT. The word is sized to its width in CSS, it pins with
 * plain `position: sticky`, and its drift, its wipe and the intro's fade are CSS
 * scroll-progress timelines (see the foot of styles.css), so the first frame is
 * the final one with or without this script. On an engine with scroll timelines
 * this class registers no scroll listener at all; it only announces that the
 * fonts have landed.
 *
 * THE FALLBACK. Firefox has no scroll timelines (measured: 153 reports
 * `CSS.supports("animation-timeline", "scroll()")` false), and the @supports gate
 * that keeps the CSS safe there also means the effects would not exist. So a
 * per-frame driver runs behind that exact feature test, and only there: it
 * publishes --sh-shift on the word (its drift), --sh-clip on the solid layer and --sh-sub-opacity / -visibility on
 * the intro from the same ranges the CSS animates over. It is the slower path by
 * construction — a main-thread handler cannot stay in step with a compositor
 * scroll — which is the point: nobody gets it who doesn't need it. Delete it the
 * day Firefox ships scroll-driven animations.
 *
 * Light-DOM contract (authored by the Astro wrapper):
 *   .sh__solid — the solid layer of the word; clipped in by the wipe.
 *   .sh__sub   — "& other stories" and the intro; faded on scroll.
 */
export class StoriesHeadingElement extends HTMLElement {
	/** True when the browser drives the scroll effects itself, so this class must
	    not. Read once at connect: it cannot change for the life of a document. */
	private cssDrivesScroll = false;
	private wordmark: HTMLElement | null = null;
	private solid: HTMLElement | null = null;
	private sub: HTMLElement | null = null;
	private reducedMotion: MediaQueryList | null = null;
	private rafId: number | null = null;
	private listeners: Array<() => void> = [];
	/** The ranges, resolved to px at layout rate (connect, resize) so a scroll
	    frame never calls getComputedStyle. */
	private pinAt = 0;
	private wipeAt = 0;
	private revealPx = 0;
	private subFade = 0;

	connectedCallback() {
		// Matches the @supports condition in styles.css exactly — if the two ever
		// disagree, one path or the other runs twice or not at all
		// (tests/scroll-fallback.spec.ts pins both halves).
		this.cssDrivesScroll =
			typeof CSS !== "undefined" &&
			typeof CSS.supports === "function" &&
			CSS.supports("animation-timeline", "scroll()");

		if (!this.cssDrivesScroll) {
			this.wordmark = this.querySelector<HTMLElement>(".sh__wordmark");
			this.solid = this.querySelector<HTMLElement>(".sh__solid");
			this.sub = this.querySelector<HTMLElement>(".sh__sub");
			this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
			const onMotionChange = () => this.update();
			this.reducedMotion.addEventListener("change", onMotionChange);
			this.listeners.push(() =>
				this.reducedMotion?.removeEventListener("change", onMotionChange),
			);

			const onScroll = () => this.schedule();
			window.addEventListener("scroll", onScroll, { passive: true });
			this.listeners.push(() => window.removeEventListener("scroll", onScroll));

			// The ranges are lengths of the page's geometry (the word's size, the
			// sticky line), which a resize changes.
			const onResize = () => {
				this.measure();
				this.schedule();
			};
			window.addEventListener("resize", onResize, { passive: true });
			this.listeners.push(() => window.removeEventListener("resize", onResize));

			this.measure();
			this.update();
		}

		// "The lockup has its final face": after the webfonts land. Nothing waits on
		// it to paint; it exists so a consumer (or a test) can sequence against the
		// lockup without re-deriving when fonts arrived.
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => {
				if (this.isConnected) this.announceReady();
			});
		} else {
			this.announceReady();
		}
	}

	disconnectedCallback() {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = null;
		this.listeners.forEach((off) => off());
		this.listeners = [];
		// Never leave a teardown mid-wipe or mid-fade: drop what the fallback
		// published, so a re-connected host starts from the stylesheet's state.
		this.wordmark?.style.removeProperty("--sh-shift");
		this.solid?.style.removeProperty("--sh-clip");
		this.clearSubFade();
		this.wordmark = null;
		this.solid = null;
		this.sub = null;
		delete this.dataset.ready;
	}

	private announceReady() {
		if (this.dataset.ready) return;
		this.dataset.ready = "true";
		this.dispatchEvent(new CustomEvent("stories-heading:ready", { bubbles: true }));
	}

	/** Resolve the ranges the CSS animates over to px. */
	private measure() {
		this.pinAt = this.lengthOf("--sh-pin-at", this);
		this.wipeAt = this.lengthOf("--sh-wipe-at", this);
		this.revealPx = this.lengthOf("--sh-reveal", this);
		this.subFade = this.sub ? this.lengthOf("--sh-sub-fade-px", this.sub) : 0;
	}

	/**
	 * A length custom property, in px, as `el` resolves it. They are calc()s of
	 * other properties, which getComputedStyle hands back unevaluated, so each is
	 * resolved by sizing a throwaway box with it.
	 */
	private lengthOf(prop: string, el: HTMLElement): number {
		const probe = document.createElement("div");
		probe.setAttribute("aria-hidden", "true");
		probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:var(${prop}, 0px)`;
		el.appendChild(probe);
		const h = probe.getBoundingClientRect().height;
		probe.remove();
		return Number.isFinite(h) ? h : 0;
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
		// Reduced motion: no drift, the word solid, the intro shown — the stylesheet pins both,
		// so publishing anything here would only fight it.
		if (this.reducedMotion?.matches) {
			this.wordmark?.style.removeProperty("--sh-shift");
			this.solid?.style.setProperty("--sh-clip", "0");
			this.clearSubFade();
			return;
		}
		const y = window.scrollY || document.documentElement.scrollTop || 0;

		// The drift: up at DRIFT_RATE of the scroll until the word reaches the sticky
		// line — the sh-wordmark-drift keyframes' tent, peaking as the sticky line
		// catches the box and back to 0 where the paint does.
		const shift =
			y < this.pinAt ? (1 - DRIFT_RATE) * y : Math.max(0, this.pinAt - DRIFT_RATE * y);
		this.wordmark?.style.setProperty("--sh-shift", `${shift.toFixed(2)}px`);

		// The wipe: --sh-wipe-at → + --sh-reveal, as the CSS range.
		const revealed =
			this.revealPx > 0 ? clamp01((y - this.wipeAt) / this.revealPx) : y >= this.wipeAt ? 1 : 0;
		this.solid?.style.setProperty("--sh-clip", (1 - revealed).toFixed(4));

		// The fade: opacity only, over the first --sh-sub-fade-px; visibility flips at
		// the very end, matching the keyframes' discrete step.
		if (!(this.subFade > 0)) {
			this.clearSubFade();
			return;
		}
		const p = clamp01(y / this.subFade);
		this.sub?.style.setProperty("--sh-sub-opacity", (1 - p).toFixed(4));
		this.sub?.style.setProperty("--sh-sub-visibility", p >= 1 ? "hidden" : "visible");
	}

	/** Drop the published fade so the stylesheet's shown-by-default values apply. */
	private clearSubFade() {
		this.sub?.style.removeProperty("--sh-sub-opacity");
		this.sub?.style.removeProperty("--sh-sub-visibility");
	}
}

if (typeof customElements !== "undefined" && !customElements.get("stories-heading")) {
	customElements.define("stories-heading", StoriesHeadingElement);
}
