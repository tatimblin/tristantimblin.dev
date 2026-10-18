/**
 * The widths a picture is drawn at on the ruled post page, as the `sizes`
 * and `widths` a <Picture> needs to cut a srcset the browser can pick from.
 *
 * THE ARITHMETIC. The post sits in the site container: `min(100vw, 1200px)`
 * less a `clamp(1rem, 4vw, 2rem)` gutter each side (global.css), so the
 * content is 100vw − 32px under 400, 92vw to 800, 100vw − 64px to 1264 and
 * 1136px above it. From 1024 the page is four columns with a 16px gap
 * (PostLayout's --ruled-columns / --ruled-gap):
 *
 *   wide    the last three columns — the hero (Fig. 01), and a block that
 *           bleeds the row (a body figure, the fleet demo's poster):
 *           ¾·content − 4px, 848px at the cap.
 *   full    all four — a block that bleeds `full` (the fleet demo's poster):
 *           the content, 1136px at the cap.
 *
 * (The text holds the middle two, 560px at the cap; no picture sits there.)
 * Below 1024 a picture is the whole content width. `widths` brackets those
 * boxes at 1× and 2×; Astro drops any candidate wider than the source and
 * adds the source's own width, so a 1200px original tops out at itself.
 */
const NARROW = "(min-width: 800px) calc(100vw - 64px), (min-width: 400px) 92vw, calc(100vw - 32px)";

export const RULED_SIZES = {
	wide: `(min-width: 1264px) 848px, (min-width: 1024px) calc(75vw - 52px), ${NARROW}`,
	full: `(min-width: 1264px) 1136px, ${NARROW}`,
} as const;

export const RULED_WIDTHS = {
	wide: [400, 640, 848, 1280, 1696],
	full: [400, 640, 1136, 1600, 2272],
} as const;
