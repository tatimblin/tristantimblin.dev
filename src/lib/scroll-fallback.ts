// THE OPENER'S SCROLL EFFECTS WHERE CSS SCROLL TIMELINES ARE MISSING (Firefox
// release ships `animation-timeline` behind a pref). The stylesheets gate their
// scroll-driven animations behind `@supports (animation-timeline: scroll())`,
// and without this an engine outside the gate gets the static state: the word
// solid from the first frame and the videos card already in its cell, under the
// fold. This plays the same animations from a scroll listener instead: each is
// a paused Web Animation whose currentTime is the scroll's progress through its
// range, with the keyframes and ranges the stylesheets state, resolved to px.
//
// THE ARMING. The inline script in HomeLayout's head puts .scroll-fallback on
// <html> before first paint, under which the stylesheets hold the first frame
// (the word unwiped, the card parked, the chrome off) until this takes over.
// Engines with scroll timelines never arm it, so they never run any of this.
//
// Main-thread, unlike the CSS: on a touch scroll it can trail the page by a
// frame. Reduced motion never applies it, as it never applies the CSS.

const DURATION = 1000;
const FALLBACK = "scroll-fallback";

interface Effect {
	el: Element;
	animation: Animation;
	start: number;
	end: number;
}

/** A length from the stylesheets: a calc() of other properties, which
 *  getComputedStyle hands back unevaluated, so it is resolved by sizing a
 *  throwaway box with it. */
function resolveLength(el: Element, length: string) {
	const probe = document.createElement("div");
	probe.setAttribute("aria-hidden", "true");
	probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:${length}`;
	el.appendChild(probe);
	const height = probe.getBoundingClientRect().height;
	probe.remove();
	return height;
}

function maxScroll() {
	return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

const screenMotion = "screen and (prefers-reduced-motion: no-preference)";
const motion = "(prefers-reduced-motion: no-preference)";

/** Each effect, as its stylesheet has it: where it applies, its keyframes and
 *  its range on the page's scroll. */
function build(): Effect[] {
	const effects: Effect[] = [];
	const add = (
		el: Element,
		keyframes: Keyframe[],
		start: number,
		end: number,
		easing = "linear",
	) => {
		const animation = el.animate(keyframes, { duration: DURATION, fill: "both", easing });
		animation.pause();
		effects.push({ el, animation, start, end });
	};

	// theme/stories-heading/src/styles.css: the drift, the wipe and the fade.
	if (matchMedia(screenMotion).matches) {
		for (const host of document.querySelectorAll("stories-heading")) {
			const pinAt = resolveLength(host, "var(--sh-pin-at, 0px)");
			const pinnedAt = resolveLength(host, "var(--sh-pinned-at, 0px)");
			const reveal = resolveLength(host, "var(--sh-reveal, 0px)");
			const rate = parseFloat(getComputedStyle(host).getPropertyValue("--sh-drift-rate")) || 0.15;
			const word = host.querySelector(".sh__wordmark");
			if (word && pinnedAt > 0) {
				add(
					word,
					[
						{ transform: "translateY(0px)", offset: 0 },
						{ transform: `translateY(${(1 - rate) * pinAt}px)`, offset: rate },
						{ transform: "translateY(0px)", offset: 1 },
					],
					0,
					pinnedAt,
				);
			}
			const solid = host.querySelector(".sh__solid");
			if (solid) {
				add(
					solid,
					[{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
					pinnedAt,
					pinnedAt + reveal,
				);
			}
			const sub = host.querySelector(".sh__sub");
			if (sub) {
				add(
					sub,
					[
						{ opacity: 1, visibility: "visible", offset: 0 },
						{ visibility: "visible", offset: 0.999 },
						{ opacity: 0, visibility: "hidden", offset: 1 },
					],
					0,
					resolveLength(sub, "var(--sh-sub-fade-px, 100px)"),
				);
			}
		}
	}

	// HomeLayout.astro: the phone's clip fades as it scrolls up.
	if (matchMedia(`${screenMotion} and (max-width: 900px)`).matches) {
		for (const clip of document.querySelectorAll(".home__clip")) {
			const end = resolveLength(
				clip,
				"calc(var(--site-header-h) + var(--home-lead) + var(--home-center-drop) + var(--home-clip-h))",
			);
			add(clip, [{ opacity: 1 }, { opacity: 0 }], 0, end);
		}
	}

	// src/widgets/videos/videos.css: the dock, then the chrome over its end.
	if (matchMedia(motion).matches) {
		for (const card of document.querySelectorAll(".wx-videos")) {
			const travel = resolveLength(card, "var(--vc-dock-travel, 0px)");
			const run = resolveLength(card, "var(--vc-chrome-run, 0px)");
			const end = Math.min(travel, maxScroll());
			add(
				card,
				[{ transform: `translateY(${-travel}px)` }, { transform: "translateY(0px)" }],
				0,
				end,
				"cubic-bezier(0.3333333333, 0.5, 0.6666666667, 1)",
			);
			if (!matchMedia(screenMotion).matches) continue;
			const chrome = card.querySelectorAll(
				".wx-videos__compact .wx-videos__chrome, .wx-videos__compact .vc__ruler" +
					(card.matches(":focus-within")
						? ""
						: ", .wx-videos__wide .wx-videos__surface, .wx-videos__wide .wx-videos__date"),
			);
			for (const el of chrome) {
				add(el, [{ opacity: 0 }, { opacity: 1 }], Math.max(0, end - run), end);
			}
		}
	}
	return effects;
}

let effects: Effect[] = [];
let frame = 0;
let stale = false;

function update() {
	const y = window.scrollY;
	for (const { animation, start, end } of effects) {
		const p = end > start ? (y - start) / (end - start) : y >= end ? 1 : 0;
		animation.currentTime = Math.min(1, Math.max(0, p)) * DURATION;
	}
}

function rebuild() {
	for (const { animation } of effects) animation.cancel();
	effects = document.documentElement.classList.contains(FALLBACK) ? build() : [];
	update();
}

/** One frame's work: a rebuild if the geometry or focus changed, then the
 *  scroll position. */
function schedule(rebuilding = false) {
	stale ||= rebuilding;
	if (frame) return;
	frame = requestAnimationFrame(() => {
		frame = 0;
		if (stale) {
			stale = false;
			rebuild();
		} else update();
	});
}

let listening = false;

export function initScrollFallback() {
	const root = document.documentElement;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	const supported =
		!CSS.supports("animation-timeline", "scroll()") &&
		typeof Element.prototype.animate === "function" &&
		document.querySelector("stories-heading") !== null;
	root.classList.toggle(FALLBACK, supported && !reduced.matches);
	rebuild();
	if (!supported || listening) return;
	listening = true;
	window.addEventListener("scroll", () => schedule(), { passive: true });
	window.addEventListener("resize", () => schedule(true), { passive: true });
	// The page's height caps the dock's range; cards that load later change it.
	new ResizeObserver(() => schedule(true)).observe(document.body);
	// The wide card's text-only fade is off while it holds focus (videos.css).
	document.addEventListener("focusin", () => schedule(true));
	document.addEventListener("focusout", () => schedule(true));
	reduced.addEventListener("change", () => {
		root.classList.toggle(
			FALLBACK,
			!reduced.matches && document.querySelector("stories-heading") !== null,
		);
		rebuild();
	});
}
