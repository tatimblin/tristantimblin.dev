// THE DOCK LIFT'S FALLBACK. The card's true layout home is its 1×2 cell; a
// transform only shifts where it PAINTS, so the grid keeps the cell reserved
// and the other widgets flow around it throughout. At rest it is parked in
// the opener's centred group, and as the page scrolls it comes down into the
// cell (videos.css):
//
//   travel = --vc-dock-travel                          // the park
//   range  = min(travel, the page's whole scroll)      // where it lands
//   q      = clamp01(scrollY / range)
//   lift   = −travel · (1 − (1.5q − 0.5q³))            // −travel at rest → 0 docked
//
// THE CHROME's opacity comes up over the end of that same range (--vc-chrome-run
// of scroll, ending at `range`).
//
// ONE MECHANISM PER ENGINE (the stories-heading pattern; tests/scroll-fallback
// .spec.ts pins both halves). Where scroll timelines exist, all of that is a
// CSS scroll-progress animation in videos.css, sized from the grid's own
// custom properties: no scroll work runs here, only the caption's fade, on a
// clip change. Elsewhere (Firefox) the same arithmetic runs here on scroll,
// writing --vc-dock-lift and --vc-chrome, and stops once the card has docked
// until the page is scrolled back above the dock.
import type { VideoCarouselChangeDetail } from "@tristimb/video-carousel";
import { activity } from "@whois/design-system/lib/activity";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** videos.css's cubic-bezier(1/3, 1/2, 2/3, 1). */
const easeOut = (t: number) => 1.5 * t - 0.5 * t * t * t;
const px = (v: number) => `${v.toFixed(2)}px`;

/** Matches the @supports condition in videos.css exactly. */
export const cssDrivesDock = () =>
	typeof CSS !== "undefined" &&
	typeof CSS.supports === "function" &&
	CSS.supports("animation-timeline", "scroll()");

/** The lift at scroll offset `y`, for a park `travel` px up, docking over
 *  `range` px of scroll. */
export const liftAt = (y: number, travel: number, range = travel) =>
	travel > 0 && range > 0 ? -travel * (1 - easeOut(clamp01(y / range))) : 0;

/** The chrome's opacity at scroll offset `y`: 0 until `run` px before the dock
 *  ends at `range`, 1 from there on. Fully shown when there is no range at all
 *  (nothing to dock over), and a page shorter than `run` fades over what it has. */
export const chromeAt = (y: number, range: number, run = 48) => {
	if (range <= 0) return 1;
	const start = Math.max(0, range - run);
	return clamp01((y - start) / (range - start));
};

/** The fields the caption fade replays. The compact footer's line is not one: it
 *  has its own sequence, below. */
const CAPTION_FIELDS = [
	"[data-vc-desc]",
	"[data-vc-loc]:not(.wx-videos__line *)",
	"[data-vc-date]:not(.wx-videos__line *)",
].join();

/** The caption's fields rise in as a clip changes. The element has already
 *  written the new text; no timer, on the compositor, nothing under reduced
 *  motion. Delegated: a Deferred variant can arrive after mount. */
function fadeCaptions(el: HTMLElement, signal: AbortSignal, reduced: MediaQueryList) {
	let running: Animation[] = [];
	const stop = () => {
		running.forEach((a) => a.cancel());
		running = [];
	};
	el.addEventListener(
		"video-carousel:change",
		(event) => {
			const { detail, target } = event as CustomEvent<VideoCarouselChangeDetail>;
			// `change` also fires at connect, with changed: false.
			if (!detail.changed || reduced.matches) return;
			stop();
			running = Array.from((target as HTMLElement).querySelectorAll(CAPTION_FIELDS)).map((field) =>
				field.animate(
					{ opacity: [0, 1], translate: ["0 3px", "0 0"] },
					// --duration-swap, --ease-reveal.
					{ duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
				),
			);
		},
		{ signal },
	);
	signal.addEventListener("abort", stop, { once: true });
}

/** The compact footer's one line, ms: the date comes up, holds, and hands back to
 *  the location over the end of the clip's 1.6s dissolve. */
const LINE_IN = 140;
const LINE_HOLD = 1000;
const LINE_OUT = 260;
const LINE_ALL = LINE_IN + LINE_HOLD + LINE_OUT;

/** The date for a second when a clip changes, held for as long as a scrub lasts,
 *  then the location. All of it is the delay inside a Web Animation on opacity:
 *  no timer to clear, and fill none, so a cancelled sequence (a new change, a
 *  scrub, a navigation) falls back to the CSS resting state. Scrolling never
 *  starts it, so the first fade-in shows the location. Delegated, as above. */
function swapDateAndPlace(el: HTMLElement, signal: AbortSignal, reduced: MediaQueryList) {
	let running: Animation[] = [];
	const stop = () => {
		running.forEach((a) => a.cancel());
		running = [];
	};
	const parts = (host: HTMLElement) => {
		const line = host.querySelector<HTMLElement>(".wx-videos__line");
		const date = line?.querySelector<HTMLElement>("[data-vc-date]");
		const loc = line?.querySelector<HTMLElement>("[data-vc-loc]");
		return line && date && loc ? { line, date, loc } : null;
	};
	const flash = (date: HTMLElement, loc: HTMLElement, hasLocation: boolean) => {
		stop();
		if (!hasLocation) return; // the CSS keeps the date on
		// Per keyframe, so under reduced motion each step is a cut rather than the
		// whole sequence jumping to its end.
		const easing = reduced.matches ? "step-end" : "linear";
		running = [
			date.animate(
				[
					{ opacity: 0, easing },
					{ opacity: 1, offset: LINE_IN / LINE_ALL, easing },
					{ opacity: 1, offset: (LINE_IN + LINE_HOLD) / LINE_ALL, easing },
					{ opacity: 0 },
				],
				{ duration: LINE_ALL },
			),
			loc.animate(
				[
					{ opacity: 0, easing },
					{ opacity: 0, offset: (LINE_IN + LINE_HOLD) / LINE_ALL, easing },
					{ opacity: 1 },
				],
				{ duration: LINE_ALL },
			),
		];
	};

	el.addEventListener(
		"video-carousel:scrubstart",
		(event) => {
			const found = parts(event.target as HTMLElement);
			if (!found) return;
			stop();
			found.line.dataset.scrub = "";
		},
		{ signal },
	);
	el.addEventListener(
		"video-carousel:scrubend",
		(event) => {
			const found = parts(event.target as HTMLElement);
			if (!found) return;
			delete found.line.dataset.scrub;
			flash(found.date, found.loc, Boolean(found.loc.textContent));
		},
		{ signal },
	);
	el.addEventListener(
		"video-carousel:change",
		(event) => {
			const { detail, target } = event as CustomEvent<VideoCarouselChangeDetail>;
			const found = parts(target as HTMLElement);
			if (!found || !detail.changed || "scrub" in found.line.dataset) return;
			flash(found.date, found.loc, Boolean(detail.clip.loc));
		},
		{ signal },
	);
	signal.addEventListener("abort", stop, { once: true });
}

/** ANYWHERE THE VIEWPORT'S TOP HAS NOT PASSED: a root that runs down the page
 *  from the viewport, so a target is "out of view" only once it is above it. */
const BELOW_THE_FOLD = "0px 0px 100000px 0px";

/** A length from videos.css: a calc() of other properties, which
 *  getComputedStyle hands back unevaluated, so it is resolved by sizing a
 *  throwaway box with it. */
function resolveLength(el: HTMLElement, length: string) {
	const probe = document.createElement("div");
	probe.setAttribute("aria-hidden", "true");
	probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:${length}`;
	el.appendChild(probe);
	const height = probe.getBoundingClientRect().height;
	probe.remove();
	return height;
}

/** The park and where the dock lands: the stylesheet's own lengths and range,
 *  min(travel, 100%), so the page's end if it comes first. */
function dockSpan(el: HTMLElement) {
	const travel = resolveLength(el, "var(--vc-dock-travel, 0px)");
	const root = document.documentElement;
	return { travel, range: Math.min(travel, Math.max(0, root.scrollHeight - window.innerHeight)) };
}

/** THE COMPACT RULER TAKES INPUT ONLY ONCE DOCKED. A sentinel in the page at the
 *  dock's end, on the shared observers (a root that runs down the page, so it is
 *  out of view only once scrolled above the top): no work per scroll, in every
 *  engine, at the moment the chrome has finished. `inert` keeps the slider out
 *  of the tab order and away from assistive tech while floating. Reduced motion
 *  has no dock to wait for. Delegated, as above: the variant can come later. */
function lockUntilDocked(el: HTMLElement, signal: AbortSignal, reduced: MediaQueryList) {
	const ruler = () => el.querySelector<HTMLElement>(".wx-videos__compact .vc__ruler");
	let past = false;
	const apply = () => {
		const docked = reduced.matches || past;
		el.toggleAttribute("data-vc-docked", docked);
		const r = ruler();
		if (r) r.inert = !docked;
	};
	let sentinel: HTMLElement | null = null;
	const place = () => {
		if (!sentinel) return;
		// A pixel short of the end, so the crossing lands on the dock's last pixel,
		// not one after it (an edge-adjacent box still counts as intersecting).
		const { range } = dockSpan(el);
		sentinel.style.top = `${Math.max(0, range - 2)}px`;
	};
	const start = () => {
		if (sentinel) return apply();
		if (!ruler()) return;
		sentinel = document.createElement("div");
		sentinel.setAttribute("aria-hidden", "true");
		sentinel.style.cssText = "position:absolute;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden";
		place();
		document.body.appendChild(sentinel);
		apply();
		activity(sentinel, { margin: BELOW_THE_FOLD, signal }).subscribe(({ visible }) => {
			past = !visible;
			apply();
		});
	};
	el.addEventListener("video-carousel:ready", start, { signal });
	window.addEventListener("resize", place, { passive: true, signal });
	reduced.addEventListener("change", apply, { signal });
	signal.addEventListener("abort", () => sentinel?.remove(), { once: true });
	start();
}

export function mount(el: HTMLElement, ctx: WidgetContext) {
	const { signal } = ctx;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");

	fadeCaptions(el, signal, reduced);
	swapDateAndPlace(el, signal, reduced);
	lockUntilDocked(el, signal, reduced);
	if (cssDrivesDock()) return;

	let travel = 0;
	let range = 0;
	let run = 0;
	let lift = Number.NaN;
	let chrome = "";

	// The park and the fade's run: videos.css's own, so the two cannot disagree.
	const measure = () => {
		({ travel, range } = dockSpan(el));
		run = resolveLength(el, "var(--vc-chrome-run, 0px)");
	};

	// The per-scroll work: one scrollY read and, if it moved, a custom-property
	// write or two. Nothing at all once docked (the chrome is on by then).
	let pending = false;
	const drive = () => {
		pending = false;
		const y = window.scrollY;
		const nextLift = reduced.matches ? 0 : liftAt(y, travel, range);
		if (px(nextLift) !== px(lift)) {
			lift = nextLift;
			el.style.setProperty("--vc-dock-lift", px(nextLift));
		}
		const nextChrome = (reduced.matches ? 1 : chromeAt(y, range, run)).toFixed(3);
		if (nextChrome !== chrome) {
			chrome = nextChrome;
			el.style.setProperty("--vc-chrome", nextChrome);
		}
	};
	const schedule = () => {
		if (pending) return;
		pending = true;
		ctx.frame(() => {
			drive();
			return false;
		});
	};
	const remeasure = () => {
		measure();
		schedule();
	};

	window.addEventListener("resize", remeasure, { passive: true, signal });
	reduced.addEventListener("change", schedule, { signal });
	window.addEventListener(
		"scroll",
		() => {
			// Docked and still below the dock: nothing can change.
			if (lift === 0 && window.scrollY >= range) return;
			schedule();
		},
		{ passive: true, signal },
	);

	// Now, synchronously: the stylesheet's park is the same number, so this
	// write moves nothing at rest; it hands the lift over to the scroll.
	measure();
	drive();

	return () => {
		el.style.removeProperty("--vc-dock-lift");
		el.style.removeProperty("--vc-chrome");
	};
}
