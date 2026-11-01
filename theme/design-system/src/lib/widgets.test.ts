import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { WidgetContext, WidgetModule, WidgetRegistry } from "./widgets";

/* A page just big enough for the runtime: cards with dataset/style/events, a
   document that fires astro:page-load, IntersectionObservers driven by hand. */

class Card extends EventTarget {
	dataset: Record<string, string | undefined> = {};
	style = { contentVisibility: "" } as { contentVisibility: string };
	attrs = new Map<string, string>();
	constructor(name: string, load?: "near" | "idle") {
		super();
		this.dataset.widget = name;
		if (load) this.dataset.widgetLoad = load;
	}
	getAttribute(n: string) {
		return this.attrs.get(n) ?? null;
	}
	hasAttribute(n: string) {
		return this.attrs.has(n);
	}
	toggleAttribute(n: string, on: boolean) {
		if (on) this.attrs.set(n, "");
		else this.attrs.delete(n);
		return on;
	}
	removeAttribute(n: string) {
		this.attrs.delete(n);
	}
}

const ios: Array<{ cb: (e: { target: unknown; isIntersecting: boolean }[]) => void; targets: Set<unknown> }> = [];
let cards: Card[] = [];

beforeAll(() => {
	const doc = new EventTarget() as EventTarget & Record<string, unknown>;
	doc.readyState = "complete";
	doc.visibilityState = "visible";
	doc.querySelectorAll = () => cards;
	Object.assign(globalThis, {
		document: doc,
		window: new EventTarget(),
		navigator: {},
		matchMedia: () => ({ matches: false, addEventListener() {} }),
		IntersectionObserver: class {
			targets = new Set<unknown>();
			constructor(public cb: (e: { target: unknown; isIntersecting: boolean }[]) => void) {
				ios.push(this);
			}
			observe(el: unknown) {
				this.targets.add(el);
			}
			unobserve(el: unknown) {
				this.targets.delete(el);
			}
			disconnect() {}
		},
	});
});

const settle = () => new Promise((r) => setTimeout(r, 20));
/** Scroll every card into the near margin. */
const near = (...which: Card[]) => {
	for (const io of ios) for (const el of which) if (io.targets.has(el)) io.cb([{ target: el, isIntersecting: true }]);
};
const load = () => document.dispatchEvent(new Event("astro:page-load"));
const swap = () => document.dispatchEvent(new Event("astro:before-swap"));

let stop: (() => void) | null = null;
afterEach(() => {
	swap();
	stop?.();
	stop = null;
	ios.length = 0;
	cards = [];
});

async function start(registry: WidgetRegistry) {
	const { startWidgets } = await import("./widgets");
	stop = startWidgets(registry);
	load();
}

const module = (mount: WidgetModule["mount"]) => () => Promise.resolve({ mount });

describe("startWidgets", () => {
	test("a near card mounts only once it is near; an idle one after load", async () => {
		const a = new Card("a");
		const b = new Card("b", "idle");
		cards = [a, b];
		const mounted: string[] = [];
		await start({
			a: module((el) => void mounted.push((el as unknown as Card).dataset.widget!)),
			b: module(() => void mounted.push("b")),
		});
		await settle();
		expect(mounted).toEqual(["b"]);
		expect(a.dataset.widgetState).toBeUndefined();
		near(a);
		await settle();
		expect(mounted).toEqual(["b", "a"]);
		expect(a.dataset.widgetState).toBe("mounted");
	});

	test("a card is marked far only once observed beyond a screen, and unmarked within it", async () => {
		const a = new Card("a", "idle");
		cards = [a];
		await start({ a: module(() => {}) });
		const far = (on: boolean) => {
			for (const io of ios) if (io.targets.has(a)) io.cb([{ target: a, isIntersecting: !on }]);
		};
		expect(a.hasAttribute("data-widget-far")).toBe(false);
		far(true);
		expect(a.hasAttribute("data-widget-far")).toBe(true);
		near(a);
		expect(a.hasAttribute("data-widget-far")).toBe(false);
	});

	test("the card renders for its mount, and goes back to its own content-visibility", async () => {
		const a = new Card("a");
		cards = [a];
		let during = "";
		await start({ a: module(() => void (during = a.style.contentVisibility)) });
		near(a);
		await settle();
		expect(during).toBe("visible");
		expect(a.style.contentVisibility).toBe("");
	});

	test("a failed import or a throwing mount fails that card only", async () => {
		const [a, b, c] = [new Card("a"), new Card("b"), new Card("c")];
		cards = [a, b, c];
		const errors: unknown[] = [];
		const prev = globalThis.reportError;
		globalThis.reportError = (e) => errors.push(e);
		let cMounted = false;
		await start({
			a: () => Promise.reject(new Error("404")),
			b: module(() => {
				throw new Error("boom");
			}),
			c: module(() => void (cMounted = true)),
		});
		near(a, b, c);
		await settle();
		globalThis.reportError = prev;
		expect([a.dataset.widgetState, b.dataset.widgetState, c.dataset.widgetState]).toEqual([
			"failed",
			"failed",
			"mounted",
		]);
		expect(cMounted).toBe(true);
		expect(errors).toHaveLength(2);
	});

	test("mounts run one at a time, in the order the cards came near", async () => {
		const [a, b] = [new Card("a"), new Card("b")];
		cards = [a, b];
		const log: string[] = [];
		await start({
			a: module(() => void log.push("a")),
			b: module(() => void log.push("b")),
		});
		near(b);
		near(a);
		await settle();
		expect(log).toEqual(["b", "a"]);
	});

	test("the swap runs every destroy and aborts every signal", async () => {
		const a = new Card("a");
		cards = [a];
		let ctx: WidgetContext | null = null;
		let destroyed = false;
		await start({
			a: module((_, c) => {
				ctx = c;
				return () => void (destroyed = true);
			}),
		});
		near(a);
		await settle();
		expect(ctx!.signal.aborted).toBe(false);
		swap();
		expect(destroyed).toBe(true);
		expect(ctx!.signal.aborted).toBe(true);
	});

	test("a module that lands after the swap never mounts on the old page", async () => {
		const a = new Card("a");
		cards = [a];
		let resolve!: (m: WidgetModule) => void;
		let mounted = false;
		await start({ a: () => new Promise<WidgetModule>((r) => (resolve = r)) });
		near(a);
		await settle();
		expect(a.dataset.widgetState).toBe("loading");
		swap();
		resolve({ mount: () => void (mounted = true) });
		await settle();
		expect(mounted).toBe(false);
	});

	test("whileActive starts with the card on screen and stops off it and on teardown", async () => {
		const a = new Card("a");
		cards = [a];
		const log: string[] = [];
		await start({
			a: module((_, ctx) => {
				ctx.whileActive(() => {
					log.push("start");
					return () => log.push("stop");
				});
			}),
		});
		near(a);
		await settle();
		expect(log).toEqual([]); // near, but not yet seen by the activity margin
		const seen = (on: boolean) => {
			for (const io of ios) if (io.targets.has(a)) io.cb([{ target: a, isIntersecting: on }]);
		};
		seen(true);
		expect(log).toEqual(["start"]);
		seen(false);
		expect(log).toEqual(["start", "stop"]);
		seen(true);
		swap();
		expect(log).toEqual(["start", "stop", "start", "stop"]);
	});

	test("whenMounted resolves on mount, and at once for a non-widget", async () => {
		const { whenMounted } = await import("./widgets");
		await whenMounted({ dataset: {} } as unknown as Element);
		const a = new Card("a");
		cards = [a];
		await start({ a: module(() => {}) });
		let done = false;
		void whenMounted(a as unknown as Element).then(() => (done = true));
		await settle();
		expect(done).toBe(false);
		near(a);
		await settle();
		expect(done).toBe(true);
	});
});
