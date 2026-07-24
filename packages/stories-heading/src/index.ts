/** Clamp `x` to [0, 1]. */
function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * `<stories-heading>` — the "tristan / & other stories" lockup.
 *
 * The "tristan" wordmark is a full-width SVG: after fonts load (and on resize)
 * the <text> glyph bbox is measured with getBBox() and the viewBox is set to the
 * real `0 0 bbox.width bbox.height`, so width:100% fills exactly to the gutters at
 * any viewport with no baked-in aspect ratio.
 *
 * Two INDEPENDENT scroll drivers:
 *   1. "other stories" reveal — the lockup pins (position: sticky at --sh-top)
 *      and stays FIXED for --sh-reveal + --sh-hold of scroll. Over --sh-reveal
 *      the outline→solid font-swap wipes in (--sh-clip 1→0). Driven by the pin's
 *      progress past its sticky offset.
 *   2. "&" parallax + fade — driven by the "&"'s OWN viewport position: as its
 *      top travels from ~60% of the viewport up to ~10%, it drifts DOWN
 *      (--sh-amp-shift) and fades (--sh-amp-opacity 1 → --sh-amp-floor).
 *
 * Light-DOM contract (authored by the Astro wrapper):
 *   .sh__wordmark-text — the SVG <text> whose bbox seeds the viewBox.
 *   [data-sh-amp]      — the big ampersand (parallax + fade).
 *   [data-sh-track]    — reserves the pin scroll distance in normal flow.
 *   [data-sh-pin]      — position:sticky element holding "other stories".
 *   .sh__solid         — the solid-face layer in "other stories"; clipped in.
 *
 * Host custom properties read by the stylesheet:
 *   --sh-clip           fraction 1→0 of the solid layer hidden from the top (wipe).
 *   --sh-amp-shift      the "&"'s parallax translateY (px, positive = down).
 *   --sh-amp-opacity    the "&"'s opacity (1 → floor).
 *   --sh-heading-fitsize font-size (px) fitting "other stories" to a 6-col span.
 *
 * Lifecycle mirrors the sibling packages: a `listeners` cleanup array, a `rafId`
 * guard, a `ResizeObserver`, reduced-motion handling, and full teardown (Layout
 * uses ClientRouter view transitions).
 */
export class StoriesHeadingElement extends HTMLElement {
	private track: HTMLElement | null = null;
	private pin: HTMLElement | null = null;
	private amp: HTMLElement | null = null;
	private heading: HTMLElement | null = null;
	private wordmarkSvg: SVGSVGElement | null = null;
	private wordmarkText: SVGTextElement | null = null;
	private inkCanvas: HTMLCanvasElement | null = null;

	private resizeObserver: ResizeObserver | null = null;
	private reducedMotion: MediaQueryList | null = null;
	private listeners: Array<() => void> = [];
	private rafId: number | null = null;

	/** The "&"'s parallax distance (px) at full progress, and its fade floor. */
	private static readonly AMP_PARALLAX = 100;
	private static readonly AMP_FLOOR = 0.15;
	/** Upward lift of the "&" above the wordmark baseline, as a fraction of the
	    "&"'s own font-size (so it scales across viewports). */
	private static readonly AMP_LIFT = 0.12;

	/** Grid the "other stories" fit targets: N columns of a 12-col content grid
	   with a 24px (var(--space-5)) gutter, matching .home__grid. Below this host
	   width (the ≤900px stacked layout) the fit is skipped for the rem fallback. */
	private static readonly GRID_COLUMNS = 12;
	private static readonly GRID_GAP = 24;
	private static readonly FIT_SPAN = 6;
	private static readonly FIT_MIN_WIDTH = 901;

	connectedCallback() {
		this.track = this.querySelector<HTMLElement>("[data-sh-track]");
		this.pin = this.querySelector<HTMLElement>("[data-sh-pin]");
		this.amp = this.querySelector<HTMLElement>("[data-sh-amp]");
		this.heading = this.querySelector<HTMLElement>(".sh__heading");
		this.wordmarkSvg = this.querySelector<SVGSVGElement>(".sh__wordmark-svg");
		this.wordmarkText = this.querySelector<SVGTextElement>(".sh__wordmark-text");

		this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onMotionChange = () => this.update();
		this.reducedMotion.addEventListener("change", onMotionChange);
		this.listeners.push(() =>
			this.reducedMotion?.removeEventListener("change", onMotionChange)
		);

		const onScroll = () => this.schedule();
		window.addEventListener("scroll", onScroll, { passive: true });
		this.listeners.push(() => window.removeEventListener("scroll", onScroll));

		// A viewport resize changes the wordmark bbox fit and the pinned distance.
		const onResize = () => {
			this.measure();
			this.schedule();
		};
		window.addEventListener("resize", onResize, { passive: true });
		this.listeners.push(() => window.removeEventListener("resize", onResize));

		this.resizeObserver = new ResizeObserver(() => {
			this.measure();
			this.schedule();
		});
		this.resizeObserver.observe(this);

		// Measure now, then again after fonts load — the wordmark's glyph metrics
		// (hence its bbox) shift once the web font swaps in.
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
	 * Fit the wordmark SVG viewBox to the real glyph bbox so width:100% fills
	 * exactly to the gutters, and publish the pin height so the track can reserve
	 * the reveal + hold distance on top of it. getBBox() throws if the element is
	 * not rendered (e.g. display:none), so guard it.
	 */
	private measure() {
		this.fitWordmark();
		this.fitAmp();
		this.fitHeading();

		if (this.pin) {
			this.style.setProperty(
				"--sh-pin-height",
				`${this.pin.offsetHeight.toFixed(1)}px`
			);
		}

		this.fitFold();
	}

	/**
	 * Size the dotgrid banner (--hero-height on the .fh layout) so the "tristan"
	 * wordmark is the ONLY thing above the fold and "other stories" sits just BELOW
	 * it: place the wordmark's bottom exactly at the fold, so the heading (which
	 * follows after --sh-heading-gap) starts below the fold. hero + wordmark ==
	 * viewport height. Only applied on a LANDSCAPE viewport (wider than tall);
	 * portrait/square keeps the CSS default banner. Also skipped when stacked.
	 */
	private fitFold() {
		const fh = this.closest<HTMLElement>(".fh");
		if (!fh || !this.wordmarkSvg) return;

		const landscape = window.innerWidth > window.innerHeight;
		if (
			!landscape ||
			this.getBoundingClientRect().width < StoriesHeadingElement.FIT_MIN_WIDTH
		) {
			fh.style.removeProperty("--hero-height");
			return;
		}

		const wmHeight = this.wordmarkSvg.getBoundingClientRect().height;
		// Wordmark bottom at the fold: any positive --sh-heading-gap then drops the
		// heading below it.
		const hero = Math.max(0, window.innerHeight - wmHeight);
		fh.style.setProperty("--hero-height", `${hero.toFixed(1)}px`);
	}

	/**
	 * Size the "&" to ~1/2 of the wordmark's rendered ink height and drop it so its
	 * own baseline sits on the wordmark's baseline. The "&" is absolutely positioned
	 * inside the host; the wordmark <svg> is its offset parent's first child, so its
	 * offsetTop/height locate the wordmark box. Within a font, the baseline sits
	 * `ascentRatio` down from the glyph-box top; we align the "&"'s baseline to the
	 * wordmark's by matching those baseline offsets. All font-relative, so it holds
	 * at every viewport.
	 */
	private fitAmp() {
		if (!this.amp || !this.wordmarkSvg) return;
		// Wordmark box top + height RELATIVE TO THE HOST (the "&"'s positioning
		// context), so --sh-amp-top lands in the same coordinate space.
		const hostTop = this.getBoundingClientRect().top;
		const wmRect = this.wordmarkSvg.getBoundingClientRect();
		const wmTop = wmRect.top - hostTop;
		const wmHeight = wmRect.height;
		if (!(wmHeight > 0)) return;

		// "&" font-size = 1/2 of the wordmark's rendered ink height.
		const ampSize = wmHeight / 2;
		this.style.setProperty("--sh-amp-size", `${ampSize.toFixed(2)}px`);

		// The wordmark box IS its ink (fitWordmark set the viewBox to the ink
		// bounds), so its baseline is `ascent/(ascent+descent)` down from wmTop.
		const wmInk = this.measureInk();
		const wmBaseline =
			wmTop +
			(wmInk ? (wmInk.ascent / (wmInk.ascent + wmInk.descent)) * wmHeight : wmHeight);

		// The "&"'s baseline sits `ampAscent` below its own top (its font-size box
		// top). Place --sh-amp-top so that top + ampAscent == wmBaseline, then lift
		// it slightly above the baseline (proportional to its size, so it scales).
		const ampAscent = this.measureAmpAscent(ampSize);
		const lift = StoriesHeadingElement.AMP_LIFT * ampSize;
		const ampTop = wmBaseline - (ampAscent ?? ampSize * 0.72) - lift;
		this.style.setProperty("--sh-amp-top", `${ampTop.toFixed(2)}px`);
	}

	/** Ink ascent (px above baseline) of "&" at `sizePx`, via Canvas measureText. */
	private measureAmpAscent(sizePx: number): number | null {
		if (!this.amp) return null;
		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return null;
		const cs = getComputedStyle(this.amp);
		ctx.font = `${cs.fontWeight} ${sizePx}px ${cs.fontFamily}`;
		const m = ctx.measureText("&");
		const a = m.actualBoundingBoxAscent;
		return Number.isFinite(a) ? a : null;
	}

	/**
	 * Size the SVG viewBox to the wordmark's true INK bounds so width:100% fills
	 * the gutters with no vertical padding. getBBox() gives an ink-tight WIDTH but
	 * its HEIGHT is the font's full ascent+descent metrics box (~1.33em) — for a
	 * word like "tristan" (no descenders, modest ascenders) that bakes in a large
	 * empty band above/below the glyphs, which scales up to read as too much line
	 * height. So take the width from getBBox() and the height from the real glyph
	 * ink measured with Canvas measureText (actualBoundingBox*), then set the
	 * <text> baseline (y) to that ink top so the glyphs sit flush in the box.
	 */
	private fitWordmark() {
		if (!this.wordmarkSvg || !this.wordmarkText) return;
		let box: DOMRect;
		try {
			box = this.wordmarkText.getBBox();
		} catch {
			return; // not rendered yet
		}
		if (!box || box.width <= 0 || box.height <= 0) return;

		const ink = this.measureInk();
		if (ink) {
			// Baseline sits `ascent` below the box top; height is the ink extent.
			this.wordmarkText.setAttribute("y", ink.ascent.toFixed(2));
			this.wordmarkSvg.setAttribute(
				"viewBox",
				`${box.x.toFixed(2)} 0 ${box.width.toFixed(2)} ${(ink.ascent + ink.descent).toFixed(2)}`
			);
			return;
		}

		// Fallback: metrics box (no ink measurement available).
		this.wordmarkSvg.setAttribute(
			"viewBox",
			`${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.width.toFixed(2)} ${box.height.toFixed(2)}`
		);
	}

	/**
	 * Size "other stories" so its single-line width equals a 6-column span of the
	 * 12-col content grid (matching the "NEW DARK WEB" reference). The grid shares
	 * this host's content-box width and the same --hero-inset gutter as the page's
	 * .fh-row, so this host's own width is the grid's total width. A span of N cols
	 * is N*colW + (N-1)*gap where colW = (total - 11*gap)/12. We measure the text
	 * at a reference px size with Canvas measureText (no layout thrash), then scale
	 * font-size by target/natural. Below FIT_MIN_WIDTH (the ≤900px stacked layout,
	 * where white-space wraps) the fit is skipped so CSS keeps the rem fallback.
	 */
	private fitHeading() {
		if (!this.heading) return;

		const hostWidth = this.getBoundingClientRect().width;
		// Stacked layout (or not rendered): drop the fit, fall back to the rem step.
		if (hostWidth < StoriesHeadingElement.FIT_MIN_WIDTH) {
			this.style.removeProperty("--sh-heading-fitsize");
			return;
		}

		const gap = StoriesHeadingElement.GRID_GAP;
		const cols = StoriesHeadingElement.GRID_COLUMNS;
		const span = StoriesHeadingElement.FIT_SPAN;
		const colW = (hostWidth - (cols - 1) * gap) / cols;
		const target = span * colW + (span - 1) * gap;
		if (!(target > 0)) return;

		// Natural single-line ink width of "other stories" at a reference px size.
		const REF = 100;
		const natural = this.measureHeadingWidth(REF);
		if (natural === null || natural <= 0) return;

		const size = (target / natural) * REF;
		if (!Number.isFinite(size) || size <= 0) return;
		this.style.setProperty("--sh-heading-fitsize", `${size.toFixed(2)}px`);
	}

	/**
	 * Advance width (px) of the "other stories" text at `sizePx`, via Canvas
	 * measureText using the heading's computed face/weight/letter-spacing — same
	 * approach as measureInk(). Letter-spacing adds (n-1)*spacing since measureText
	 * omits it. Returns null if the 2D context or the text is missing.
	 */
	private measureHeadingWidth(sizePx: number): number | null {
		if (!this.heading) return null;
		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return null;
		const cs = getComputedStyle(this.heading);
		// .sh__heading wraps BOTH the outline and solid face layers, so its
		// textContent is the phrase DOUBLED — measure a single layer instead.
		const layer = this.heading.querySelector(".sh__solid, .sh__outline");
		const text = ((layer ?? this.heading).textContent || "").trim();
		if (!text) return null;
		ctx.font = `${cs.fontWeight} ${sizePx}px ${cs.fontFamily}`;
		const advance = ctx.measureText(text).width;
		// letter-spacing — measureText ignores it; add it back at `sizePx`. The
		// computed value is px relative to the CURRENT font-size (which may already
		// be a prior fit), so normalise to a ratio of that size, then re-apply.
		const spacingPx = parseFloat(cs.letterSpacing);
		const curSize = parseFloat(cs.fontSize) || sizePx;
		const extra =
			Number.isFinite(spacingPx) && curSize > 0
				? (spacingPx / curSize) * sizePx * Math.max(0, text.length - 1)
				: 0;
		const width = advance + extra;
		return Number.isFinite(width) ? width : null;
	}

	/**
	 * The wordmark's true ink ascent/descent (px above/below the baseline) at the
	 * SVG font-size, via Canvas measureText — the same face/weight/letter-spacing
	 * the <text> uses. Returns null if the 2D context or the metrics are missing.
	 */
	private measureInk(): { ascent: number; descent: number } | null {
		if (!this.wordmarkText) return null;
		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return null;
		const cs = getComputedStyle(this.wordmarkText);
		const size = parseFloat(cs.fontSize) || 300;
		ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
		const m = ctx.measureText(this.wordmarkText.textContent || "");
		const ascent = m.actualBoundingBoxAscent;
		const descent = m.actualBoundingBoxDescent;
		if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return null;
		if (ascent + descent <= 0) return null;
		return { ascent, descent };
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
		// Reduced motion: stories shown, "&" at rest (no drift, full opacity).
		if (this.reducedMotion?.matches) {
			this.style.setProperty("--sh-clip", "0");
			this.style.setProperty("--sh-amp-shift", "0px");
			this.style.setProperty("--sh-amp-opacity", "1");
			return;
		}

		// 1. "other stories" reveal: outline→solid wipe over --sh-reveal of pin.
		const revealed = this.revealProgress();
		this.style.setProperty("--sh-clip", (1 - revealed).toFixed(4));

		// 2. "&" parallax + fade from its own viewport position: drifts DOWN
		// (positive translateY) as it fades to the floor.
		const p = this.ampProgress();
		this.style.setProperty(
			"--sh-amp-shift",
			`${(StoriesHeadingElement.AMP_PARALLAX * p).toFixed(2)}px`
		);
		const floor = StoriesHeadingElement.AMP_FLOOR;
		this.style.setProperty(
			"--sh-amp-opacity",
			(1 - (1 - floor) * p).toFixed(4)
		);
	}

	/**
	 * Reveal progress 0→1: 0 the instant the pin sticks (the track's top reaches
	 * the sticky offset --sh-top), 1 after --sh-reveal has been scrolled past that
	 * point. Reads the sticky offset from computed style, so it tracks --sh-top.
	 */
	private revealProgress(): number {
		if (!this.track || !this.pin) return 1;
		const revealPx = this.cssPx("--sh-reveal", 0.6 * window.innerHeight);
		if (revealPx <= 0) return 1;
		const stickyTop = parseFloat(getComputedStyle(this.pin).top) || 0;
		const top = this.track.getBoundingClientRect().top;
		return clamp01((stickyTop - top) / revealPx);
	}

	/**
	 * "&" progress 0→1 from its OWN position: 0 while its top is at/below 60% of
	 * the viewport, 1 once it has risen to 10%. Independent of the pin.
	 */
	private ampProgress(): number {
		if (!this.amp) return 0;
		const start = 0.6 * window.innerHeight; // begin drifting/fading here
		const end = 0.1 * window.innerHeight; // fully drifted/faded here
		const ampTop = this.amp.getBoundingClientRect().top;
		return clamp01((start - ampTop) / (start - end));
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
