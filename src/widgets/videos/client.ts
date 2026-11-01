// THE DOCK LIFT. Its true layout home is the 1×2 grid cell at the foot of the
// page; a transform only shifts where it PAINTS, so the grid keeps the cell
// reserved and the other widgets flow around it throughout.
//
// The parallax runs from PAGE LOAD to the dock. On load the card waits just
// under the fold — out of sight, so the hero's frame is the whole first screen
// — and as the page scrolls it rises through the empty column beside the copy,
// easing to 0 lift as its slot reaches the dock line, where it pins to the grid.
//
//   slotY      = the slot's document top        // from layout offsets, transform-free
//   span       = slotY − DOCK_VH · vh            // the scroll over which it docks
//   travel     = slotY − vh                      // lift that parks the card ON the fold at scroll 0
//   q          = clamp01(scrollY / span)
//   lift       = −travel · (1 − smoothstep(q))   // −travel at load → 0 at the dock
//
// slotY ignores transforms (see docTop) so the lift never feeds back.
// smoothstep's slope is 0 at both ends and peaks at 1.5 in the middle: the
// card starts moving with the page, PINS hardest mid-way, and eases back to
// 1:1 as it settles — no velocity jump at either end. The pin depth is
// 1 − 1.5·travel/span, positive while travel/span < 2/3 — the card always
// moves up the screen, never stalls or reverses. That ratio grows with the
// slot's depth (2/3 at ~2.4 viewports down), so travel is capped at
// MAX_TRAVEL_RATIO of the span: a deeper slot then starts the card further
// below the fold — still out of sight — rather than letting the drift outrun
// the scroll.
//
// ONE MECHANISM PER ENGINE (the stories-heading pattern; tests/scroll-fallback
// .spec.ts pins both halves). Where scroll timelines exist, the lift is a CSS
// scroll-progress animation (videos.css): this module only MEASURES — span and
// travel, on load and whenever the page reflows — and the compositor does the
// rest, with no script on scroll at all. Elsewhere (Firefox) the same
// arithmetic runs here on scroll, writing --vc-dock-lift, and stops once the
// card has docked until the page is scrolled back above the dock line.
import { WIDGET_COMPACT_MQ } from "@whois/design-system/lib/breakpoints";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

const DOCK_VH = 0.3; // the cell's viewport top (vh) once fully docked
// Cap on travel/span, so the eased drift can never outrun the scroll (pin
// depth 1 − 1.5·ratio stays ≥ 0.1).
const MAX_TRAVEL_RATIO = 0.6;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const px = (v: number) => `${v.toFixed(2)}px`;

/** Matches the @supports condition in videos.css exactly. */
export const cssDrivesDock = () =>
	typeof CSS !== "undefined" &&
	typeof CSS.supports === "function" &&
	CSS.supports("animation-timeline", "scroll()");

/**
 * The slot's top in document space, from LAYOUT offsets: they ignore every
 * transform, so neither the lift nor the reveal's entrance `translate` (a
 * 16px rise that is mid-flight while the page settles) can skew where the
 * card is parked.
 */
function docTop(el: HTMLElement): number {
	let y = 0;
	for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
	return y;
}

/** The dock's geometry for a slot at `slotY` in a viewport `vh` tall. */
export function dockGeometry(slotY: number, vh: number) {
	const span = Math.max(1, slotY - DOCK_VH * vh);
	const travel = Math.min(Math.max(0, slotY - vh), MAX_TRAVEL_RATIO * span);
	return { span, travel };
}

/** The lift at scroll offset `y`. */
export const liftAt = (y: number, { span, travel }: { span: number; travel: number }) =>
	-travel * (1 - smoothstep(clamp01(y / span)));

export function mount(el: HTMLElement, ctx: WidgetContext) {
	const { signal } = ctx;
	const css = cssDrivesDock();
	// The grid's compact step (two columns), where the card is hidden and the
	// carousel is the hero scene instead — no lift there; nor under reduced
	// motion. (The CSS path gates on the same two queries.)
	const compact = matchMedia(WIDGET_COMPACT_MQ);
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	const still = () => compact.matches || reduced.matches;

	let geo = { span: 1, travel: 0 };
	let lift = 0;
	let written = { span: "", travel: "" };

	const setLift = (v: number) => {
		lift = v;
		el.style.setProperty("--vc-dock-lift", px(v));
	};

	// The fallback's per-scroll work: one scrollY read and, if it moved, one
	// custom-property write. Nothing at all once docked.
	let pending = false;
	const drive = () => {
		pending = false;
		if (still()) {
			if (lift !== 0) setLift(0);
			return;
		}
		const next = liftAt(window.scrollY, geo);
		if (px(next) !== px(lift)) setLift(next);
	};
	const schedule = () => {
		if (pending) return;
		pending = true;
		ctx.frame(() => {
			drive();
			return false;
		});
	};

	// Read the slot (layout), then write the numbers the lift is drawn from.
	const measure = () => {
		geo = dockGeometry(docTop(el), window.innerHeight);
		if (css) {
			const next = { span: px(geo.span), travel: px(geo.travel) };
			if (next.span === written.span && next.travel === written.travel) return;
			written = next;
			ctx.frame(
				() => {
					el.style.setProperty("--vc-dock-span", next.span);
					el.style.setProperty("--vc-dock-travel", next.travel);
					el.dataset.dock = "";
					return false;
				},
				{ phase: "write" },
			);
		} else {
			schedule();
		}
	};
	let measuring = false;
	const remeasure = () => {
		if (measuring) return;
		measuring = true;
		ctx.frame(
			() => {
				measuring = false;
				measure();
				return false;
			},
			{ phase: "read" },
		);
	};

	// The slot moves when the page above it reflows (fonts landing, the hero
	// settling its fold, a card mounting) with no scroll or resize to say so,
	// and the card's rest position is derived from the slot — so watch the
	// page too, but only while the card is active: on screen (where it is
	// from the first frame on desktop, parked at the fold) in a visible tab.
	// Hidden on a phone, or in a background tab, nothing is watched; coming
	// back, the observer's first report measures again, so a reflow missed
	// meanwhile is caught before the card is seen.
	const ro = new ResizeObserver(remeasure);
	ctx.whileActive(() => {
		ro.observe(document.body);
		return () => ro.disconnect();
	});
	window.addEventListener("resize", remeasure, { passive: true, signal });
	compact.addEventListener("change", remeasure, { signal });
	reduced.addEventListener("change", remeasure, { signal });
	if (!css) {
		window.addEventListener(
			"scroll",
			() => {
				// Docked and still below the dock line: nothing can change.
				if (lift === 0 && window.scrollY >= geo.span) return;
				schedule();
			},
			{ passive: true, signal },
		);
	}

	// Now, synchronously: the card must be parked before the page can scroll.
	geo = dockGeometry(docTop(el), window.innerHeight);
	if (css) {
		written = { span: px(geo.span), travel: px(geo.travel) };
		el.style.setProperty("--vc-dock-span", written.span);
		el.style.setProperty("--vc-dock-travel", written.travel);
		el.dataset.dock = "";
	} else {
		drive();
	}

	return () => {
		el.style.removeProperty("--vc-dock-lift");
		el.style.removeProperty("--vc-dock-span");
		el.style.removeProperty("--vc-dock-travel");
		delete el.dataset.dock;
	};
}
