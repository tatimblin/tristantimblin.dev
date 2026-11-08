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

const CAPTION_FIELDS = "[data-vc-desc], [data-vc-loc], [data-vc-date]";

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

export function mount(el: HTMLElement, ctx: WidgetContext) {
	const { signal } = ctx;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");

	fadeCaptions(el, signal, reduced);
	if (cssDrivesDock()) return;

	let travel = 0;
	let range = 0;
	let run = 0;
	let lift = Number.NaN;
	let chrome = "";

	// A length from videos.css: a calc() of other properties, which
	// getComputedStyle hands back unevaluated, so it is resolved by sizing a
	// throwaway box with it.
	const resolve = (length: string) => {
		const probe = document.createElement("div");
		probe.setAttribute("aria-hidden", "true");
		probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:${length}`;
		el.appendChild(probe);
		const height = probe.getBoundingClientRect().height;
		probe.remove();
		return height;
	};

	// The park and the fade's run: videos.css's own, so the two cannot disagree.
	const measure = () => {
		travel = resolve("var(--vc-dock-travel, 0px)");
		run = resolve("var(--vc-chrome-run, 0px)");
		// As the stylesheet's range, min(travel, 100%): the page's end if it comes first.
		const root = document.documentElement;
		range = Math.min(travel, Math.max(0, root.scrollHeight - window.innerHeight));
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
