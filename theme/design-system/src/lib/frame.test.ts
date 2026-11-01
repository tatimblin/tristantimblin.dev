import { describe, expect, test } from "bun:test";
import { createScheduler, type FrameHost } from "./frame";

/** A hand-cranked clock: tick(t) runs the pending frame at time t. */
function clock() {
	let pending: ((t: number) => void) | null = null;
	let requests = 0;
	const errors: unknown[] = [];
	const host: FrameHost = {
		request(run) {
			requests++;
			pending = run;
			return requests;
		},
		cancel() {
			pending = null;
		},
		report: (e) => errors.push(e),
	};
	return {
		host,
		errors,
		get pending() {
			return pending !== null;
		},
		get requests() {
			return requests;
		},
		tick(t: number) {
			const run = pending;
			pending = null;
			run?.(t);
		},
	};
}

describe("frame scheduler", () => {
	test("one rAF for every callback, and none once they are gone", () => {
		const c = clock();
		const s = createScheduler(c.host);
		expect(c.pending).toBe(false);
		const a: number[] = [];
		const b: number[] = [];
		const offA = s.onFrame((t) => void a.push(t));
		const offB = s.onFrame((t) => void b.push(t));
		expect(c.requests).toBe(1);
		c.tick(16);
		c.tick(32);
		expect(a).toEqual([16, 32]);
		expect(b).toEqual([16, 32]);
		offA();
		offB();
		expect(c.pending).toBe(false);
		expect(s.stats().running).toBe(false);
		expect(s.stats().callbacks).toBe(0);
	});

	test("runs every read before any write, whatever the registration order", () => {
		const c = clock();
		const s = createScheduler(c.host);
		const order: string[] = [];
		s.onFrame(() => void order.push("write 1"), { phase: "write" });
		s.onFrame(() => void order.push("read 1"), { phase: "read" });
		s.onFrame(() => void order.push("write 2"));
		s.onFrame(() => void order.push("read 2"), { phase: "read" });
		s.onFrame(() => void order.push("scroll"), { phase: "scroll" });
		c.tick(16);
		expect(order).toEqual(["scroll", "read 1", "read 2", "write 1", "write 2"]);
	});

	test("an fps cap skips the frames in between, at 60Hz and at 120Hz", () => {
		for (const hz of [60, 120]) {
			const c = clock();
			const s = createScheduler(c.host);
			let calls = 0;
			s.onFrame(() => void calls++, { fps: 30 });
			const step = 1000 / hz;
			// One second of frames, with a little jitter.
			for (let i = 0; i < hz; i++) c.tick(i * step + (i % 2 ? 0.4 : -0.4));
			expect(calls).toBe(30);
		}
	});

	test("only capped callbacks: the loop sleeps between them, landing on the same frames", () => {
		/** A display at `hz` with timers: a rAF runs at the first vsync after it is
		 *  asked for, a timer at its time; `spent` ms of script per frame. */
		function display(hz: number, spent = 2) {
			const step = 1000 / hz;
			let now = 0;
			let raf: ((t: number) => void) | null = null;
			let timer: { at: number; run: () => void } | null = null;
			let rafs = 0;
			const host: FrameHost = {
				request: (run) => ((raf = run), 1),
				cancel: () => void (raf = null),
				report: (e) => {
					throw e;
				},
				wait: (run, ms) => ((timer = { at: now + ms, run }), 2),
				unwait: () => void (timer = null),
				now: () => now,
			};
			return {
				host,
				get rafs() {
					return rafs;
				},
				runFor(ms: number) {
					while (now < ms) {
						const vsync = (Math.floor(now / step + 1e-9) + 1) * step;
						if (timer && timer.at <= vsync) {
							now = Math.max(now, timer.at);
							const t = timer;
							timer = null;
							t.run();
						} else if (raf) {
							now = vsync;
							const run = raf;
							raf = null;
							rafs++;
							run(now);
							now += spent;
						} else if (timer) now = timer.at;
						else return;
					}
				},
			};
		}
		for (const hz of [60, 120, 144]) {
			const d = display(hz);
			const s = createScheduler(d.host);
			const times: number[] = [];
			s.onFrame((t) => void times.push(t), { fps: 30 });
			d.runFor(1000);
			// The same calls an every-frame loop would make (see the test above)...
			expect(times.length).toBeGreaterThanOrEqual(29);
			expect(times.length).toBeLessThanOrEqual(31);
			const step = 1000 / hz;
			for (let i = 1; i < times.length; i++) {
				const gap = times[i] - times[i - 1];
				expect(gap).toBeGreaterThanOrEqual(1000 / 30 - step * 0.5);
				expect(gap).toBeLessThan(1000 / 30 + step * 0.5);
			}
			// ...at 60Hz with no frame asked for in between, and never more frames
			// than the always-on loop.
			if (hz === 60) expect(d.rafs).toBe(times.length);
			expect(d.rafs).toBeLessThanOrEqual(hz);
			expect(s.stats().running).toBe(true);
		}
	});

	test("an uncapped callback, or a new one, still gets the very next frame", () => {
		const c = clock();
		let waits = 0;
		const host: FrameHost = { ...c.host, wait: () => ++waits, unwait: () => {}, now: () => 0 };
		const s = createScheduler(host);
		s.onFrame(() => {}, { fps: 30 });
		c.tick(0);
		expect(c.pending).toBe(false); // asleep: the next call is due in 30ms
		expect(waits).toBe(1);
		const seen: number[] = [];
		const off = s.onFrame((t) => void seen.push(t));
		expect(c.pending).toBe(true); // woken for the newcomer
		c.tick(5);
		expect(c.pending).toBe(true); // and every frame while it is there
		c.tick(10);
		expect(seen).toEqual([5, 10]);
		off();
	});

	test("asleep: the earliest cap sets the wake, a late timer still runs, and stopping clears it", () => {
		const c = clock();
		let now = 0;
		const timers = new Map<number, { ms: number; run: () => void }>();
		let next = 0;
		const host: FrameHost = {
			...c.host,
			wait: (run, ms) => (timers.set(++next, { ms, run }), next),
			unwait: (id) => void timers.delete(id),
			now: () => now,
		};
		const s = createScheduler(host);
		const ac = new AbortController();
		const slow: number[] = [];
		const fast: number[] = [];
		s.onFrame((t) => void slow.push(t), { fps: 10, signal: ac.signal });
		const offFast = s.onFrame((t) => void fast.push(t), { fps: 30 });
		c.tick(0);
		expect([slow, fast]).toEqual([[0], [0]]);
		// One timer, for the 30fps one (due at 30), not the 10fps one (90).
		expect(timers.size).toBe(1);
		expect([...timers.values()][0].ms).toBeCloseTo(30);
		// A throttled timer (a background tab's: a second late) asks for a frame
		// all the same, and both run on it.
		now = 1000;
		[...timers.values()][0].run();
		timers.clear();
		expect(c.pending).toBe(true);
		c.tick(1000);
		expect([slow, fast]).toEqual([[0, 1000], [0, 1000]]);
		expect(timers.size).toBe(1);
		// Aborting one while asleep leaves the other's wake; the last going
		// clears it, and the loop is stopped.
		ac.abort();
		expect(timers.size).toBe(1);
		expect(s.stats().running).toBe(true);
		offFast();
		expect(timers.size).toBe(0);
		expect(c.pending).toBe(false);
		expect(s.stats().running).toBe(false);
	});

	test("delta is the time since the callback last ran", () => {
		const c = clock();
		const s = createScheduler(c.host);
		const deltas: number[] = [];
		s.onFrame((_, d) => void deltas.push(d), { fps: 30 });
		for (let t = 0; t <= 100; t += 1000 / 60) c.tick(t);
		expect(deltas[0]).toBe(0);
		for (const d of deltas.slice(1)) expect(d).toBeCloseTo(1000 / 30, 5);
	});

	test("returning false unregisters", () => {
		const c = clock();
		const s = createScheduler(c.host);
		let n = 0;
		s.onFrame(() => ++n < 3);
		let once = 0;
		s.onFrame(() => (once++, false));
		for (let t = 0; t < 10; t++) c.tick(t * 16);
		expect(n).toBe(3);
		expect(once).toBe(1);
		expect(c.pending).toBe(false);
	});

	test("a throwing callback is removed and reported; the others keep running", () => {
		const c = clock();
		const s = createScheduler(c.host);
		const seen: string[] = [];
		s.onFrame(() => void seen.push("before"), { phase: "read" });
		s.onFrame(() => {
			throw new Error("boom");
		}, { phase: "read" });
		s.onFrame(() => void seen.push("after"));
		c.tick(16);
		c.tick(32);
		expect(seen).toEqual(["before", "after", "before", "after"]);
		expect(c.errors).toHaveLength(1);
		expect(s.stats().errors).toBe(1);
		expect(s.stats().callbacks).toBe(2);
	});

	test("an abort signal unregisters, and an aborted one never registers", () => {
		const c = clock();
		const s = createScheduler(c.host);
		const ac = new AbortController();
		let n = 0;
		s.onFrame(() => void n++, { signal: ac.signal });
		c.tick(16);
		ac.abort();
		expect(c.pending).toBe(false);
		c.tick(32);
		expect(n).toBe(1);
		s.onFrame(() => void n++, { signal: ac.signal });
		expect(s.stats().callbacks).toBe(0);
	});

	test("a callback added mid-frame waits for the next frame; one removed mid-frame does not run", () => {
		const c = clock();
		const s = createScheduler(c.host);
		const seen: string[] = [];
		let offLate: () => void = () => {};
		s.onFrame(() => {
			seen.push("first");
			offLate();
			s.onFrame(() => (seen.push("added"), false));
			return false;
		}, { phase: "read" });
		offLate = s.onFrame(() => void seen.push("removed"));
		c.tick(16);
		expect(seen).toEqual(["first"]);
		c.tick(32);
		expect(seen).toEqual(["first", "added"]);
	});

	test("counts calls per label", () => {
		const c = clock();
		const s = createScheduler(c.host);
		s.onFrame(() => {}, { label: "amc" });
		s.onFrame(() => {}, { label: "amc", phase: "read" });
		s.onFrame(() => {});
		c.tick(16);
		c.tick(32);
		expect(s.stats().byLabel).toEqual({ amc: 4, "": 2 });
		expect(s.stats().frames).toBe(2);
		expect(s.stats().calls).toBe(6);
	});
});
