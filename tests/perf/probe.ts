/**
 * The perf project's in-page instrumentation, injected before any page script
 * (page.addInitScript(probe)). Everything it records lives on
 * `window.__whoisPerf`; tests/perf/fixtures.ts reads it.
 *
 * It must be self-contained (Playwright serialises the function's source), and
 * it only WATCHES: every wrapper calls straight through to the original.
 *
 *  - frameStats: theme/design-system/src/lib/frame.ts hands its counters over
 *    when it finds this object (the one test hook in production code; a page
 *    without the probe never defines it).
 *  - raf / rvfc: every requestAnimationFrame / requestVideoFrameCallback
 *    callback that RAN, attributed to the script that asked for it (the first
 *    http(s) frame of the requesting stack, reduced to its file name).
 *  - webgl: WebGL contexts created (distinct canvases).
 *  - listeners: every wheel / touchstart / touchmove listener added, with
 *    whether it can block scrolling (passive resolved the way Chromium does:
 *    on window, document, <html> and <body> it defaults to passive), and
 *    every listener on window and document, for the leak check (`once` ones
 *    are flagged: they go when they fire, which this can't see).
 *  - observersLive: Intersection/Resize/Mutation observers observing at least
 *    one target.
 *  - settled: the widget runtime's mounts, per card.
 *  - cls / shifts / loafs / longtasks: the performance timeline.
 */
export function probe() {
	type Src = Record<string, number>;
	const w = window as unknown as Record<string, unknown>;
	const P = {
		frameStats: undefined as undefined | (() => unknown),
		raf: {} as Src,
		rvfc: {} as Src,
		webgl: 0,
		listeners: [] as Array<{
			self: EventTarget;
			target: string;
			type: string;
			capture: boolean;
			passive: boolean;
			fn: unknown;
			removed: boolean;
			once: boolean;
			src: string;
		}>,
		observersLive: 0,
		/** `<widget>:mounted` / `<widget>:failed` → how many times. */
		settled: {} as Record<string, number>,
		cls: 0,
		shifts: [] as Array<{ t: number; v: number }>,
		loafs: [] as Array<{ t: number; d: number; scripts: Array<{ d: number; src: string; inv: string }> }>,
		longtasks: [] as Array<{ t: number; d: number }>,
	};
	w.__whoisPerf = P;

	const source = () => {
		const stack = new Error().stack?.split("\n").slice(2) ?? [];
		const line = stack.find((l) => /https?:\/\//.test(l)) ?? "";
		const m = line.match(/(https?:\/\/[^\s)]+?):\d+:\d+/);
		return m ? m[1].split("/").pop()!.split("?")[0] : "?";
	};

	const raf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (cb) => {
		const src = source();
		return raf((t) => {
			P.raf[src] = (P.raf[src] ?? 0) + 1;
			cb(t);
		});
	};
	const proto = HTMLVideoElement.prototype;
	const rvfc = proto.requestVideoFrameCallback as HTMLVideoElement["requestVideoFrameCallback"] | undefined;
	if (rvfc) {
		proto.requestVideoFrameCallback = function (this: HTMLVideoElement, cb: VideoFrameRequestCallback) {
			const src = source();
			return rvfc.call(this, (now, meta) => {
				P.rvfc[src] = (P.rvfc[src] ?? 0) + 1;
				cb(now, meta);
			});
		};
	}

	const contexts = new WeakSet<object>();
	for (const C of [HTMLCanvasElement, typeof OffscreenCanvas === "function" ? OffscreenCanvas : null]) {
		if (!C) continue;
		const get = C.prototype.getContext as (this: unknown, type: string, ...a: unknown[]) => unknown;
		C.prototype.getContext = function (this: object, type: string, ...a: unknown[]) {
			const ctx = get.call(this, type, ...a);
			if (ctx && /webgl/.test(type) && !contexts.has(this)) {
				contexts.add(this);
				P.webgl++;
			}
			return ctx;
		} as typeof C.prototype.getContext;
	}

	const describe = (t: EventTarget) =>
		t === window
			? "window"
			: t === document
				? "document"
				: t instanceof Element
					? `${t.tagName.toLowerCase()}${t.className && typeof t.className === "string" ? "." + t.className.trim().split(/\s+/).join(".") : ""}`
					: String(t);
	const SCROLL_BLOCKING = new Set(["wheel", "mousewheel", "touchstart", "touchmove"]);
	const capture = (opts: unknown) =>
		typeof opts === "boolean"
			? opts
			: typeof opts === "object" && opts !== null && !!(opts as AddEventListenerOptions).capture;
	const same = (l: (typeof P.listeners)[number], self: EventTarget, type: string, fn: unknown, cap: boolean) =>
		!l.removed && l.self === self && l.type === type && l.fn === fn && l.capture === cap;
	const add = EventTarget.prototype.addEventListener;
	const remove = EventTarget.prototype.removeEventListener;
	EventTarget.prototype.addEventListener = function (type, fn, opts) {
		const root = this === window || this === document;
		const blocking = SCROLL_BLOCKING.has(type);
		const cap = capture(opts);
		if (fn && (root || blocking) && !P.listeners.some((l) => same(l, this, type, fn, cap))) {
			const rootish = root || this === document.documentElement || this === document.body;
			const o = typeof opts === "object" && opts !== null ? opts : undefined;
			const entry = {
				self: this as EventTarget,
				target: describe(this),
				type,
				capture: cap,
				// Chromium's intervention: a scroll-blocking listener on a
				// document-level target defaults to passive.
				passive: o?.passive ?? (blocking ? rootish : true),
				fn: fn as unknown,
				removed: !!o?.signal?.aborted,
				once: !!o?.once,
				src: source(),
			};
			P.listeners.push(entry);
			o?.signal?.addEventListener("abort", () => (entry.removed = true));
		}
		return add.call(this, type, fn, opts);
	};
	EventTarget.prototype.removeEventListener = function (type, fn, opts) {
		const cap = capture(opts);
		for (const l of P.listeners) if (same(l, this, type, fn, cap)) l.removed = true;
		return remove.call(this, type, fn, opts);
	};

	for (const name of ["IntersectionObserver", "ResizeObserver", "MutationObserver"] as const) {
		const Base = w[name] as { new (...a: unknown[]): { observe(...a: unknown[]): void; unobserve?(t: unknown): void; disconnect(): void } };
		// (No class fields: Playwright's transform would turn them into helpers
		// the page doesn't have.)
		const targets = new WeakMap<object, Set<unknown>>();
		const of = (o: object) => {
			let set = targets.get(o);
			if (!set) targets.set(o, (set = new Set()));
			return set;
		};
		const Wrapped = class extends Base {
			observe(target: unknown, ...rest: unknown[]) {
				const set = of(this);
				if (set.size === 0) P.observersLive++;
				set.add(target);
				return super.observe(target, ...rest);
			}
			unobserve(target: unknown) {
				const set = of(this);
				if (set.delete(target) && set.size === 0) P.observersLive--;
				return super.unobserve?.(target);
			}
			disconnect() {
				const set = of(this);
				if (set.size > 0) P.observersLive--;
				set.clear();
				return super.disconnect();
			}
		};
		Object.defineProperty(Wrapped, "name", { value: name });
		w[name] = Wrapped;
	}

	// Mounts, per widget: the runtime fires `widget:settled` on the card
	// (lib/widgets.ts). Not bubbling, but a capturing listener hears it.
	document.addEventListener(
		"widget:settled",
		(e) => {
			const el = e.target as HTMLElement;
			const key = `${el.dataset.widget}:${el.dataset.widgetState}`;
			P.settled[key] = (P.settled[key] ?? 0) + 1;
		},
		true,
	);

	const observe = (type: string, fn: (e: PerformanceEntry) => void) => {
		try {
			new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
		} catch {
			/* not supported */
		}
	};
	observe("layout-shift", (e) => {
		const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
		if (s.hadRecentInput) return;
		P.cls += s.value;
		P.shifts.push({ t: s.startTime, v: s.value });
	});
	observe("long-animation-frame", (e) => {
		const l = e as PerformanceEntry & {
			scripts?: Array<{ duration: number; sourceURL?: string; invoker?: string }>;
		};
		P.loafs.push({
			t: l.startTime,
			d: l.duration,
			scripts: (l.scripts ?? []).map((s) => ({
				d: s.duration,
				src: (s.sourceURL ?? "").split("/").pop() ?? "",
				inv: s.invoker ?? "",
			})),
		});
	});
	observe("longtask", (e) => P.longtasks.push({ t: e.startTime, d: e.duration }));
}
