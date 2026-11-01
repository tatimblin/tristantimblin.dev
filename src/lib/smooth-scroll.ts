/**
 * Lenis, on the page's frame scheduler, and only while it is smoothing.
 *
 * Lenis advances its scroll animation from raf(time), and its own advice is to
 * call that every frame forever — a frame loop that never idles, for a page
 * that is mostly sitting still. But Lenis only ever MOVES while an animation
 * is running, and every one starts from a wheel event (its virtual scroll) or
 * a scrollTo(); a native scroll (keys, the scrollbar) it follows from the
 * scroll event, with no frame needed. So the loop is woken by those two and
 * runs, in the scheduler's `scroll` phase (before anything measures), until
 * Lenis reports it has settled; then it unregisters, and the page asks for no
 * frames on its behalf.
 *
 * The feel is unchanged: the same lerp, the same easing, the same raf(time)
 * per frame. The one thing an always-on loop did that a woken one would not
 * is know the previous frame's time — Lenis integrates over the time since its
 * last raf(), and after a pause that would be the whole pause, which would
 * finish a smooth scroll in one jump. So the first frame after waking hands
 * Lenis the display's frame interval as its delta, exactly what the always-on
 * loop gave it (measured as the shortest frame the loop has run; the very
 * first scroll of a visit, before there is a measurement, starts a frame
 * later instead of guessing).
 */
import type Lenis from "lenis";
import { onFrame } from "@whois/design-system/lib/frame";

/** Frames shorter than this are not the display's interval (a stray early
 *  callback), so they never lower the estimate. */
const MIN_INTERVAL = 4;

export function driveLenis(lenis: Lenis): () => void {
	let stop: (() => void) | null = null;
	/** The shortest frame interval seen: the display's refresh. Unknown until
	 *  the loop has run two frames in a row. */
	let interval = Infinity;
	let fresh = false;

	const tick = (time: number, delta: number) => {
		if (fresh) {
			fresh = false;
			// Before the refresh is known (the first scroll of the visit), this
			// frame only starts the clock: Lenis advances by a true interval
			// from the next one, a frame later, rather than by a guess.
			lenis.time = Number.isFinite(interval) ? time - interval : time;
		} else if (delta >= MIN_INTERVAL) {
			interval = Math.min(interval, delta);
		}
		lenis.raf(time);
		if (lenis.isScrolling === "smooth") return true;
		stop = null;
		return false;
	};

	const wake = () => {
		if (stop) return;
		fresh = true;
		stop = onFrame(tick, { phase: "scroll", label: "lenis" });
	};

	const scrollTo = lenis.scrollTo.bind(lenis);
	lenis.scrollTo = (...args: Parameters<Lenis["scrollTo"]>) => {
		scrollTo(...args);
		wake();
	};
	window.addEventListener("wheel", wake, { passive: true });

	return () => {
		window.removeEventListener("wheel", wake);
		lenis.scrollTo = scrollTo;
		stop?.();
		stop = null;
	};
}
