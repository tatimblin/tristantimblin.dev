import { describe, expect, test } from "bun:test";
import { createActivityHub, type ActivityEnv, type ActivityState, type Prefs } from "./activity";

/** Observers you drive by hand, and prefs you set. */
function env(initial: Partial<Prefs> = {}) {
	const ios: Array<{
		margin: string;
		targets: Set<Element>;
		fire: (el: Element, on: boolean) => void;
		batch: (els: Element[], on: boolean) => void;
		disconnected: boolean;
	}> = [];
	let prefs: Prefs = { reducedMotion: false, saveData: false, pageVisible: true, ...initial };
	let onChange = () => {};
	const e: ActivityEnv = {
		observe(margin, onEntries) {
			const io = {
				margin,
				targets: new Set<Element>(),
				fire: (el: Element, on: boolean) => onEntries([{ target: el, isIntersecting: on }]),
				batch: (els: Element[], on: boolean) =>
					onEntries(els.map((target) => ({ target, isIntersecting: on }))),
				disconnected: false,
			};
			ios.push(io);
			return {
				observe: (el) => io.targets.add(el),
				unobserve: (el) => io.targets.delete(el),
				disconnect: () => (io.disconnected = true),
			};
		},
		prefs: () => prefs,
		onPrefsChange: (fn) => (onChange = fn),
	};
	return {
		env: e,
		ios,
		set(next: Partial<Prefs>) {
			prefs = { ...prefs, ...next };
			onChange();
		},
	};
}

const el = () => ({}) as Element;

describe("activity", () => {
	test("nothing is active until the element has been seen", () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const a = hub.activity(el());
		expect([a.visible, a.active, a.animate]).toEqual([false, false, false]);
	});

	test("visible + page visible = active; + motion allowed = animate", () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const target = el();
		const a = hub.activity(target);
		const seen: ActivityState[] = [];
		a.subscribe((s) => seen.push({ ...s }));
		t.ios[0].fire(target, true);
		expect(seen.at(-1)).toEqual({ visible: true, active: true, animate: true });
		t.set({ reducedMotion: true });
		expect(seen.at(-1)).toEqual({ visible: true, active: true, animate: false });
		t.set({ pageVisible: false });
		expect(seen.at(-1)).toEqual({ visible: true, active: false, animate: false });
		t.set({ pageVisible: true, reducedMotion: false });
		t.ios[0].fire(target, false);
		expect(seen.at(-1)).toEqual({ visible: false, active: false, animate: false });
	});

	test("calls back only on a change", () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const target = el();
		const a = hub.activity(target);
		let n = 0;
		a.subscribe(() => n++);
		t.ios[0].fire(target, true);
		t.ios[0].fire(target, true);
		t.set({ saveData: true });
		expect(n).toBe(1);
		expect(hub.prefs().saveData).toBe(true);
	});

	test("one observer per margin, shared, and gone with its last element", () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const [x, y, z] = [el(), el(), el()];
		const a = hub.activity(x);
		const b = hub.activity(y);
		const c = hub.activity(z, { margin: "100% 0px" });
		expect(t.ios.map((io) => io.margin)).toEqual(["25% 0px", "100% 0px"]);
		expect(t.ios[0].targets.size).toBe(2);
		a.destroy();
		expect(t.ios[0].disconnected).toBe(false);
		b.destroy();
		expect(t.ios[0].disconnected).toBe(true);
		expect(hub.observerCount()).toBe(1);
		c.destroy();
		expect(hub.observerCount()).toBe(0);
	});

	test("two activities on one element each hear its entries; a signal destroys", () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const target = el();
		const ac = new AbortController();
		const a = hub.activity(target);
		const b = hub.activity(target, { signal: ac.signal });
		t.ios[0].fire(target, true);
		expect(a.active && b.active).toBe(true);
		ac.abort();
		expect(t.ios[0].targets.size).toBe(1);
		t.ios[0].fire(target, false);
		expect(a.active).toBe(false);
		expect(b.active).toBe(true); // destroyed: no longer updated
	});

	test("the first observation is reported even when out of view; a late joiner hears the last one", async () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const target = el();
		const seen: boolean[] = [];
		hub.activity(target).subscribe((s) => seen.push(s.visible));
		t.ios[0].fire(target, false);
		expect(seen).toEqual([false]);
		t.ios[0].fire(target, true);
		const late = hub.activity(target);
		let heard: boolean | null = null;
		late.subscribe((s) => (heard = s.visible));
		await Promise.resolve();
		expect(heard).toBe(true);
		expect(late.active).toBe(true);
	});

	test("a listener that throws is reported, and the others in the same report still hear it", () => {
		const t = env();
		const hub = createActivityHub(t.env);
		const [x, y] = [el(), el()];
		hub.activity(x).subscribe(() => {
			throw new Error("boom");
		});
		const b = hub.activity(y);
		const errors: unknown[] = [];
		const prev = globalThis.reportError;
		globalThis.reportError = (e) => errors.push(e);
		t.ios[0].batch([x, y], true);
		globalThis.reportError = prev;
		expect(errors).toHaveLength(1);
		expect(b.active).toBe(true);
	});
});
