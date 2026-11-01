/**
 * Every halftone pauses while the tab is hidden.
 *
 * <dotted-grid> (and the <video-carousel>'s stage, which is one) plays its
 * video and draws each decoded frame (requestVideoFrameCallback) whenever it is
 * on screen, but it cannot see the page's visibility: in a background tab the
 * video keeps decoding with nobody to watch it. Its `paused` attribute stops
 * both, and taking it off resumes from the same frame, so this sets it on
 * every halftone while the page is hidden and takes it off again on return —
 * only on those it paused itself (one authored `paused` stays paused).
 * The perf budget "a hidden tab" (tests/perf/idle.spec.ts) holds it.
 */
const MARK = "data-paused-hidden";

function sync() {
	const hidden = document.visibilityState === "hidden";
	for (const grid of document.querySelectorAll("dotted-grid")) {
		if (hidden) {
			if (grid.hasAttribute("paused")) continue;
			grid.setAttribute(MARK, "");
			grid.setAttribute("paused", "");
		} else if (grid.hasAttribute(MARK)) {
			grid.removeAttribute(MARK);
			grid.removeAttribute("paused");
		}
	}
}

let started = false;

/** Once per document: the listener outlives every view-transition swap. */
export function pauseHalftonesWhileHidden() {
	if (started) return;
	started = true;
	document.addEventListener("visibilitychange", sync);
	// A tab opened in the background starts hidden, with no event to say so.
	if (document.visibilityState === "hidden") sync();
}
