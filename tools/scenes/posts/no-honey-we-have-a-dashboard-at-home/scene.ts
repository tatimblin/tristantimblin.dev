/**
 * No Honey, We Have a Dashboard at Home — the post's art, as a baked
 * scene: THE GRAPHIC ALONE, in simple shapes. The post's claim is that a
 * fleet dashboard is a worse copy of the editor you already have open: its
 * list, its digital twin, its actions and its live signals are all panes
 * the editor already tiles. So the picture is a TILING of plain app windows
 * — a treemap of rectangles packed like a tiling window manager, cropped
 * by the plate on every side, one gutter throughout.
 *
 * Each window is a rectangle with a title bar (a rule under three small
 * dots). Some hold a very simple hint of content — a few bars (the list),
 * a green block (the terminal: live signals), a coral block, a bar and a
 * block — and some are empty. The largest holds the bold striped disc: the
 * car, as a node, the digital twin. Ink, green and coral; no words.
 *
 * The motion is `steps`, three beats: the FOCUS moves across the tiling —
 * a window's title bar fills solid, its first dot lit coral, while it is the
 * current one, list → signals → twin. The still frame is the last beat:
 * the twin's window focused.
 *
 *   bun run scenes:bake      → src/content/txt/no-honey-we-have-a-dashboard-at-home.svg
 *
 * Drawn from the kit and the stripe-disc recipe: no credit.
 */

import stripeDisc from "@whois/design-system/glyphs/recipes/stripe-disc";
import type { Kit } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

/** A window on the plate, and what it holds. */
interface Win {
	x: number;
	y: number;
	w: number;
	h: number;
	hint?: "list" | "green" | "coral" | "bar" | "block" | "twin";
}

/** The title bar's depth, a content inset, and the dots' radius and pitch. */
const BAR = 8;
const PAD = 6;
const [DOT, PITCH] = [1.3, 4.5];

/**
 * The tiling: three columns, each split its own way, a 6-unit gutter
 * throughout, running off every edge of the plate. Columns x −12…70,
 * 76…210, 216…332: the middle one a little left of centre.
 */
const WINS: Win[] = [
	// Left column: the list over the signals.
	{ x: -12, y: 12, w: 82, h: 82, hint: "list" },
	{ x: -12, y: 100, w: 82, h: 96, hint: "green" },
	// Middle: a sliver off the top, the twin, and two side by side under it.
	{ x: 76, y: -14, w: 134, h: 24 },
	{ x: 76, y: 16, w: 134, h: 114, hint: "twin" },
	{ x: 76, y: 136, w: 58, h: 60 },
	{ x: 140, y: 136, w: 70, h: 60, hint: "bar" },
	// Right: a coral block, a bar and block, and an empty one off the bottom.
	{ x: 216, y: -4, w: 116, h: 58, hint: "coral" },
	{ x: 216, y: 60, w: 116, h: 76, hint: "block" },
	{ x: 216, y: 142, w: 116, h: 54 },
];

/** Where the focus goes, one window a beat: the list, the signals, the twin. */
const FOCUS = [0, 1, 3];

/** The three dots' centres on a window's title bar, from its left end (or the plate's, when it runs off). */
const dots = (w: Win) => [0, 1, 2].map((i) => [Math.max(w.x, 0) + 6 + i * PITCH, w.y + BAR / 2] as const);

/** A window: its outline, the title bar's rule, the dots, and its hint. */
function win(k: Kit, w: Win): string[] {
	const out = [
		k.rect(w.x, w.y, w.w, w.h, { paint: "ink", weight: "hair" }),
		k.line(w.x, w.y + BAR, w.x + w.w, w.y + BAR, { paint: "ink", weight: "hair", cap: "butt" }),
		...dots(w).map(([x, y]) => k.dot(x, y, DOT, { paint: "ink" })),
	];
	const [cx, cy, cw, ch] = [w.x + PAD, w.y + BAR + PAD, w.w - 2 * PAD, w.h - BAR - 2 * PAD];
	// A window off the left edge keeps its content on the plate's side.
	const left = Math.max(cx, 10);
	switch (w.hint) {
		case "list":
			out.push(...[0, 1, 2, 3].map((i) => k.rect(left, cy + i * 10, [48, 34, 52, 26][i], 3, { paint: "none", fill: "ink" })));
			break;
		case "green":
			out.push(k.rect(left, cy, cx + cw - left, 40, { paint: "none", fill: "green" }));
			break;
		case "coral":
			out.push(k.rect(cx, cy, 38, ch, { paint: "none", fill: "red" }));
			break;
		case "bar":
			out.push(k.rect(cx, cy, cw - 20, 5, { paint: "none", fill: "ink" }));
			break;
		case "block":
			out.push(k.rect(cx, cy, 30, 30, { paint: "none", fill: "ink" }), k.rect(cx + 36, cy, 40, 3, { paint: "none", fill: "ink" }), k.rect(cx + 36, cy + 9, 26, 3, { paint: "none", fill: "dim" }));
			break;
		case "twin":
			out.push(part(k, stripeDisc, { at: [cx + cw / 2, cy + ch / 2], scale: 3.2 }));
			break;
	}
	return out;
}

/** The focus on a window: its title bar filled solid, its first dot lit coral. */
function focus(k: Kit, w: Win): string {
	const [x, y] = dots(w)[0];
	return k.group([k.rect(w.x, w.y, w.w, BAR, { paint: "none", fill: "ink" }), k.dot(x, y, DOT + 0.4, { paint: "red" })], { mark: "now" });
}

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const out = WINS.flatMap((w) => win(k, w));
		// The focus moves: one window's title bar solid a beat, ending on the twin.
		out.push(k.steps(FOCUS.map((i) => [focus(k, WINS[i])])));
		return out;
	},
});
