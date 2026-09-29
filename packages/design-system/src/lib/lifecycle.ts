/**
 * The page lifecycle under the client router, once.
 *
 * Every widget script on the site binds its handlers on `astro:page-load`
 * (which fires on the first load AND after every view-transition
 * navigation, since ClientRouter replaces the DOM) and tears them down on
 * `astro:before-swap`, so handlers never accumulate across navigations and
 * never watch a detached node. That idiom is this function.
 *
 *   onPage(() => {
 *     const el = document.querySelector(".wx-thing");
 *     if (!el) return;
 *     el.addEventListener("click", onClick);
 *     return () => el.removeEventListener("click", onClick);
 *   });
 *
 * `bind` runs on each page load and may return a teardown, which runs before
 * the next swap (and before the next bind, should a load fire twice). The
 * returned function unsubscribes from both events.
 */
export type Teardown = () => void;

export function onPage(bind: () => Teardown | void): Teardown {
	let teardown: Teardown | null = null;
	const load = () => {
		teardown?.();
		teardown = bind() ?? null;
	};
	const swap = () => {
		teardown?.();
		teardown = null;
	};
	document.addEventListener("astro:page-load", load);
	document.addEventListener("astro:before-swap", swap);
	return () => {
		swap();
		document.removeEventListener("astro:page-load", load);
		document.removeEventListener("astro:before-swap", swap);
	};
}
