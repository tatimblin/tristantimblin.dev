// The videos card's script. The dock and the chrome's fade are CSS (videos.css);
// this runs the caption's fades and holds the compact ruler until the dock ends.
import type { VideoCarouselChangeDetail } from "@tristimb/video-carousel";
import { activity } from "@whois/design-system/lib/activity";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

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
 *  and an engine without scroll timelines have no dock to wait for: the card is
 *  in its cell from the start. Delegated, as above: the variant can come later. */
function lockUntilDocked(el: HTMLElement, signal: AbortSignal, reduced: MediaQueryList) {
	const ruler = () => el.querySelector<HTMLElement>(".wx-videos__compact .vc__ruler");
	const timelines = CSS.supports("animation-timeline", "scroll()");
	let past = false;
	const apply = () => {
		const docked = !timelines || reduced.matches || past;
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
}
