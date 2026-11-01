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
	signal?: AbortSignal;
}

export const DEFAULT_MARGIN = "25% 0px";

/** What the hub needs from the page, swappable for tests. */
export interface ActivityEnv {
	observe(margin: string, onEntries: (entries: { target: Element; isIntersecting: boolean }[]) => void): {
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
	interface Shared {
		io: ReturnType<ActivityEnv["observe"]>;
		targets: Map<Element, Set<(visible: boolean) => void>>;
		/** Each target's latest report. */
		last: Map<Element, boolean>;
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

	function shared(margin: string): Shared {
		let s = observers.get(margin);
		if (s) return s;
		const targets = new Map<Element, Set<(visible: boolean) => void>>();
		const last = new Map<Element, boolean>();
		const io = env.observe(margin, (entries) => {
			for (const entry of entries) {
				last.set(entry.target, entry.isIntersecting);
				notify(targets.get(entry.target) ?? [], entry.isIntersecting);
			}
		});
		s = { io, targets, last };
		observers.set(margin, s);
		return s;
	}

	function track(el: Element, margin: string, fn: (visible: boolean) => void): () => void {
		const s = shared(margin);
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
				if (s.targets.get(el)?.has(fn) && s.last.has(el)) fn(s.last.get(el)!);
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
				observers.delete(margin);
			}
		};
	}

	function activity(el: Element, options: ActivityOptions = {}): Activity {
		const { margin = DEFAULT_MARGIN, signal } = options;
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
			stopTrack = track(el, margin, (v) => {
				visible = v;
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
		prefs: readPrefs,
		/** Observers alive right now, per margin (for tests). */
		observerCount: () => observers.size,
	};
}

function browserEnv(): ActivityEnv {
	const motion = matchMedia("(prefers-reduced-motion: reduce)");
	type Connection = EventTarget & { saveData?: boolean };
	const connection = (navigator as Navigator & { connection?: Connection }).connection;
	return {
		observe(margin, onEntries) {
			return new IntersectionObserver(onEntries, { rootMargin: margin });
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

/** The page-wide preferences: reduced motion, Save-Data, page visibility. */
export function prefs(): Prefs {
	return page().prefs();
}
