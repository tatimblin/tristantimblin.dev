/**
 * One frame loop for the whole page.
 *
 * Every per-frame callback on the site (a widget's animation, wobble-text's
 * churn, Lenis's smoothing) registers here instead of calling
 * requestAnimationFrame itself, so that:
 *
 *  - there is ONE rAF, and it stops when nothing is registered: an idle page
 *    asks for no frames at all;
 *  - each frame runs in PHASES, every callback of one phase before any of the
 *    next: `scroll` (the one thing that moves the page: Lenis), then `read`
 *    (measure: getBoundingClientRect, offsets, computed style), then `write`
 *    (mutate: styles, attributes, the DOM). A widget that measures in `read` and
 *    paints in `write` never forces a layout another widget's writes dirtied,
 *    however many widgets share the frame;
 *  - a callback can be capped to `fps` (wobble-text's turbulence at 30), and is
 *    then simply not called on the frames in between;
 *  - a callback that throws is removed and reported, and the rest of the frame
 *    runs: one broken widget cannot stop another's animation.
 *
 *   const stop = onFrame((time, delta) => {
 *     el.style.translate = `${x(time)}px 0`;
 *     return time < end; // false (or calling stop()) unregisters it
 *   }, { phase: "write", fps: 30 });
 *
 * `time` is the rAF timestamp (performance.now()'s clock) and `delta` the time
 * since this callback last ran (0 on its first call). `signal` unregisters it
 * when aborted, so a widget's callbacks go with its AbortSignal.
 * frameStats() counts frames and calls, for tests and budgets.
 */

export type FramePhase = "scroll" | "read" | "write";

/** Return `false` to unregister; anything else keeps it registered. */
export type FrameCallback = (time: number, delta: number) => boolean | void;

export interface FrameOptions {
	/** Which phase of the frame it runs in. Default "write". */
	phase?: FramePhase;
	/** At most this many calls a second (it skips frames in between). */
	fps?: number;
	/** Unregisters it when aborted. */
	signal?: AbortSignal;
	/** Who registered it, for frameStats().byLabel. */
	label?: string;
}

export interface FrameStats {
	/** Is a frame requested? False whenever nothing is registered. */
	running: boolean;
	/** Callbacks registered right now. */
	callbacks: number;
	/** Frames run since the scheduler was created. */
	frames: number;
	/** Callback invocations since the scheduler was created. */
	calls: number;
	/** Callbacks removed because they threw. */
	errors: number;
	/** Invocations per label (unlabelled ones count under ""). */
	byLabel: Record<string, number>;
}

export interface Scheduler {
	onFrame(callback: FrameCallback, options?: FrameOptions): () => void;
	stats(): FrameStats;
}

/** The clock and the error sink, swappable for tests. */
export interface FrameHost {
	request(run: (time: number) => void): number;
	cancel(id: number): void;
	report(error: unknown): void;
}

const PHASES: readonly FramePhase[] = ["scroll", "read", "write"];

/** A frame counts toward an fps cap if it lands within this share of the
 *  interval: rAF timestamps jitter, and 30fps on a 60Hz display must take every
 *  other frame, not two in three when one lands a hair early. */
const FPS_SLACK = 0.1;

interface Entry {
	callback: FrameCallback;
	phase: FramePhase;
	interval: number;
	label: string;
	last: number | null;
	removed: boolean;
	off: () => void;
}

function defaultHost(): FrameHost {
	return {
		request: (run) => requestAnimationFrame(run),
		cancel: (id) => cancelAnimationFrame(id),
		report: (error) => {
			if (typeof reportError === "function") reportError(error);
			else console.error(error);
		},
	};
}

export function createScheduler(host: FrameHost = defaultHost()): Scheduler {
	const entries: Entry[] = [];
	let id: number | null = null;
	let frames = 0;
	let calls = 0;
	let errors = 0;
	const byLabel: Record<string, number> = {};

	const ensure = () => {
		if (id === null && entries.length > 0) id = host.request(run);
	};

	function run(time: number) {
		id = null;
		frames++;
		// Callbacks registered during this frame wait for the next one: the
		// snapshot is taken once, and a removal mid-frame only flags the entry.
		const snapshot = entries.slice();
		for (const phase of PHASES) {
			for (const entry of snapshot) {
				if (entry.removed || entry.phase !== phase) continue;
				if (entry.interval > 0 && entry.last !== null) {
					if (time - entry.last < entry.interval * (1 - FPS_SLACK)) continue;
				}
				const delta = entry.last === null ? 0 : time - entry.last;
				entry.last = time;
				calls++;
				byLabel[entry.label] = (byLabel[entry.label] ?? 0) + 1;
				let keep: boolean | void;
				try {
					keep = entry.callback(time, delta);
				} catch (error) {
					errors++;
					entry.off();
					host.report(error);
					continue;
				}
				if (keep === false) entry.off();
			}
		}
		ensure();
	}

	function onFrame(callback: FrameCallback, options: FrameOptions = {}): () => void {
		const { phase = "write", fps, signal, label = "" } = options;
		if (signal?.aborted) return () => {};
		const entry: Entry = {
			callback,
			phase,
			interval: fps && fps > 0 ? 1000 / fps : 0,
			label,
			last: null,
			removed: false,
			off: () => {
				if (entry.removed) return;
				entry.removed = true;
				const at = entries.indexOf(entry);
				if (at >= 0) entries.splice(at, 1);
				signal?.removeEventListener("abort", entry.off);
				if (entries.length === 0 && id !== null) {
					host.cancel(id);
					id = null;
				}
			},
		};
		entries.push(entry);
		signal?.addEventListener("abort", entry.off, { once: true });
		ensure();
		return entry.off;
	}

	return {
		onFrame,
		stats: () => ({
			running: id !== null,
			callbacks: entries.length,
			frames,
			calls,
			errors,
			byLabel: { ...byLabel },
		}),
	};
}

// The page's scheduler, made on first use (a module evaluated on the server,
// or in a test without rAF, must not touch requestAnimationFrame).
let shared: Scheduler | null = null;
const page = () => (shared ??= createScheduler());

/** Register a per-frame callback on the page's loop. Returns its unregister. */
export function onFrame(callback: FrameCallback, options?: FrameOptions): () => void {
	return page().onFrame(callback, options);
}

/** The page loop's counters. */
export function frameStats(): FrameStats {
	return page().stats();
}
