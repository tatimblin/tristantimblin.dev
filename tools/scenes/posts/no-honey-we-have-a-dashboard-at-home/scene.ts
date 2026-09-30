/**
 * No Honey, We Have a Dashboard at Home — the post's art, as a baked
 * scene: THE GRAPHIC ALONE, in simple shapes. The post's claim is that a
 * fleet dashboard is a worse copy of an editor you already have open:
 * everything it did — list cars, show a digital twin, run actions, tail
 * signals — is a part the editor already has. So nothing here is drawn
 * literally; four plain rectangles stand in for those four jobs.
 *
 *   left     THE DASHBOARD: the four jobs as a loose stack of separate
 *            pages, dashed and dim, running off the plate's left edge —
 *            struck through in coral (no separate frontend)
 *   right    THE EDITOR: one heavy frame, a solid bar across its top, and
 *            the same four rectangles docked into it — the list a solid
 *            column (the sidebar), the twin a pane holding a bold striped
 *            disc (the car, as a node), the actions a key, the signals a
 *            green bar (live: the terminal)
 *
 * No words: it is a teaser, not a sheet.
 *
 * The motion is `steps`, four beats, one per job: its rectangle lands in
 * the editor. The still frame is the last beat: all four docked.
 *
 *   bun run scenes:bake      → src/content/txt/no-honey-we-have-a-dashboard-at-home.svg
 *
 * Drawn from the kit and the stripe-disc recipe: no credit.
 */

import stripeDisc from "@whois/design-system/glyphs/recipes/stripe-disc";
import type { Kit } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

/** A box on the plate. */
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The editor's frame, and the depth of the bar across its top. */
const E: Box = { x: 134, y: 22, w: 164, h: 136 };
const BAR = 8;
const PAD = 5;
const GAP = 4;

/** The editor's inner box: the side column's width, the pane's depth, the key's, the signal bar's. */
const IN = { x: E.x + PAD, y: E.y + BAR + PAD, w: E.w - 2 * PAD, h: E.h - BAR - 2 * PAD };
const [SIDE, PANE, KEY] = [30, 80, 9];
const MAIN = { x: IN.x + SIDE + GAP, w: IN.w - SIDE - GAP };
const SIG = IN.h - PANE - KEY - 2 * GAP;

/** The four jobs, docked: where each sits in the editor (list, twin, actions, signals). */
const JOBS: Box[] = [
	{ x: IN.x, y: IN.y, w: SIDE, h: IN.h },
	{ x: MAIN.x, y: IN.y, w: MAIN.w, h: PANE },
	{ x: MAIN.x, y: IN.y + PANE + GAP, w: 48, h: KEY },
	{ x: MAIN.x, y: IN.y + PANE + KEY + 2 * GAP, w: MAIN.w, h: SIG },
];

/** A job's rectangle, drawn as it docks: each its own plain treatment. */
function docked(k: Kit, i: number): string[] {
	const { x, y, w, h } = JOBS[i];
	switch (i) {
		case 1:
			return [k.rect(x, y, w, h, { paint: "ink" }), part(k, stripeDisc, { at: [x + w / 2, y + h / 2], scale: 2.5 })];
		case 3:
			return [k.rect(x, y, w, h, { paint: "none", fill: "green" })];
		default:
			return [k.rect(x, y, w, h, { paint: "none", fill: "ink" })];
	}
}

/** The dashboard: the same four jobs as separate pages, stacked off the plate's left edge. */
const PAGES: Box[] = [
	{ x: -14, y: 31, w: 84, h: 23 },
	{ x: -14, y: 64, w: 84, h: 31 },
	{ x: -14, y: 105, w: 84, h: 13 },
	{ x: -14, y: 128, w: 84, h: 18 },
];

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const out: string[] = [];

		// THE DASHBOARD: four separate pages, dashed, struck through in coral.
		out.push(...PAGES.map((p) => k.rect(p.x, p.y, p.w, p.h, { paint: "dim", dash: "dash" })));
		out.push(k.line(-6, 162, 48, 16, { paint: "red", weight: "line" }));
		// The trace from the stack into the editor.
		out.push(k.guide([[80, 90], [E.x - 5, 90]]), k.arrowhead(E.x - 5, 90, 90, 3, { paint: "dim" }));

		// THE EDITOR: the heavy frame and the solid bar across its top.
		out.push(k.rect(E.x, E.y, E.w, E.h, { paint: "ink", weight: "line" }), k.rect(E.x, E.y, E.w, BAR, { paint: "none", fill: "ink" }));

		// The dock: a beat per job — its rectangle lands in the editor.
		const beats = JOBS.map((_, i) => docked(k, i));

		return [...out, k.steps(beats)];
	},
});
