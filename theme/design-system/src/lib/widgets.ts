/**
 * The widget runtime: when each card's script loads and mounts, and what it
 * gets to work with. How to write a widget: ./WIDGETS.md.
 *
 * A card is a <Widget name="…">, which renders `data-widget="<name>"` and
 * `data-widget-load="near|idle"`. The site hands startWidgets() a registry of
 * name → lazy module (import.meta.glob of src/widgets/<name>/client.ts, each
 * its own chunk), and on every page load (onPage: the first, and each
 * view-transition navigation) the runtime:
 *
 *  1. LOADS each card's module when it is due: `near` once the card is within
 *     a screen of the viewport (NEAR_MARGIN), `idle` once the page has
 *     loaded — either way in an idle callback, so a mount never lands in the
 *     middle of a scroll frame — and `eager` at once, ahead of the rest (only
 *     for a card that must be placed before the page can scroll).
 *     Whatever the mode, a card beyond that screen is marked
 *     `data-widget-far`, which lets content-visibility skip it
 *     (widget-grid.css says why it is only for far cards).
 *  2. MOUNTS them one at a time, yielding to the page between two, so a slow
 *     mount delays the next card rather than the page. The card is rendered
 *     for the mount (content-visibility: visible) so it can measure itself.
 *  3. ISOLATES them: a module that fails to load, or a mount that throws,
 *     marks that card `data-widget-state="failed"` and the rest carry on.
 *  4. TEARS DOWN before the next swap: every mount's destroy runs, and its
 *     AbortSignal aborts, which drops its frame callbacks, its activity
 *     observer and any listener registered with { signal }.
 *
 *   export function mount(el: HTMLElement, ctx: WidgetContext) {
 *     const button = el.querySelector("button")!;
 *     button.addEventListener("click", flip, { signal: ctx.signal });
 *     ctx.whileActive(() => ctx.frame(tick));   // only while on screen
 *     return () => {};                          // anything signal can't undo
 *   }
 *
 * `data-widget-state` walks queued → loading → mounted | failed, and the card
 * fires `widget:settled` on reaching either end; whenMounted() waits for it
 * (the page's reveal does, so a card never fades in half-built).
 */
import { activity, type Activity } from "./activity";
import { onFrame, type FrameCallback, type FrameOptions } from "./frame";
import { onPage, type Teardown } from "./lifecycle";

export type WidgetLoad = "near" | "idle" | "eager";

export interface WidgetContext {
	/** Is the card worth working for (on screen, page visible, motion allowed). */
	readonly activity: Activity;
	/** Aborted when the card is torn down. */
	readonly signal: AbortSignal;
	/** onFrame(), unregistered with the card. */
	frame(callback: FrameCallback, options?: Omit<FrameOptions, "signal" | "label">): () => void;
	/**
	 * Run `start` each time the card becomes active (or, with
	 * `{ when: "animate" }`, active with motion allowed), and the stop it
	 * returns each time it stops being so, and on teardown. The place for
	 * continuous work: a frame loop, a timer, a playing video.
	 */
	whileActive(start: () => (() => void) | void, options?: { when?: "active" | "animate" }): void;
}

/** Returns its teardown, if it has anything the signal does not undo. */
export type WidgetMount = (el: HTMLElement, ctx: WidgetContext) => (() => void) | void;

export interface WidgetModule {
	mount: WidgetMount;
}

export type WidgetRegistry = Record<string, () => Promise<WidgetModule>>;

/** `near`: a screen ahead of the viewport. */
export const NEAR_MARGIN = "100% 0px";

const SETTLED = "widget:settled";

type State = "queued" | "loading" | "mounted" | "failed";

const report = (error: unknown) => {
	if (typeof reportError === "function") reportError(error);
	else console.error(error);
};

function settle(el: HTMLElement, state: "mounted" | "failed") {
	el.dataset.widgetState = state;
	el.dispatchEvent(new Event(SETTLED));
}

/** Resolves once `el`'s widget has mounted or failed; at once for an element
 *  that is not a widget. */
export function whenMounted(el: Element): Promise<void> {
	const card = el as HTMLElement;
	if (card.dataset?.widget === undefined) return Promise.resolve();
	const state = card.dataset.widgetState;
	if (state === "mounted" || state === "failed") return Promise.resolve();
	return new Promise((resolve) => card.addEventListener(SETTLED, () => resolve(), { once: true }));
}

/** An idle moment, or `timeout` ms, whichever is first. */
function idle(fn: () => void, timeout = 1000): () => void {
	if (typeof requestIdleCallback === "function") {
		const id = requestIdleCallback(fn, { timeout });
		return () => cancelIdleCallback(id);
	}
	const id = setTimeout(fn, 1);
	return () => clearTimeout(id);
}

/** Give the page a turn (input, rendering) before the next mount. */
function yieldToPage(): Promise<void> {
	const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
	if (typeof s?.yield === "function") return s.yield();
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function context(name: string, el: HTMLElement, signal: AbortSignal): WidgetContext {
	const act = activity(el, { signal });
	return {
		activity: act,
		signal,
		frame: (callback, options) => onFrame(callback, { ...options, signal, label: name }),
		whileActive(start, { when = "active" } = {}) {
			let stop: (() => void) | void | null = null;
			let running = false;
			const sync = () => {
				const want = !signal.aborted && act[when];
				if (want === running) return;
				if (want) {
					// Marked running only once start has returned: one that throws
					// (reported by activity's notify) is retried on the next change.
					stop = start();
					running = true;
				} else {
					running = false;
					const s = stop;
					stop = null;
					s?.();
				}
			};
			const unsubscribe = act.subscribe(sync);
			signal.addEventListener(
				"abort",
				() => {
					unsubscribe();
					sync();
				},
				{ once: true },
			);
			sync();
		},
	};
}

/**
 * Load, mount and tear down every `[data-widget]` on each page, from
 * `registry`. Returns the unsubscribe (tests; the site never stops it).
 */
export function startWidgets(registry: WidgetRegistry): Teardown {
	return onPage(() => {
		const page = new AbortController();
		const destroys: Array<() => void> = [];
		const cancels: Array<() => void> = [];
		const queue: HTMLElement[] = [];
		/** `near` cards whose load has been scheduled. */
		const due = new WeakSet<HTMLElement>();
		let pumping = false;

		const mountOne = async (el: HTMLElement) => {
			const name = el.dataset.widget ?? "";
			const load = registry[name];
			if (!load) {
				report(new Error(`[widgets] no module for "${name}"`));
				return settle(el, "failed");
			}
			el.dataset.widgetState = "loading" satisfies State;
			let mod: WidgetModule;
			try {
				mod = await load();
			} catch (error) {
				report(error);
				return settle(el, "failed");
			}
			if (page.signal.aborted) return;

			const own = new AbortController();
			const ctx = context(name, el, own.signal);
			// Rendered for the mount even if content-visibility is skipping it,
			// so whatever the mount measures is the real box.
			const cv = el.style.contentVisibility;
			el.style.contentVisibility = "visible";
			try {
				const destroy = mod.mount(el, ctx);
				destroys.push(() => {
					try {
						destroy?.();
					} catch (error) {
						report(error);
					}
					own.abort();
				});
				settle(el, "mounted");
			} catch (error) {
				own.abort();
				report(error);
				settle(el, "failed");
			} finally {
				el.style.contentVisibility = cv;
				if (!el.getAttribute("style")) el.removeAttribute("style");
			}
		};

		const pump = async () => {
			if (pumping) return;
			pumping = true;
			while (queue.length > 0 && !page.signal.aborted) {
				await mountOne(queue.shift()!);
				if (queue.length > 0) await yieldToPage();
			}
			pumping = false;
		};

		const enqueue = (el: HTMLElement) => {
			if (page.signal.aborted || el.dataset.widgetState) return;
			el.dataset.widgetState = "queued" satisfies State;
			queue.push(el);
			void pump();
		};

		const whenLoaded = (fn: () => void) => {
			if (document.readyState === "complete") return fn();
			window.addEventListener("load", fn, { once: true, signal: page.signal });
		};

		for (const el of document.querySelectorAll<HTMLElement>("[data-widget]")) {
			const mode = (el.dataset.widgetLoad ?? "near") as WidgetLoad;
			if (mode === "eager") enqueue(el);
			else if (mode === "idle") whenLoaded(() => cancels.push(idle(() => enqueue(el))));
			// More than a screen away: `data-widget-far`, which lets
			// content-visibility skip the card (widget-grid.css). Within a screen
			// the mark comes off before the card can be seen, and a `near` card
			// loads. The observer's first report lands after the first paint, so
			// no card is skippable in the first frame (one that is delays it).
			activity(el, { margin: NEAR_MARGIN, signal: page.signal }).subscribe(({ visible }) => {
				el.toggleAttribute("data-widget-far", !visible);
				if (visible && mode === "near" && !due.has(el)) {
					due.add(el);
					cancels.push(idle(() => enqueue(el)));
				}
			});
		}

		return () => {
			page.abort();
			queue.length = 0;
			for (const cancel of cancels.splice(0)) cancel();
			for (const destroy of destroys.splice(0).reverse()) destroy();
		};
	});
}
