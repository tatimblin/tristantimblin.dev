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
