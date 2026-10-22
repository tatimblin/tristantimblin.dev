/**
 * Page-view counting with hosted GoatCounter (tristantimblin.goatcounter.com).
 *
 * Runs once per hard load (Layout's module script). On the production host,
 * and only there, it injects GoatCounter's count.js; everywhere else — a
 * local server, a preview deploy, Playwright — nothing is loaded and nothing
 * is sent (`shouldCount` in ./path).
 *
 * count.js runs with `no_onload`, so it never counts by itself: this module
 * calls `goatcounter.count()` on every `astro:page-load`, which fires on the
 * first load AND after each ClientRouter soft navigation. The path is the
 * page's build-time `<meta name="hit-path">` (Layout, normalised with
 * ./path), never `location`, so a query string or a typo'd URL cannot mint a
 * new row. count.js arrives `async`; a page load that fires before it has is
 * queued and sent on its `load`.
 *
 * Opting out still works: count.js reads `#toggle-goatcounter` itself when the
 * page loads with that hash, and every count() checks the flag it stores.
 */
import { normalisePath, shouldCount } from "./path";

export const GOATCOUNTER_ENDPOINT = "https://tristantimblin.goatcounter.com/count";

/**
 * A versioned build, pinned by integrity (goatcounter.com/help/countjs-versions).
 * Versioned files never change, so the hash holds; to move, take the new
 * version's URL and hash from that page.
 */
export const GOATCOUNTER_SRC = "https://gc.zgo.at/count.v5.js";
export const GOATCOUNTER_INTEGRITY =
	"sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";

/** count.js's settings: no automatic count on load (this module counts). */
export const GOATCOUNTER_SETTINGS = { no_onload: true } as const;

interface CountVars {
	path: string;
	title?: string;
	referrer?: string;
}

declare global {
	interface Window {
		goatcounter?: {
			no_onload?: boolean;
			endpoint?: string;
			count?: (vars: CountVars) => void;
		};
	}
}

/** Run `fn` now if the page is visible, else once it first becomes so (count.js's own rule). */
function whenVisible(fn: () => void) {
	if (document.visibilityState !== "hidden") return fn();
	const onChange = () => {
		if (document.visibilityState === "hidden") return;
		document.removeEventListener("visibilitychange", onChange);
		fn();
	};
	document.addEventListener("visibilitychange", onChange);
}

export function startCounting() {
	if (!shouldCount({ hostname: location.hostname, webdriver: navigator.webdriver })) return;

	// Set before count.js runs (it merges into an existing object). `endpoint`
	// too: the client router drops the injected <script> from <head> on the
	// first swap, and count.js falls back to this once its tag is gone.
	window.goatcounter = {
		...window.goatcounter,
		...GOATCOUNTER_SETTINGS,
		endpoint: GOATCOUNTER_ENDPOINT,
	};

	let loaded = false;
	const queue: CountVars[] = [];
	const send = (vars: CountVars) => window.goatcounter?.count?.(vars);

	const script = document.createElement("script");
	script.async = true;
	script.src = GOATCOUNTER_SRC;
	script.integrity = GOATCOUNTER_INTEGRITY;
	script.crossOrigin = "anonymous";
	script.dataset.goatcounter = GOATCOUNTER_ENDPOINT;
	script.dataset.goatcounterSettings = JSON.stringify(GOATCOUNTER_SETTINGS);
	script.addEventListener("load", () => {
		loaded = true;
		queue.splice(0).forEach(send);
	});
	document.head.append(script);

	let first = true;
	document.addEventListener("astro:page-load", () => {
		const meta = document.querySelector<HTMLMetaElement>('meta[name="hit-path"]');
		const path = normalisePath(meta?.content);
		if (!path) return;
		// After a soft navigation document.referrer is still the page the
		// visit arrived from; an empty referrer stops it being credited again.
		const vars: CountVars = first
			? { path, title: document.title }
			: { path, title: document.title, referrer: "" };
		first = false;
		whenVisible(() => (loaded ? send(vars) : queue.push(vars)));
	});
}
