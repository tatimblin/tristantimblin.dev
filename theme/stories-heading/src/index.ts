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
 *      (--sh-amp-shift) and dissolves (--sh-amp-opacity), gone as the drift ends.
 *
 * Light-DOM contract (authored by the Astro wrapper):
 *   .sh__wordmark-text — the SVG <text> whose bbox seeds the viewBox.
 *   [data-sh-amp]      — the big ampersand (parallax + fade).
 *   [data-sh-track]    — reserves the pin scroll distance in normal flow.
 *   [data-sh-pin]      — position:sticky element holding "other stories".
 *   .sh__solid         — the solid-face layer in "other stories"; clipped in.
 *
 * SCROLL EFFECTS ARE CSS FIRST, JS ONLY AS A FALLBACK. The wipe, the intro fade and
 * the "&" parallax are CSS scroll-progress timelines (see the foot of styles.css). On
 * an engine that has them — every engine this site's scroll ever felt slow on — this
 * class registers NO scroll listener at all and does only layout-rate work.
 *
 * Firefox does not have them (measured: 153 reports
 * `CSS.supports("animation-timeline", "scroll()")` false), and the @supports gate that
 * keeps the CSS safe there also means the effects simply would not exist. So the old
 * per-frame driver is kept, behind that exact feature test, and runs only where CSS
 * cannot. It is the slower path by construction — a main-thread handler cannot stay in
 * step with a compositor scroll — which is the point: nobody gets it who doesn't need
 * it. Delete it the day Firefox ships scroll-driven animations.
 *
 * Published from measure():
 *   --sh-heading-fitsize font-size (px) fitting "other stories" to a 6-col span.
 *   --sh-heading-gap     the measured tuck of "other stories" into the wordmark.
 *   --sh-amp-size/-top/-left the "&"'s size and its place behind "other stories".
 *   --sh-solid-*         the four registration corrections onto the outline.
 *   --sh-pin-height      the pin's height, so the track can reserve its scroll.
 * ...and onto .fh, for the hero fold: --sh-group-h, --sh-lockup-h,
 * --sh-wordmark-h and --sh-header-h. Those also FEED THE CSS RANGES the timelines animate over, which
 * is why they have to stay correct even though nothing reads them per frame.
 *
 * Lifecycle mirrors the sibling packages: a `listeners` cleanup array, a
 * `ResizeObserver`, and full teardown (Layout uses ClientRouter view transitions).
 */
export class StoriesHeadingElement extends HTMLElement {
	private track: HTMLElement | null = null;
	private pin: HTMLElement | null = null;
	private amp: HTMLElement | null = null;
	private heading: HTMLElement | null = null;
	private wordmarkSvg: SVGSVGElement | null = null;
	private wordmarkText: SVGTextElement | null = null;
	/** A hidden, viewBox-less twin of the wordmark's <text>, measured in place of the
	    real one. See bboxAtUnitScale(). */
	private bboxProbe: SVGSVGElement | null = null;
	/** True when the browser drives the scroll effects itself, so this class must not.
	    Read ONCE at connect: it cannot change for the lifetime of a document, and
	    CSS.supports() is a parse, not something to repeat per frame. */
	private cssDrivesScroll = false;
	/** The solid ("other stories") layer — only the JS fallback writes to it. */
	private solid: HTMLElement | null = null;
	private reducedMotion: MediaQueryList | null = null;
	private rafId: number | null = null;
	/** Scroll-invariant tokens, resolved in measure() rather than per frame (fallback
	    path only). Reading them in update() meant a getComputedStyle — a forced style
	    recalc — on every frame of every scroll, for values only a resize can change. */
	private revealPx = 0;
	/** --sh-scene-bottom resolved to px from the scene's top, or null when unset
	    (the picture fills the scene box). Cached in measure(). */
	private sceneCut: number | null = null;
	/** The pin's sticky line (--sh-top) in px. Cached in measure(). */
	private pinTop = 0;
	private subFade = 0;

	/** The slotted intro wrapper — a static sibling of the pin, so it scrolls with the
	    page under its own steam. Observed separately all the same: it lives inside the
	    track's explicit height, so its growth never changes the host's own box. */
	private sub: HTMLElement | null = null;
	private inkCanvas: HTMLCanvasElement | null = null;
	/** The full-viewport dotgrid scene layer, if this lockup overlays one. The
	    outline→solid reveal is GATED until "other stories" clears the scene's
	    bottom edge, so the solid layer's opaque --color-bg backdrop never knocks a
	    black rectangle out of the halftone dots (it only paints over the plain page
	    background below the scene). */
	private scene: HTMLElement | null = null;

	private resizeObserver: ResizeObserver | null = null;
	private listeners: Array<() => void> = [];
	/** Last value written per fold property, so an unchanged re-measure writes
	    nothing — measure() runs from a ResizeObserver, and a write there that
	    resizes anything downstream would log an RO-loop warning (see setPx). */
	private lastWritten = new Map<string, number>();

	/** The "&"'s INK HEIGHT, as a fraction of the wordmark's rendered ink height.
	    A display glyph, not a letter of the line: its baseline on the heading's, it
	    rises from behind "other stories" to about the wordmark's x-height midline,
	    knocking a hole out of "tr". Tied to the wordmark rather than to a breakpoint
	    so it holds the same proportion at every viewport; the CSS --sh-amp-size
	    steps exist only for the pre-measure frame. */
	private static readonly AMP_SIZE_RATIO = 0.6;
	/** Where the "&"'s ink centre sits across the wordmark's ink, 0 (its left edge)
	    to 1 (its right): over the "r", between "t" and "is", as on the live site. */
	private static readonly AMP_CENTER = 0.21;
	/** How far the "&"'s baseline drops BELOW the heading's, in em of the "&". */
	private static readonly AMP_DROP = 0;

	/** The "&"'s parallax distance (px) at full progress. */
	private static readonly AMP_PARALLAX = 100;
	/** How far into that drift the fade starts, 0–1. It holds fully opaque until here,
	    then reaches 0 exactly as the drift ends — so the movement reads on its own
	    before the mark begins to leave, instead of the "&" being permanently half-there.
	    MUST MATCH the 40% stop in the sh-amp-parallax keyframes; this constant only
	    drives the fallback path, and the two describing different curves would mean the
	    "&" behaves differently per engine. */
	private static readonly AMP_FADE_START = 0.4;
	/** The translateY currently applied to the "&", so ampProgress() can subtract it
	    back out — see there. Fallback path only. */
	private ampShift = 0;
	/** Extra px the solid layer's mask reaches beyond the tallest ink it must cover.
	    Three things Canvas's ink metrics do not know about: the outline's 1px
	    text-stroke, sub-pixel rounding, and — the reason this is 8 and not 2 — the
	    displacement filter the solid layer's text runs through (<wobble-text scale>),
	    which shoves glyphs a few px off their measured box in both directions. Too
	    small and a wobbling ascender tip clips against the box edge; the cost of too
	    large is only a slightly taller opaque mask, over page background. */
	private static readonly COVER_SLACK = 8;

	/** The daylight between the wordmark's baseline and the tallest ink of "other
	    stories" (the t's apex, the h's ascender, the i's tittle), in em of the
	    heading's font-size — so the gap is a property of the type and scales with it.
	    fitHeadingTuck() measures where that ink sits and places it this far under the
	    wordmark. NEGATIVE: an overlap, the live site's tuck — the heading's tallest
	    letters cross the wordmark's baseline. "other stories" stacks OVER "tristan"
	    and is a background-filled outline, so its ascenders knock out the wordmark
	    where they cross rather than colliding with it. */
	private static readonly TUCK_CLEARANCE = -0.12;

	/** "other stories"'s single-line width as a fraction of the wordmark's. One
	    proportion at every width (see fitHeading). The live site's serif heading ran
	    ~0.6 of its wordmark, but DM Sans is far wider and taller in the x-height at a
	    given width, so the same fraction reads as too big; this keeps the heading
	    clearly subordinate. */
	private static readonly HEADING_RATIO = 0.5;

	connectedCallback() {
		this.track = this.querySelector<HTMLElement>("[data-sh-track]");
		this.pin = this.querySelector<HTMLElement>("[data-sh-pin]");
		this.amp = this.querySelector<HTMLElement>("[data-sh-amp]");
		this.heading = this.querySelector<HTMLElement>(".sh__heading");
		this.wordmarkSvg = this.querySelector<SVGSVGElement>(".sh__wordmark-svg");
		this.wordmarkText = this.querySelector<SVGTextElement>(".sh__wordmark-text");
		this.sub = this.querySelector<HTMLElement>(".sh__sub");
		// The dotgrid scene the lockup overlays (for gating the reveal); may be absent
		// (e.g. a hero with no scene) — the reveal then plays normally.
		this.scene = this.closest<HTMLElement>(".fh")?.querySelector<HTMLElement>(".fh__scene") ?? null;

		// THE FEATURE TEST THAT DECIDES WHETHER ANY OF THE BELOW EXISTS. With scroll
		// timelines the browser owns every scroll effect and this class registers no
		// scroll listener at all; without them (Firefox) the fallback driver below runs.
		// Matches the @supports condition in styles.css exactly — if the two ever
		// disagree, one path or the other runs twice or not at all.
		this.cssDrivesScroll =
			typeof CSS !== "undefined" &&
			typeof CSS.supports === "function" &&
			CSS.supports("animation-timeline", "scroll()");

		if (!this.cssDrivesScroll) {
			this.solid = this.querySelector<HTMLElement>(".sh__solid");
			this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
			const onMotionChange = () => this.update();
			this.reducedMotion.addEventListener("change", onMotionChange);
			this.listeners.push(() =>
				this.reducedMotion?.removeEventListener("change", onMotionChange)
			);

			const onScroll = () => this.schedule();
			window.addEventListener("scroll", onScroll, { passive: true });
			this.listeners.push(() => window.removeEventListener("scroll", onScroll));
		}

		// A viewport resize changes the wordmark bbox fit and the pinned distance.
		const onResize = () => {
			this.measure();
			if (!this.cssDrivesScroll) this.schedule();
		};
		window.addEventListener("resize", onResize, { passive: true });
		this.listeners.push(() => window.removeEventListener("resize", onResize));

		this.resizeObserver = new ResizeObserver(() => {
			this.measure();
			if (!this.cssDrivesScroll) this.schedule();
		});
		this.resizeObserver.observe(this);
		// The sub-lockup (intro + CTAs) is position:absolute on the mobile layout, so its
		// growth never changes the host's box — observing only the host would miss a
		// re-wrapped lede or a CTA row wrapping to two lines, which is exactly the
		// content growth --sh-group-h exists to absorb. Observe it directly.
		if (this.sub) this.resizeObserver.observe(this.sub);
		// Same for the pin: "other stories" is JS-fit, and under reduced motion the sub
		// lives inside the pin's flow.
		if (this.pin) this.resizeObserver.observe(this.pin);

		// Measure now, then again after fonts load — the wordmark's glyph metrics
		// (hence its bbox) shift once the web font swaps in.
		this.measure();
		if (!this.cssDrivesScroll) this.update();
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => {
				this.measure();
				if (!this.cssDrivesScroll) this.schedule();
				this.announceReady();
			});
		} else {
			this.announceReady();
		}
	}

	/**
	 * Publish "the lockup has settled at its final metrics" — after the post-font
	 * re-measure, since that is the pass that can still move the wordmark's box.
	 *
	 * Note the lockup is deliberately NOT hidden waiting for this: the homepage's
	 * LCP element is the wordmark text itself, so holding it back for the webfont
	 * would trade a one-frame reflow for real, measured LCP. The remeasure jump is
	 * addressed by getting the font there sooner (preload) rather than by covering
	 * it up. This event exists so a consumer can sequence against the lockup without
	 * re-deriving when fonts landed.
	 */
	private announceReady() {
		if (this.dataset.ready) return;
		this.dataset.ready = "true";
		this.dispatchEvent(new CustomEvent("stories-heading:ready", { bubbles: true }));
	}

	/**
	 * Fit the wordmark SVG viewBox to the real glyph bbox so width:100% fills
	 * exactly to the gutters, and publish the pin height so the track can reserve
	 * the reveal + hold distance on top of it. getBBox() throws if the element is
	 * not rendered (e.g. display:none), so guard it.
	 */
	private measure() {
		// Fallback-path only: resolve the scroll-invariant tokens at layout rate so
		// update() never calls getComputedStyle. Skipped entirely when CSS drives.
		if (!this.cssDrivesScroll) {
			this.revealPx = this.cssPx("--sh-reveal", 0.6 * window.innerHeight);
			this.subFade = this.readSubFadePx();
		}

		this.fitWordmark();
		// BEFORE the fit, not after: alignHeadingLayers narrows the solid layer, and
		// fitHeading sizes the box to the WIDER layer — run the other way round and
		// each re-measure feeds the other a different answer, so the fit never settles.
		// The corrections are ratios of font-size, so they are valid at whatever size
		// this reads.
		this.alignHeadingLayers();
		this.fitHeading();
		// AFTER fitHeading: the tuck is derived from the heading's ink metrics at its
		// FITTED size, so it has to read the size the fit just landed on.
		this.fitHeadingTuck();
		// LAST: the "&" stands behind "other stories", so it is placed off the heading's
		// fitted size and tuck. It is absolute and takes no flow space, so nothing above
		// reads it back.
		this.fitAmp();

		if (this.pin) {
			this.style.setProperty(
				"--sh-pin-height",
				`${this.pin.offsetHeight.toFixed(1)}px`
			);
		}

		this.fitFold();

		// Fallback-path only, and LAST: the pin line and the picture's edge are both
		// derived from what the fits above just published (--sh-wordmark-h, the lead).
		if (!this.cssDrivesScroll) {
			this.sceneCut = this.readSceneCut();
			this.pinTop = this.pin ? parseFloat(getComputedStyle(this.pin).top) || 0 : 0;
		}
	}

	/**
	 * CENTRE THE LOCKUP, keeping the group above the scene's reserved bottom edge.
	 *
	 * The scene is a full-bleed background layer whose own UI may hug its BOTTOM edge
	 * (the carousel's date scrubber + caption, declared as --hero-floor by the
	 * layout). The lockup — wordmark + "&" + "other stories" — centres in the first
	 * screen; the slotted intro/CTAs flow below it, in the lower half, and the whole
	 * group must rest ABOVE that floor, never through it. Two clamps, in a fixed order:
	 *
	 *   lead   = max(headerH,
	 *                min((100svh − lockup) / 2,
	 *                    100svh − floor − foldGap − group))           ① spend whitespace
	 *   height = max(100svh, lead + group + foldGap + floor)          ② then grow
	 *
	 * ① centres the lockup until the intro below it would reach the floor; from there
	 * it SHRINKS the lead, so a group that grows (longer copy, larger dynamic type, a
	 * narrower screen forcing more wrapping) first eats the whitespace under the site
	 * header. Only when the lead bottoms out at
	 * headerH — no whitespace left — does the group's bottom pass the fold, and ②
	 * grows the hero by exactly that overflow. Growing is the last resort.
	 *
	 * BOTH clamps live in CSS (see FullHeroLayout). This method only MEASURES and
	 * publishes content sizes:
	 *
	 *   --sh-group-h      the group's full height (wordmark → intro bottom)
	 *   --sh-lockup-h     the lockup's height (wordmark → "other stories" bottom)
	 *   --sh-wordmark-h   the wordmark's rendered height
	 *   --sh-header-h     the site header's band: the minimum lead (the wordmark
	 *                     clears the header) and a framed hero's margin
	 *
	 * That split is what makes the system acyclic. If JS instead computed the lead
	 * from the scene's measured height, every grown state would be its own fixed point
	 * (a taller scene justifies the same tall lead that made it grow) and the hero
	 * would stay expanded on viewports where it fits. Publishing only content sizes —
	 * none of which depend on the lead or the hero height — leaves CSS to resolve the
	 * clamps against a true `100svh`, in the correct units, every layout pass.
	 *
	 * Also publishes --sh-top: the sticky line must FOLLOW the group. A fixed 50svh
	 * line clamps the pin whenever the lead would place it higher,
	 * silently dragging "other stories" away from the wordmark. Deriving it from the
	 * lead makes the clamp coincide with the natural position — zero slack at rest, so
	 * "other stories" sits exactly one --sh-heading-gap below the wordmark.
	 *
	 * Every input is a measured size, never a vh ratio, and every one is
	 * SCROLL-INVARIANT — not because this runs on scroll (it doesn't; measure() runs
	 * from resize / the ResizeObserver / fonts.ready) but because a resize can land at
	 * any scroll position, and the fold must not depend on where the page happens to
	 * be. Hence the sub is measured RELATIVE TO THE TRACK — the nearest box around it
	 * that is in NORMAL FLOW. The sub is a static child of the track, so that
	 * difference is pure layout and cannot move with scroll. The PIN would not do:
	 * it is sticky, so it detaches from the track as the page scrolls and the gap
	 * between the two IS the scroll offset.
	 * Runs at every width; the ≤900px layout needs it MOST, since that is where the
	 * scene's bottom UI and the group compete for one screen.
	 */
	private fitFold() {
		const fh = this.closest<HTMLElement>(".fh");
		if (!fh) return;

		// Legacy inline height from the old capped-banner layout — clear it so the CSS
		// max() (which we feed with measured content sizes) wins.
		fh.style.removeProperty("--hero-height");

		const wmHeight = this.wordmarkSvg?.getBoundingClientRect().height ?? 0;
		if (!(wmHeight > 0)) return; // not laid out yet; a later measure() will catch it

		// Gap between the wordmark and the track (the --sh-heading-gap margin).
		const headingGap = this.track
			? parseFloat(getComputedStyle(this.track).marginTop) || 0
			: 0;

		// The group's extent BELOW the wordmark: whichever reaches lower, the pinned
		// heading or the intro flowing under it. Both are measured against the TRACK —
		// see the note above on why the pin cannot be the reference. Fractional
		// (getBoundingClientRect), not offsetHeight: the two are mixed in the Math.max
		// below, and offsetHeight rounds to whole px.
		const pinRect = this.pin?.getBoundingClientRect();
		const subRect = this.sub?.getBoundingClientRect();
		const trackRect = this.track?.getBoundingClientRect();

		let belowWordmark = pinRect?.height ?? 0;
		if (trackRect && subRect && subRect.height > 0) {
			belowWordmark = Math.max(belowWordmark, subRect.bottom - trackRect.top);
		}

		// Min top space so the wordmark clears the overlaid header — MEASURED from the
		// header's own box (absolutely positioned at the top of .fh, with its own
		// padding), rather than a vh ratio that guesses at it.
		const headerH =
			fh.querySelector<HTMLElement>(".site-header")?.getBoundingClientRect()
				.height ?? 0;

		this.setPx(fh, "--sh-group-h", wmHeight + headingGap + belowWordmark, "groupH");
		this.setPx(fh, "--sh-lockup-h", wmHeight + headingGap + (pinRect?.height ?? 0), "lockupH");
		this.setPx(fh, "--sh-wordmark-h", wmHeight, "wordmarkH");
		// The header's band: the lead's floor (the lead runs from the hero's top to the
		// wordmark's, so the wordmark clears the header exactly at headerH — the heading
		// gap sits BELOW the wordmark and is already in --sh-group-h, not clearance), and
		// the margin a consumer framing the hero in the header's band uses. Rounded UP
		// to a whole px: it is a floor with no slack, and setPx's 0.1px rounding (or a
		// skipped sub-0.5px rewrite) could otherwise park the wordmark a hair under
		// the header. Whole px always differ by ≥1, so the guard never skips one.
		this.setPx(fh, "--sh-header-h", Math.ceil(headerH), "headerH");
	}

	/**
	 * Write a px custom property, skipping sub-pixel-identical rewrites. measure() runs
	 * from a ResizeObserver — including one on the sub-lockup, whose height these
	 * writes can change — and an unguarded write there logs "ResizeObserver loop
	 * completed with undelivered notifications". The guard makes the observe → publish
	 * → re-layout round trip terminate on the first pass that changes nothing.
	 */
	private setPx(el: HTMLElement, prop: string, value: number, key: string) {
		const prev = this.lastWritten.get(key);
		if (prev !== undefined && Math.abs(prev - value) < 0.5) return;
		this.lastWritten.set(key, value);
		el.style.setProperty(prop, `${value.toFixed(1)}px`);
	}

	/**
	 * Set the "&" as a display glyph BEHIND "other stories" and OVER "tristan": its ink
	 * AMP_SIZE_RATIO of the wordmark's ink height, its baseline AMP_DROP em under the
	 * heading's, its ink centred AMP_CENTER of the way across the wordmark's ink.
	 *
	 * Runs AFTER fitHeading/fitHeadingTuck: it is placed off the heading's fitted size
	 * and tuck. And it reads the heading's AT-REST position, not its current one — the
	 * pin is sticky, so once it detaches its box is wherever the scroll put it. The
	 * track is in flow (scroll-invariant) and the text's baseline within the pin is
	 * pure layout, so trackTop + (baseline − pinTop) is the at-rest baseline from any
	 * scroll position. Published relative to the host (the "&"'s containing block).
	 */
	private fitAmp() {
		if (!this.amp || !this.wordmarkSvg) return;
		const hostRect = this.getBoundingClientRect();
		const wmRect = this.wordmarkSvg.getBoundingClientRect();
		const wmHeight = wmRect.height;
		if (!(wmHeight > 0)) return;

		// SIZE: by INK height, asked of the face — font-size is not ink.
		const ink = this.measureAmpInk(100);
		const ampPerPx = (ink?.ascent ?? 72) / 100;
		const ampSize = (wmHeight * StoriesHeadingElement.AMP_SIZE_RATIO) / ampPerPx;
		this.style.setProperty("--sh-amp-size", `${ampSize.toFixed(2)}px`);

		const outline = this.heading?.querySelector(".sh__outline");
		const baseline = outline ? this.baselineOf(outline) : null;
		if (!outline || !this.track || !this.pin || baseline === null) return;
		const pinTop = this.pin.getBoundingClientRect().top;
		const trackTop = this.track.getBoundingClientRect().top;
		const headingBaseline = trackTop - hostRect.top + (baseline - pinTop);

		// VERTICAL: the "&"'s box top sits its own baseline offset above its baseline
		// (read off the element by layout, not modelled from font metrics).
		const ampBaseline = headingBaseline + StoriesHeadingElement.AMP_DROP * ampSize;
		const ampTop = ampBaseline - (this.ampBaselineOffset() ?? ampSize * 0.8);
		this.style.setProperty("--sh-amp-top", `${ampTop.toFixed(2)}px`);

		// HORIZONTAL: across the wordmark's INK — fitWordmark sized its viewBox to the
		// glyphs, so the svg's box is the text, not a padded container.
		// The "&"'s ink spans [origin − left, origin + right] of its box's left edge.
		const centre = wmRect.left - hostRect.left + StoriesHeadingElement.AMP_CENTER * wmRect.width;
		const k = ampSize / 100;
		const inkMid = ((ink ? ink.right - ink.left : 70) * k) / 2;
		this.style.setProperty("--sh-amp-left", `${(centre - inkMid).toFixed(2)}px`);
	}

	/** Distance from the "&" element's top to its baseline, in px — asked of the
	    layout engine with a zero-height probe, as baselineOf does for the heading. */
	private ampBaselineOffset(): number | null {
		if (!this.amp) return null;
		const base = this.baselineOf(this.amp);
		if (base === null) return null;
		return base - this.amp.getBoundingClientRect().top;
	}

	/** Ink box of "&" at `sizePx` via Canvas measureText: its ascent above the
	    baseline and its left/right extents from the glyph origin. */
	private measureAmpInk(sizePx: number): { ascent: number; left: number; right: number } | null {
		if (!this.amp) return null;
		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return null;
		const cs = getComputedStyle(this.amp);
		ctx.font = `${cs.fontWeight} ${sizePx}px ${cs.fontFamily}`;
		const m = ctx.measureText("&");
		if (!Number.isFinite(m.actualBoundingBoxAscent) || m.actualBoundingBoxAscent <= 0) return null;
		return {
			ascent: m.actualBoundingBoxAscent,
			left: m.actualBoundingBoxLeft,
			right: m.actualBoundingBoxRight,
		};
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
	 *
	 * The bbox is read at UNIT SCALE (bboxAtUnitScale), never off the live <text>:
	 * the live one's bbox depends on the very viewBox this writes, so measuring it
	 * makes a feedback loop that never settles where glyph advances are hinted.
	 */
	private fitWordmark() {
		if (!this.wordmarkSvg || !this.wordmarkText) return;
		const box = this.bboxAtUnitScale();
		if (!box || box.width <= 0 || box.height <= 0) return; // not rendered yet

		const ink = this.measureInk();
		if (ink) {
			// Baseline sits `ascent` below the box top; height is the ink extent.
			this.setAttr(this.wordmarkText, "y", ink.ascent.toFixed(2));
			this.setAttr(
				this.wordmarkSvg,
				"viewBox",
				`${box.x.toFixed(2)} 0 ${box.width.toFixed(2)} ${(ink.ascent + ink.descent).toFixed(2)}`
			);
			return;
		}

		// Fallback: metrics box (no ink measurement available).
		this.setAttr(
			this.wordmarkSvg,
			"viewBox",
			`${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.width.toFixed(2)} ${box.height.toFixed(2)}`
		);
	}

	/** setAttribute, skipped when the value is already there. */
	private setAttr(el: Element, name: string, value: string) {
		if (el.getAttribute(name) !== value) el.setAttribute(name, value);
	}

	/**
	 * THE WORDMARK'S BBOX, MEASURED WHERE THE ANSWER CANNOT MOVE IT.
	 *
	 * Chromium lays SVG text out in a font scaled by the text's on-screen scale, and
	 * where the font rasteriser hints glyph advances (Linux; not macOS) the user-space
	 * width that comes back from getBBox() is a non-monotonic function of that scale.
	 * The scale is svgWidth / viewBox width, and fitWordmark() writes the viewBox from
	 * the bbox. Measured on the live <text> that is a loop with no fixed point: in
	 * headless Chromium on Ubuntu (what CI runs) the viewBox width cycled 859.6–862.0
	 * every frame, the wordmark's height with it, and through the ResizeObserver and the fold
	 * (--sh-group-h) everything below the hero shook by a fraction of a pixel forever.
	 * That alone is a real bug (a CPU burned on layout every frame, a page that never
	 * holds still); it also kept Playwright from ever seeing the footer "stable".
	 *
	 * So measure a hidden twin of the <text> in a viewBox-less <svg>: one user unit is
	 * one CSS px, whatever the live viewBox is, and the answer depends only on the
	 * text and its computed style. The twin is a clone, so it carries the same class
	 * (face, weight, size, tracking) and inherits the same ancestors' tokens; it is
	 * absolute, 0×0 and hidden, so it adds nothing to layout, paint or the a11y tree.
	 */
	private bboxAtUnitScale(): DOMRect | null {
		if (!this.wordmarkSvg || !this.wordmarkText) return null;
		if (!this.bboxProbe?.isConnected) {
			const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			probe.setAttribute("aria-hidden", "true");
			probe.setAttribute("focusable", "false");
			probe.style.cssText =
				"position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
			this.wordmarkSvg.after(probe);
			this.bboxProbe = probe;
		}
		const probe = this.bboxProbe;
		// Re-cloned every measure, so the twin can never drift from the live text.
		const twin = this.wordmarkText.cloneNode(true) as SVGTextElement;
		probe.replaceChildren(twin);
		try {
			return twin.getBBox();
		} catch {
			return null; // not rendered (e.g. display:none)
		}
	}

	/**
	 * Size "other stories" so its single-line width is HEADING_RATIO of the
	 * wordmark's — one proportion at every viewport, so the heading stays
	 * subordinate to "tristan" on a phone as on a desktop (a grid-span fit above
	 * 900px and ~70vw below it made the phone's heading 3/4 of the wordmark). We
	 * measure the text at a reference px size with Canvas measureText (no layout
	 * thrash), then scale font-size by target/natural.
	 */
	private fitHeading() {
		if (!this.heading) return;

		const wmWidth =
			this.wordmarkSvg?.getBoundingClientRect().width || this.getBoundingClientRect().width;
		if (!(wmWidth > 0)) {
			// Not rendered: drop the fit, fall back to the rem step.
			this.style.removeProperty("--sh-heading-fitsize");
			return;
		}
		const target = StoriesHeadingElement.HEADING_RATIO * wmWidth;

		// Natural single-line ink width of "other stories" at a reference px size.
		const REF = 100;
		const natural = this.measureHeadingWidth(REF);
		if (natural === null || natural <= 0) return;

		const size = (target / natural) * REF;
		if (!Number.isFinite(size) || size <= 0) return;
		this.style.setProperty("--sh-heading-fitsize", `${size.toFixed(2)}px`);
	}

	/**
	 * TUCK "OTHER STORIES" UP INTO THE WORDMARK.
	 *
	 * The heading sits directly under "tristan" (which has no descenders, so its ink
	 * bottom IS its baseline), its tallest ink TUCK_CLEARANCE em from that baseline —
	 * negative, so the t, h and tittle cross it, as on the live site. A typographic
	 * relationship, not a spacing step: measured off the faces, it scales with the
	 * heading's fitted size. "other stories" stacks over "tristan" as a
	 * background-filled outline, so the crossing knocks out instead of colliding.
	 * (For a while, on DM Sans, this was a clear breath below the baseline instead.)
	 * Derived either way, never tuned per breakpoint: hand-picked px tokens went stale
	 * the last time the faces changed.
	 *
	 * Measured on the OUTLINE layer: it is the one in normal flow, so it defines the box.
	 *
	 * SCROLL-INVARIANT, which is why it is expressed against the PIN rather than the
	 * viewport or the wordmark. measure() can run from a resize at any scroll position,
	 * and the pin is sticky — its distance from the wordmark IS the scroll offset once it
	 * detaches. The heading's baseline relative to the pin, by contrast, is pure layout.
	 * At rest the pin's top coincides with the track's, which sits one --sh-heading-gap
	 * below the wordmark's ink bottom, so
	 *
	 *     inkTop = wordmarkBaseline + gap + (baseline − pinTop) − ascent
	 *
	 * and setting that to wordmarkBaseline + clearance gives the gap. Neither term on the
	 * right depends on the gap, so this lands in ONE pass — no feedback, and the
	 * re-measure the write triggers computes the same number and is skipped by setPx.
	 */
	private fitHeadingTuck(): void {
		if (!this.heading || !this.pin) return;
		const outline = this.heading.querySelector(".sh__outline");
		if (!outline) return;
		const text = this.textHost(outline);

		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return;

		const cs = getComputedStyle(text);
		const size = parseFloat(cs.fontSize);
		if (!(size > 0)) return;

		// The phrase's own tallest ink, asked of the face: the ascent of the whole
		// string, so whichever of the t, h or tittle stands highest sets it.
		ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
		const ascent = ctx.measureText(text.textContent || "").actualBoundingBoxAscent;
		if (!Number.isFinite(ascent) || ascent <= 0) return;

		const baseline = this.baselineOf(text);
		if (baseline === null) return;
		const pinTop = this.pin.getBoundingClientRect().top;

		// The ink top sits (baseline − pinTop − ascent) below the track top; the track
		// sits one gap below the wordmark's ink bottom (its baseline: "tristan" has no
		// descenders). Solve for the gap that puts the ink TUCK_CLEARANCE from it.
		this.setPx(
			this,
			"--sh-heading-gap",
			StoriesHeadingElement.TUCK_CLEARANCE * size - (baseline - pinTop - ascent),
			"headingGap"
		);
	}

	/**
	 * REGISTER THE SOLID LAYER ON THE OUTLINE.
	 *
	 * The wipe CAN swap typefaces mid-phrase (--font-hero for the outline, --font-heading
	 * for the solid). Both are DM Sans Medium today, so every correction below measures
	 * ~0; when they were a serif and a pixel face the solid painted ~0.15em low and
	 * ~0.28em long. Two faces can never match glyph-for-glyph, but they can share a
	 * bottom edge and an end, which is what makes the swap read as one phrase resolving
	 * rather than two words sliding past.
	 *
	 * MEASURED, NOT MODELLED. The obvious approach — derive the baseline from each
	 * face's ascent/descent — lands wrong, because engines disagree about which of a
	 * font's three competing vertical metric pairs (hhea, OS/2 typo, OS/2 win) forms
	 * the content area, and Canvas reports a fourth answer. So this zeroes its own
	 * corrections, reads where the two layers ACTUALLY paint, and derives the offsets
	 * from that. Ground truth costs one forced layout in a method that already reads
	 * geometry throughout.
	 *
	 * Both corrections are published in em — they are proportional to font-size — so
	 * they survive every step of the fit without re-measuring, and they are derived
	 * from whatever faces the CSS resolves, so re-pointing --font-heading
	 * re-derives them rather than stranding a hardcoded nudge.
	 *
	 *   --sh-solid-shift  translateY putting the solid's bottom edge on the outline's.
	 *   --sh-solid-track  extra letter-spacing closing the advance difference, so both
	 *                     layers start AND end on the same x.
	 */
	private alignHeadingLayers(): void {
		if (!this.heading) return;
		const outline = this.heading.querySelector(".sh__outline");
		const solid = this.heading.querySelector(".sh__solid");
		if (!outline || !solid) return;

		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return;

		// Zero every correction so the next read sees the raw faces, not the last
		// answer. All three go before ANY read, so one reflow covers them.
		this.style.removeProperty("--sh-solid-scale");
		this.style.removeProperty("--sh-solid-cover");
		this.style.removeProperty("--sh-solid-shift");
		this.style.removeProperty("--sh-solid-track");

		// SIZE — match the painted INK HEIGHT, not the font-size.
		//
		// Two faces at one font-size can draw very different ascenders (the old pixel
		// face overshot the serif outline by a fifth of its height). Scaling the solid
		// until its ink box matches makes the swap look like ONE word changing its
		// skin; matching the block wins because the block is what the eye compares.
		// Measure the element that actually HOLDS the text, not the layer wrapper.
		// The solid layer wraps its phrase in <wobble-text>, which is display:block —
		// so the wrapper's own line box is an empty one sitting below the real text,
		// and every metric read off it describes nothing that paints.
		const outText = this.textHost(outline);
		const solText = this.textHost(solid);

		const outHeight = this.inkHeight(ctx, outText);
		const solHeight = this.inkHeight(ctx, solText);
		if (outHeight !== null && solHeight !== null && solHeight > 0) {
			this.setNum("--sh-solid-scale", outHeight / solHeight);
		}

		// Everything below is relative to the SOLID's own font-size, which the scale
		// above has just changed — read it back rather than reusing the heading's.
		const size = parseFloat(getComputedStyle(solid).fontSize);
		if (!(size > 0)) return;

		// COVER — lift the top of the solid's box until it contains all the ink.
		//
		// The heading sets line-height 0.85, so BOTH layers paint above their own line
		// box: ascenders always exceed 0.85em. That box is the solid layer's border
		// box, and it does double duty — it bounds the opaque --color-bg mask AND it is
		// the clip-path's reference. So the un-lifted box both let the outline's tallest
		// glyphs (the t's apex, the i's tittle) survive above the mask, and clipped the
		// tips off the solid's own ascenders.
		//
		// Raising the top edge fixes both at once. It also moves the text down, since
		// the text lays out from the box top — which is why the baseline is measured
		// AFTER this, and corrects for it.
		const outTop = this.inkTop(ctx, outText);
		const solTop = this.inkTop(ctx, solText);
		if (outTop !== null && solTop !== null) {
			const boxTop = solid.getBoundingClientRect().top;
			const highest = Math.min(outTop, solTop);
			const cover =
				boxTop - highest + StoriesHeadingElement.COVER_SLACK;
			this.setEm("--sh-solid-cover", Math.max(0, cover) / size);
		}

		// VERTICAL — sit the two layers on ONE BASELINE, which is the only line the
		// eye reads two different typefaces against.
		//
		// Not the Range box's bottom: that is the CONTENT AREA (the face's own
		// ascent+descent), and two faces' content areas can differ enormously (the
		// old pixel face's was ~1.7x the outline's), so matching their bottoms hangs
		// the solid well above the outline. Not the
		// font's descent metric either; that was the first attempt and engines
		// disagree about which of a face's three metric pairs forms the box.
		//
		// A zero-height inline-block sits ON the baseline by definition, so dropping
		// one into each layer and reading where it lands asks the layout engine
		// directly instead of reconstructing its answer.
		const outBase = this.baselineOf(outText);
		const solBase = this.baselineOf(solText);
		if (outBase !== null && solBase !== null) {
			this.setEm("--sh-solid-shift", (outBase - solBase) / size);
		}

		// HORIZONTAL — the layers already share a left edge (both start at the box's
		// content edge), so closing the width difference lands the right edge too.
		//
		// How much width one step of tracking buys is NOT worth deriving. The obvious
		// model — one step per gap between characters — is wrong (CSS adds a step
		// after the last character too), and the next model down is wrong again once
		// a pixel face's advances land on subpixel boundaries. So PROBE it: apply a
		// known amount of tracking, see how far the edge actually moved, and scale.
		// One extra reflow in a method that already forces one, for an answer that
		// cannot drift out of sync with the layout engine.
		const outWidth = this.textWidth(outText);
		const solWidth = this.textWidth(solText);
		if (outWidth === null || solWidth === null) return;
		const gap = outWidth - solWidth;
		const probe = 1 / size; // 1px of tracking, expressed in em (of the solid)
		this.setEm("--sh-solid-track", probe);
		const probed = this.textWidth(solText);
		if (probed === null) return;
		const perPx = probed - solWidth; // px of width per px of tracking
		this.setEm(
			"--sh-solid-track",
			Math.abs(perPx) > 0.01 ? gap / perPx / size : 0,
		);
	}

	/**
	 * The element inside a layer that actually holds the text.
	 *
	 * A layer is not always a plain span around a phrase — the solid one wraps its
	 * text in <wobble-text> for the displacement effect, and that element is
	 * display:block. Measuring the wrapper then reads an empty line box beside the
	 * real one and reports a baseline ~70px off. Descend through single-element
	 * wrappers that contribute no text of their own until the text is reached.
	 */
	private textHost(el: Element): Element {
		let node = el;
		for (let depth = 0; depth < 4; depth++) {
			const children = Array.from(node.children);
			if (children.length !== 1) break;
			// Stop if this element contributes text OUTSIDE its single child — then it
			// is the one laying out the phrase, not a wrapper around it.
			const own = Array.from(node.childNodes).some(
				(n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim(),
			);
			if (own) break;
			node = children[0];
		}
		return node;
	}

	/**
	 * Viewport y of the TOP of a layer's painted ink — its baseline less however far
	 * its tallest glyph rises above it.
	 */
	private inkTop(ctx: CanvasRenderingContext2D, el: Element): number | null {
		const baseline = this.baselineOf(el);
		if (baseline === null) return null;
		const cs = getComputedStyle(el);
		const size = parseFloat(cs.fontSize);
		if (!(size > 0)) return null;
		ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
		const ascent = ctx.measureText((el.textContent || "").trim() || "M")
			.actualBoundingBoxAscent;
		return Number.isFinite(ascent) ? baseline - ascent : null;
	}

	/**
	 * Painted ink height (px) of a layer's text at its CURRENT font-size — the
	 * distance from the top of its tallest glyph to the bottom of its lowest, which
	 * is the block the eye actually compares between the two faces.
	 */
	private inkHeight(ctx: CanvasRenderingContext2D, el: Element): number | null {
		const cs = getComputedStyle(el);
		const size = parseFloat(cs.fontSize);
		if (!(size > 0)) return null;
		ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
		const m = ctx.measureText((el.textContent || "").trim() || "M");
		const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
		return Number.isFinite(height) && height > 0 ? height : null;
	}

	/** Write a unitless custom property, skipping identical rewrites (see setPx). */
	private setNum(prop: string, value: number): void {
		if (!Number.isFinite(value) || value <= 0) return;
		const next = value.toFixed(4);
		if (this.style.getPropertyValue(prop) === next) return;
		this.style.setProperty(prop, next);
	}

	/** Write an em custom property, skipping identical rewrites (see setPx). */
	private setEm(prop: string, value: number): void {
		if (!Number.isFinite(value)) return;
		const next = `${value.toFixed(4)}em`;
		if (this.style.getPropertyValue(prop) === next) return;
		this.style.setProperty(prop, next);
	}

	/**
	 * A layer's text baseline in viewport coordinates.
	 *
	 * An inline-block with no in-flow line boxes takes its bottom margin edge as its
	 * baseline, so a zero-sized one appended to the text lands exactly on it. This
	 * measures the engine's own answer rather than rebuilding it from font metrics,
	 * which is the whole point — see alignHeadingLayers.
	 */
	private baselineOf(el: Element): number | null {
		const probe = document.createElement("span");
		probe.setAttribute("aria-hidden", "true");
		probe.style.cssText =
			"display:inline-block;width:0;height:0;overflow:hidden";
		el.appendChild(probe);
		const bottom = probe.getBoundingClientRect().bottom;
		probe.remove();
		return Number.isFinite(bottom) ? bottom : null;
	}

	/**
	 * A layer's natural single-line text width (px).
	 *
	 * Both layers are stretched to the heading's box (the outline by flow, the solid
	 * by inset:0), so their own rects describe the BOX, and a Range over them is
	 * clamped to it too — which silently reports "no difference" exactly when the
	 * solid has been scaled narrower than the box. `width: max-content` for the
	 * duration of the read lifts that clamp and lets the text report its own size.
	 */
	private textWidth(el: Element): number | null {
		const style = (el as HTMLElement).style;
		const previous = style.width;
		style.width = "max-content";
		const range = document.createRange();
		range.selectNodeContents(el);
		const width = range.getBoundingClientRect().width;
		range.detach();
		style.width = previous;
		return width > 0 ? width : null;
	}

	/**
	 * Advance width (px) of the "other stories" text at `sizePx`.
	 *
	 * The OUTLINE layer only — it is the one in normal flow, so it is what
	 * fit-content sizes the box to. The solid layer is not consulted even though it
	 * carries a different face: alignHeadingLayers() has already matched the two to
	 * within a fraction of a pixel, and it expresses that match in em, so it holds at
	 * whatever size this fit lands on. Measuring the solid here instead measures it
	 * WITHOUT its scale correction — which read ~20% wide, shrank the heading to suit,
	 * and moved the whole hero fold underneath it.
	 */
	private measureHeadingWidth(sizePx: number): number | null {
		if (!this.heading) return null;
		if (!this.inkCanvas) this.inkCanvas = document.createElement("canvas");
		const ctx = this.inkCanvas.getContext("2d");
		if (!ctx) return null;
		// .sh__heading wraps BOTH layers, so ITS textContent is the phrase DOUBLED.
		const outline = this.heading.querySelector(".sh__outline");
		if (!outline) return null;
		return this.measureLayerWidth(ctx, this.textHost(outline), sizePx);
	}

	/**
	 * One layer's advance width at `sizePx`, via Canvas measureText using THAT
	 * element's computed face/weight/letter-spacing — same approach as measureInk().
	 * Letter-spacing adds (n-1)*spacing since measureText omits it.
	 */
	private measureLayerWidth(
		ctx: CanvasRenderingContext2D,
		el: Element,
		sizePx: number,
	): number | null {
		const text = (el.textContent || "").trim();
		if (!text) return null;
		const cs = getComputedStyle(el);
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
		this.lastWritten.clear();
		// Never leave a teardown mid-fade: drop anything the fallback published, so a
		// re-connected host starts from the stylesheet's shown-by-default state.
		this.clearSubFade();
		this.sub = null;
		this.solid = null;
		this.bboxProbe?.remove();
		this.bboxProbe = null;
		// Re-measured from scratch on re-connect, so allow the announcement again.
		delete this.dataset.ready;
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
		// Reduced motion: stories shown, "&" at rest (no drift, full opacity), and the
		// intro NOT faded — the stylesheet pins it visible, so publishing a fade here
		// would fight it.
		if (this.reducedMotion?.matches) {
			this.solid?.style.setProperty("--sh-clip", "0");
			this.ampShift = 0;
			this.amp?.style.setProperty("--sh-amp-shift", "0px");
			this.amp?.style.setProperty("--sh-amp-opacity", "1");
			this.clearSubFade();
			return;
		}

		// 0. The intro fades out over the first sliver of scroll. Published from here
		// rather than by a scroll-timeline: see the long note on .sh__sub in styles.css
		// for why that CSS mechanism failed VISIBLE-side-down on engines without native
		// support. NB opacity ONLY — the sub's MOTION is plain flow layout now, because
		// a JS transform cannot stay in register with a compositor-driven scroll.
		this.updateSubFade();

		// 1. "other stories" reveal: outline→solid wipe over --sh-reveal of pin.
		const revealed = this.revealProgress();
		this.solid?.style.setProperty("--sh-clip", (1 - revealed).toFixed(4));

		// 2. "&" parallax + fade from its own viewport position: drifts DOWN
		// (positive translateY) as it fades to the floor.
		const p = this.ampProgress();
		this.ampShift = StoriesHeadingElement.AMP_PARALLAX * p;
		this.amp?.style.setProperty(
			"--sh-amp-shift",
			`${this.ampShift.toFixed(2)}px`
		);
		// Hold, then dissolve — the same curve the keyframes describe (see AMP_FADE_START).
		const fadeStart = StoriesHeadingElement.AMP_FADE_START;
		const opacity =
			p <= fadeStart ? 1 : 1 - (p - fadeStart) / (1 - fadeStart);
		this.amp?.style.setProperty(
			"--sh-amp-opacity",
			clamp01(opacity).toFixed(4)
		);
	}

	/**
	 * Fade the intro out over the first --sh-sub-fade-px of scroll, and flip visibility
	 * at the end so the invisible block stops taking pointer events.
	 *
	 * OPACITY ONLY. This used to publish a translateY(-scrollY) alongside it, because
	 * the sub was absolutely positioned inside the sticky pin and had to be given back
	 * the ordinary scrolling that position took away. That is now done by flow layout
	 * (see the .sh__sub note in styles.css), and it had to be: a transform written from
	 * a scroll handler runs on the main thread while the scroll itself runs on the
	 * compositor, so on a touch device the element trailed the page by however many
	 * frames the main thread was behind — visible as a laggy, rubber-banding intro that
	 * no optimisation of this handler could have cured. Opacity survives that same lag
	 * gracefully: arriving a frame late reads as a marginally slower fade, not as text
	 * sliding out of register with everything around it.
	 *
	 * Reads the scroll offset from the DOCUMENT rather than the sub's own box: the fade
	 * is anchored to the top of the page, not to the element's travel, and `scrollY` is
	 * the same quantity the old `scroll(root)` timeline read — so the timing is
	 * unchanged from where that mechanism worked.
	 */
	private updateSubFade() {
		const span = this.subFade;
		// A zero/negative span would divide to Infinity; treat it as "no fade".
		if (!(span > 0)) {
			this.clearSubFade();
			return;
		}
		const y = window.scrollY || document.documentElement.scrollTop || 0;
		const p = clamp01(y / span);
		this.sub?.style.setProperty("--sh-sub-opacity", (1 - p).toFixed(4));
		// Only at the very end, matching the old keyframe's discrete visibility step.
		this.sub?.style.setProperty(
			"--sh-sub-visibility",
			p >= 1 ? "hidden" : "visible"
		);
	}

	/** Drop the published fade so the stylesheet's shown-by-default values apply. */
	private clearSubFade() {
		this.sub?.style.removeProperty("--sh-sub-opacity");
		this.sub?.style.removeProperty("--sh-sub-visibility");
	}

	/**
	 * The fade's scroll distance, in px, from --sh-sub-fade-px on .sh__sub.
	 *
	 * Read via the SUB's computed style rather than the host's, because that is where
	 * the property is authored. Not read through cssPx(): that resolves against the
	 * host. Falls back to the authored default if the property is missing or
	 * unparseable (a token typo must degrade to a working fade, not to none).
	 *
	 * Called from measure(), NOT from update(): getComputedStyle forces a style recalc,
	 * and this is a constant between resizes. It was previously read once per frame.
	 */
	private readSubFadePx(): number {
		const DEFAULT = 100;
		if (!this.sub) return DEFAULT;
		const raw = getComputedStyle(this.sub)
			.getPropertyValue("--sh-sub-fade-px")
			.trim();
		if (!raw) return DEFAULT;
		const n = parseFloat(raw);
		return Number.isFinite(n) && n > 0 ? n : DEFAULT;
	}

	/**
	 * --sh-scene-bottom in px, or null when the consumer hasn't set it. It is
	 * usually a calc() of other custom properties, which getComputedStyle hands back
	 * unevaluated, so it is resolved by sizing a throwaway box with it.
	 */
	private readSceneCut(): number | null {
		if (!getComputedStyle(this).getPropertyValue("--sh-scene-bottom").trim()) return null;
		const probe = document.createElement("div");
		probe.style.cssText =
			"position:absolute;visibility:hidden;width:0;height:var(--sh-scene-bottom)";
		this.appendChild(probe);
		const h = probe.getBoundingClientRect().height;
		probe.remove();
		return h;
	}

	/**
	 * Reveal progress 0→1 for the outline→solid wipe, GATED on the dotgrid scene:
	 * the solid layer's opaque --color-bg backdrop would knock a black rectangle out
	 * of the halftone dots, so the wipe stays at 0 until "other stories" has cleared
	 * the scene's bottom edge (where the background is plain --color-bg and the
	 * backdrop is invisible). From that point the wipe plays over --sh-reveal of
	 * further scroll. With no scene present it falls back to the old pin-based
	 * progress so the component still works standalone.
	 */
	private revealProgress(): number {
		if (!this.heading) return 1;
		// Cached in measure(); reading it here meant a getComputedStyle every frame.
		const revealPx = this.revealPx;
		if (revealPx <= 0) return 1;

		// Scene-gated path: the same scroll range as the CSS timeline (--sh-wipe-at).
		// The wipe starts once the scroll has carried the scene's picture — which may
		// end short of its box (--sh-scene-bottom) — up past the pin line, and at once
		// when it already ends above it. Measured as a scroll offset, not as the gap
		// between heading and edge: a picture ending above the resting heading would
		// otherwise start the wipe part-way through.
		if (this.scene && this.pin) {
			const box = this.scene.getBoundingClientRect();
			const sceneBottom = box.top + (this.sceneCut ?? box.height) + window.scrollY;
			const wipeAt = Math.max(0, sceneBottom - this.pinTop);
			return clamp01((window.scrollY - wipeAt) / revealPx);
		}

		// Fallback (no scene): original pin-based progress.
		if (!this.track || !this.pin) return 1;
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
		const end = 0.1 * window.innerHeight; // fully drifted/faded here
		// Begin drifting/fading at 60vh — or at the first pixel of scroll, if the "&"
		// already rests above that (the CSS range's max(0px, …) floor).
		const restTop = this.amp.getBoundingClientRect().top - this.ampShift + window.scrollY;
		const start = Math.max(end + 1, Math.min(0.6 * window.innerHeight, restTop));
		// STRIP THE TRANSFORM WE APPLIED LAST FRAME. getBoundingClientRect() includes it,
		// so feeding the moved position back in makes the parallax damp itself: every
		// pixel of drift pushes the "&" further from the finish line it is measured
		// against, and the effect takes AMP_PARALLAX px of extra scroll to complete.
		// Measured before this: a 450px range played out over 550px — exactly 450 + the
		// 100px of drift — against the CSS path's true 450. Invisible until there was a
		// second implementation to compare with. Same correction as the dock lift in
		// Videos.astro, which strips its own lift for the same reason.
		const ampTop = this.amp.getBoundingClientRect().top - this.ampShift;
		return clamp01((start - ampTop) / (start - end));
	}

	/**
	 * Resolve a CSS length custom property on the host to pixels.
	 *
	 * Only safe for properties authored as a BARE length or a <n>vh-family token:
	 * getComputedStyle does not resolve units (or evaluate calc()) inside a custom
	 * property — it hands back the authored token — so a `calc(...)` value yields NaN
	 * and silently takes the fallback. The fold properties (--sh-top, --sh-hold,
	 * --hero-lead) are now calc() expressions for exactly that reason: they are read
	 * via real box measurements or resolved longhands, never through here. The one
	 * caller is --sh-reveal, which is always plain px.
	 */
	private cssPx(prop: string, fallback: number): number {
		const raw = getComputedStyle(this).getPropertyValue(prop).trim();
		if (!raw) return fallback;
		const vh = /^(-?[\d.]+)(?:s|l|d)?vh$/.exec(raw);
		if (vh) return (parseFloat(vh[1]) / 100) * window.innerHeight;
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
