// THE DOCK LIFT'S FALLBACK. The card's true layout home is its 1×2 cell; a
// transform only shifts where it PAINTS, so the grid keeps the cell reserved
// and the other widgets flow around it throughout. At rest it is parked in
// the opener's last column, one tile and one gap up, and as the page scrolls
// it drops into the cell (videos.css):
//
//   travel = the card's height + the grid's row gap   // the park
//   q      = clamp01(scrollY / travel)
//   lift   = −travel · (1 − (2q − q²))                 // −travel at rest → 0 docked
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
/** videos.css's cubic-bezier(1/3, 2/3, 2/3, 1). */
const easeOut = (t: number) => t * (2 - t);
const px = (v: number) => `${v.toFixed(2)}px`;

/** Matches the @supports condition in videos.css exactly. */
export const cssDrivesDock = () =>
	typeof CSS !== "undefined" &&
	typeof CSS.supports === "function" &&
	CSS.supports("animation-timeline", "scroll()");

/** The lift at scroll offset `y`, for a park `travel` px up. */
export const liftAt = (y: number, travel: number) =>
	travel > 0 ? -travel * (1 - easeOut(clamp01(y / travel))) : 0;

export function mount(el: HTMLElement, ctx: WidgetContext) {
	if (cssDrivesDock()) return;
	const { signal } = ctx;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");

	let travel = 0;
	let lift = Number.NaN;

	// The park, from layout: the card's own height (offsetHeight ignores the
	// transform) and the row gap above it. The same two numbers videos.css
	// reads from the grid's custom properties.
	const measure = () => {
		const grid = el.parentElement;
		const gap = grid ? parseFloat(getComputedStyle(grid).rowGap) || 0 : 0;
		travel = el.offsetHeight + gap;
	};

	// The per-scroll work: one scrollY read and, if it moved, one custom-property
	// write. Nothing at all once docked.
	let pending = false;
	const drive = () => {
		pending = false;
		const next = reduced.matches ? 0 : liftAt(window.scrollY, travel);
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
			if (lift === 0 && window.scrollY >= travel) return;
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
