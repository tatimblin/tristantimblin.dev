/**
 * Is this element worth working for right now? One answer for every widget.
 *
 * A widget may only do CONTINUOUS work (a frame loop, a ticking clock, a
 * playing video) while it is active. activity(el) says when:
 *
 *   visible  the element is within `margin` of the viewport (an
 *            IntersectionObserver; ONE per distinct margin, shared by every
 *            element that asks for it);
 *   active   visible, and the page is visible (not a background tab);
 *   animate  active, and the visitor has not asked for reduced motion.
 *
 *   const a = activity(el, { signal });
 *   a.subscribe(({ animate }) => (animate ? start() : stop()));
 *
 * subscribe() calls back on the first observation (even when that is "out of
 * view", so a listener learns where the element starts) and on every change
 * after it. Every flag starts false, so nothing runs until the element has
 * been seen. prefs() is the page-wide half on its own (reduced motion,
 * Save-Data, page visibility).
 * Save-Data is reported, not folded in: what it costs (media, prefetch) is the
 * widget's call, as the A-List card's prefetch makes it.
 *
 * arrivals(els, report, options) is the one-shot form, on the same observers:
 * each element is reported once, the first time it comes into view, and the
 * ones the observer reports together arrive together, each with the observer's
 * own rect. A card's entrance rides on it (src/lib/reveal.ts), at its own
 * margin, while the runtime's mount rides on activity() a screen ahead: two
 * subscriptions, one mechanism.
 */

export interface Prefs {
	reducedMotion: boolean;
	saveData: boolean;
	pageVisible: boolean;
}

export interface ActivityState {
	visible: boolean;
	active: boolean;
	animate: boolean;
}

export interface Activity extends ActivityState {
	/** Called on every change of any flag, with the new state. */
	subscribe(listener: (state: ActivityState) => void): () => void;
	/** Stop observing (also on the `signal`'s abort). */
	destroy(): void;
}

export interface ActivityOptions {
	/** IntersectionObserver rootMargin. Default: a quarter screen above and below. */
	margin?: string;
	/** IntersectionObserver threshold. Default: 0, any pixel in view. */
	threshold?: number;
	signal?: AbortSignal;
}

export const DEFAULT_MARGIN = "25% 0px";

/** Where an element was as the observer reported it. */
type Rect = { top: number; left: number };

/** One element's first sighting (arrivals()). */
export interface Arrival {
	el: Element;
	rect: Rect;
}

export interface Arrivals {
	/** Stop waiting for one element. */
	release(el: Element): void;
	/** Stop waiting for all of them (also on the `signal`'s abort). */
	destroy(): void;
}

interface Report {
	target: Element;
	isIntersecting: boolean;
	boundingClientRect?: Rect;
}

/** What the hub needs from the page, swappable for tests. */
export interface ActivityEnv {
	observe(
		margin: string,
		onEntries: (entries: Report[]) => void,
		threshold: number,
	): {
		observe(el: Element): void;
		unobserve(el: Element): void;
		disconnect(): void;
	};
	prefs(): Prefs;
	onPrefsChange(fn: () => void): void;
}

type Listener = (state: ActivityState) => void;

/** Call every listener; one that throws is reported and the rest still hear
 *  the change (a widget's whileActive start runs in here, inside the shared
 *  observer's callback, alongside every other element's). */
function notify<T>(listeners: Iterable<(value: T) => void>, value: T) {
	for (const fn of [...listeners]) {
		try {
			fn(value);
		} catch (error) {
			if (typeof reportError === "function") reportError(error);
			else console.error(error);
		}
	}
}

export function createActivityHub(env: ActivityEnv) {
	interface Seen {
		visible: boolean;
		rect: Rect;
	}
	type Tracker = (seen: Seen) => void;
	interface Shared {
		io: ReturnType<ActivityEnv["observe"]>;
		targets: Map<Element, Set<Tracker>>;
		/** Each target's latest report. */
		last: Map<Element, Seen>;
	}
	const observers = new Map<string, Shared>();
	const prefListeners = new Set<(p: Prefs) => void>();
	let current: Prefs | null = null;
	let watching = false;

	// Cached, and kept current from the moment anything reads it.
	const readPrefs = (): Prefs => {
		watch();
		return (current ??= env.prefs());
	};

	function watch() {
		if (watching) return;
		watching = true;
		env.onPrefsChange(() => {
			const next = env.prefs();
			const prev = current;
			current = next;
			if (
				prev &&
				prev.reducedMotion === next.reducedMotion &&
				prev.saveData === next.saveData &&
				prev.pageVisible === next.pageVisible
			)
				return;
			notify(prefListeners, next);
		});
	}

	function onPrefs(fn: (p: Prefs) => void): () => void {
		watch();
		prefListeners.add(fn);
		return () => prefListeners.delete(fn);
	}

	function shared(key: string, margin: string, threshold: number): Shared {
		let s = observers.get(key);
		if (s) return s;
		const targets = new Map<Element, Set<Tracker>>();
		const last: Shared["last"] = new Map();
		const io = env.observe(
			margin,
			(entries) => {
				for (const entry of entries) {
					const seen = {
						visible: entry.isIntersecting,
						rect: entry.boundingClientRect ?? { top: 0, left: 0 },
					};
					last.set(entry.target, seen);
					notify(targets.get(entry.target) ?? [], seen);
				}
			},
			threshold,
		);
		s = { io, targets, last };
		observers.set(key, s);
		return s;
	}

	function track(el: Element, margin: string, threshold: number, fn: Tracker): () => void {
		const key = `${margin}|${threshold}`;
		const s = shared(key, margin, threshold);
		let set = s.targets.get(el);
		if (!set) {
			set = new Set();
			s.targets.set(el, set);
			s.io.observe(el);
		} else if (s.last.has(el)) {
			// Already observed and reported: the observer will not report it
			// again until it changes, so hand the newcomer the last report (after
			// the caller has had a chance to subscribe).
			queueMicrotask(() => {
				const seen = s.last.get(el);
				if (seen && s.targets.get(el)?.has(fn)) fn(seen);
			});
		}
		set.add(fn);
		return () => {
			const live = s.targets.get(el);
			if (!live?.delete(fn) || live.size > 0) return;
			s.targets.delete(el);
			s.last.delete(el);
			s.io.unobserve(el);
			if (s.targets.size === 0) {
				s.io.disconnect();
				observers.delete(key);
			}
		};
	}

	/**
	 * The one-shot form: `report` runs once per observer report touching any of
	 * `els`, after the whole report has been read, with the elements it brought
	 * into view (already released). The list can be empty: a report of elements
	 * still out of view, the moment to look for any a jump carried past.
	 */
	function arrivals(
		els: Iterable<Element>,
		report: (arrived: Arrival[]) => void,
		options: ActivityOptions = {},
	): Arrivals {
		const { margin = DEFAULT_MARGIN, threshold = 0, signal } = options;
		const stops = new Map<Element, () => void>();
		let batch: Arrival[] | null = null;

		const release = (el: Element) => {
			stops.get(el)?.();
			stops.delete(el);
		};
		const destroy = () => {
			for (const stop of stops.values()) stop();
			stops.clear();
			signal?.removeEventListener("abort", destroy);
		};

		if (signal?.aborted) return { release, destroy };
		for (const el of els) {
			stops.set(
				el,
				track(el, margin, threshold, ({ visible, rect }) => {
					if (!batch) {
						batch = [];
						// A microtask runs once the observer's callback has returned, so
						// everything it reported in one go lands in this one list.
						queueMicrotask(() => {
							const arrived = batch ?? [];
							batch = null;
							if (!signal?.aborted) report(arrived);
						});
					}
					if (!visible) return;
					batch.push({ el, rect });
					release(el);
				}),
			);
		}
		signal?.addEventListener("abort", destroy, { once: true });
		return { release, destroy };
	}

	function activity(el: Element, options: ActivityOptions = {}): Activity {
		const { margin = DEFAULT_MARGIN, threshold = 0, signal } = options;
		const listeners = new Set<Listener>();
		let visible = false;
		let observed = false;
		let state: ActivityState = { visible: false, active: false, animate: false };

		const update = (first = false) => {
			const p = readPrefs();
			const active = visible && p.pageVisible;
			const next = { visible, active, animate: active && !p.reducedMotion };
			if (
				!first &&
				next.visible === state.visible &&
				next.active === state.active &&
				next.animate === state.animate
			)
				return;
			state = next;
			notify(listeners, state);
		};

		let stopTrack: (() => void) | null = null;
		let stopPrefs: (() => void) | null = null;
		const destroy = () => {
			stopTrack?.();
			stopPrefs?.();
			stopTrack = stopPrefs = null;
			listeners.clear();
			signal?.removeEventListener("abort", destroy);
		};

		if (!signal?.aborted) {
			stopTrack = track(el, margin, threshold, (seen) => {
				visible = seen.visible;
				update(!observed);
				observed = true;
			});
			stopPrefs = onPrefs(() => update());
			signal?.addEventListener("abort", destroy, { once: true });
		}

		return {
			get visible() {
				return state.visible;
			},
			get active() {
				return state.active;
			},
			get animate() {
				return state.animate;
			},
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			destroy,
		};
	}

	return {
		activity,
		arrivals,
		prefs: readPrefs,
		/** Observers alive right now, one per margin and threshold (for tests). */
		observerCount: () => observers.size,
	};
}

function browserEnv(): ActivityEnv {
	const motion = matchMedia("(prefers-reduced-motion: reduce)");
	type Connection = EventTarget & { saveData?: boolean };
	const connection = (navigator as Navigator & { connection?: Connection }).connection;
	return {
		observe(margin, onEntries, threshold) {
			return new IntersectionObserver(onEntries, { rootMargin: margin, threshold });
		},
		prefs: () => ({
			reducedMotion: motion.matches,
			saveData: connection?.saveData === true,
			pageVisible: document.visibilityState !== "hidden",
		}),
		onPrefsChange(fn) {
			motion.addEventListener("change", fn);
			document.addEventListener("visibilitychange", fn);
			connection?.addEventListener?.("change", fn);
		},
	};
}

let hub: ReturnType<typeof createActivityHub> | null = null;
const page = () => (hub ??= createActivityHub(browserEnv()));

/** Watch whether `el` is worth working for (see the top of this file). */
export function activity(el: Element, options?: ActivityOptions): Activity {
	return page().activity(el, options);
}

/** Report each of `els` once, as it first comes into view (the top of this file). */
export function arrivals(
	els: Iterable<Element>,
	report: (arrived: Arrival[]) => void,
	options?: ActivityOptions,
): Arrivals {
	return page().arrivals(els, report, options);
}

/** The page-wide preferences: reduced motion, Save-Data, page visibility. */
export function prefs(): Prefs {
	return page().prefs();
}
