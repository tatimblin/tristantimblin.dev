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
// ONE MECHANISM PER ENGINE (the stories-heading pattern; tests/scroll-fallback
// .spec.ts pins both halves). Where scroll timelines exist, all of that is a
// CSS scroll-progress animation in videos.css, sized from the grid's own
// custom properties: no script runs at all, and this module mounts nothing.
// Elsewhere (Firefox) the same arithmetic runs here on scroll, writing
// --vc-dock-lift, and stops once the card has docked until the page is
// scrolled back above the dock.
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

export function mount(el: HTMLElement, ctx: WidgetContext) {
	if (cssDrivesDock()) return;
	const { signal } = ctx;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");

	let travel = 0;
	let range = 0;
	let lift = Number.NaN;

	// The park: videos.css's own --vc-dock-travel, so the two cannot disagree.
	// A calc() of other properties, which getComputedStyle hands back
	// unevaluated, so it is resolved by sizing a throwaway box with it.
	const measure = () => {
		const probe = document.createElement("div");
		probe.setAttribute("aria-hidden", "true");
		probe.style.cssText =
			"position:absolute;visibility:hidden;width:0;height:var(--vc-dock-travel, 0px)";
		el.appendChild(probe);
		travel = probe.getBoundingClientRect().height;
		probe.remove();
		// As the stylesheet's range, min(travel, 100%): the page's end if it comes first.
		const root = document.documentElement;
		range = Math.min(travel, Math.max(0, root.scrollHeight - window.innerHeight));
	};

	// The per-scroll work: one scrollY read and, if it moved, one custom-property
	// write. Nothing at all once docked.
	let pending = false;
	const drive = () => {
		pending = false;
		const next = reduced.matches ? 0 : liftAt(window.scrollY, travel, range);
		if (px(next) === px(lift)) return;
		lift = next;
		el.style.setProperty("--vc-dock-lift", px(next));
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
	};
}
