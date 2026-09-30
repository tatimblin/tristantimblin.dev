/**
 * No Honey, We Have a Dashboard at Home — the post's art, as a baked
 * scene: a MODULE SHEET in simple shapes. The post's claim is that a
 * fleet dashboard is a worse copy of an editor you already have open:
 * everything it did — list cars, show a digital twin, run actions, tail
 * signals — is a part the editor already has. So nothing here is drawn
 * literally; four plain rectangles stand in for those four jobs.
 *
 *   left     THE DASHBOARD: the four jobs as a loose stack of separate
 *            pages, dashed and dim, running off the plate — struck
 *            through in coral (no separate frontend)
 *   middle   THE EDITOR: one heavy frame, a solid bar across its top, and
 *            the same four rectangles docked into it — the list a solid
 *            column (the sidebar), the twin a pane holding a bold striped
 *            disc (the car, as a node), the actions a key, the signals a
 *            green bar (live: the terminal)
 *   right    the count the post ends on — 0 frontends, 0 deploy
 *            pipelines, 0 auth systems — the route (Yext in 2022, its
 *            `.yextrc` and multi-tenant auth, to Fisker), and the dock's
 *            meter
 *
 * The motion is `steps`, four beats, one per job: its rectangle lands in
 * the editor with a ripple, a pip of the meter lights, and the mapping
 * reads beside it (LIST → TREE VIEW … SIGNALS → TERMINAL, 1/4 … 4/4) as a
 * now-mark. The still frame is the last beat: all four docked, 4/4.
 *
 *   bun run scenes:bake      → src/content/txt/no-honey-we-have-a-dashboard-at-home.svg
 *
 * Drawn from the kit and the stripe-disc recipe: no credit.
 */

import stripeDisc from "@whois/design-system/glyphs/recipes/stripe-disc";
import { grid, type Kit, span } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

const cells = grid(3, 1, 12, 16);
const LEFT = span(cells[0], cells[1]);
const COL = cells[2];

/** A box on the plate. */
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The editor's frame, and the depth of the bar across its top. */
const E: Box = { x: 78, y: 44, w: 122, h: 104 };
const BAR = 6;
const PAD = 4;
const GAP = 3;

/** The four jobs, docked: where each sits in the editor, and what the editor already calls it. */
/** The editor's inner box: the side column's width, the pane's depth, the key's, the signal bar's. */
const IN = { x: E.x + PAD, y: E.y + BAR + PAD, w: E.w - 2 * PAD, h: E.h - BAR - 2 * PAD };
const [SIDE, PANE, KEY] = [22, 64, 7];
const MAIN = { x: IN.x + SIDE + GAP, w: IN.w - SIDE - GAP };
const SIG = IN.h - PANE - KEY - 2 * GAP;

const JOBS = [
	{ name: "list", is: "tree view", at: { x: IN.x, y: IN.y, w: SIDE, h: IN.h } },
	{ name: "twin", is: "document", at: { x: MAIN.x, y: IN.y, w: MAIN.w, h: PANE } },
	{ name: "actions", is: "command", at: { x: MAIN.x, y: IN.y + PANE + GAP, w: 36, h: KEY } },
	{ name: "signals", is: "terminal", at: { x: MAIN.x, y: IN.y + PANE + KEY + 2 * GAP, w: MAIN.w, h: SIG } },
] as const;

/** A job's rectangle, drawn as it docks: each its own plain treatment. */
function docked(k: Kit, i: number): string[] {
	const { x, y, w, h } = JOBS[i].at;
	switch (i) {
		case 0:
			return [k.rect(x, y, w, h, { paint: "none", fill: "ink" })];
		case 1:
			return [k.rect(x, y, w, h, { paint: "ink" }), part(k, stripeDisc, { at: [x + w / 2, y + h / 2], scale: 1.9 })];
		case 2:
			return [k.rect(x, y, w, h, { paint: "none", fill: "ink" })];
		default:
			return [k.rect(x, y, w, h, { paint: "none", fill: "green" })];
	}
}

/** The dashboard: the same four jobs as separate pages, stacked off the plate's left edge. */
const PAGES: Box[] = [
	{ x: -12, y: 54, w: 58, h: 18 },
	{ x: -12, y: 78, w: 58, h: 24 },
	{ x: -12, y: 108, w: 58, h: 10 },
	{ x: -12, y: 124, w: 58, h: 14 },
];

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const out: string[] = [];
		const { x } = LEFT;

		// The title over its rule, the sheet's name.
		out.push(k.text(x, 22.5, "FLEET_EXT", { role: "title" }), k.rule(x, x + 70, 27), k.text(x, 34, "THE DASHBOARD AT HOME", { role: "caption" }));

		// THE DASHBOARD: four separate pages, dashed, struck through in coral.
		PAGES.forEach((p, i) =>
			out.push(
				k.rect(p.x, p.y, p.w, p.h, { paint: "dim", dash: "dash" }),
				k.text(p.x + p.w - 3, p.y + 5.5, JOBS[i].name.toUpperCase(), { role: "caption", anchor: "end" }),
			),
		);
		out.push(
			k.line(-4, 146, 28, 46, { paint: "red", weight: "line" }),
			k.text(PAGES[3].x + PAGES[3].w, 148, "CRA // 10 TABS", { role: "caption", anchor: "end" }),
		);
		// The trace from the stack into the editor.
		out.push(k.guide([[52, 96], [E.x - 3, 96]]), k.arrowhead(E.x - 3, 96, 90, 2.5, { paint: "dim" }));

		// THE EDITOR: the heavy frame and the solid bar across its top.
		out.push(
			k.rect(E.x, E.y, E.w, E.h, { paint: "ink", weight: "line" }),
			k.rect(E.x, E.y, E.w, BAR, { paint: "none", fill: "ink" }),
			k.text(E.x + E.w, E.y + E.h + 7, "VS CODE // ALREADY OPEN", { role: "caption", anchor: "end" }),
		);

		// --- the column -----------------------------------------------------------
		const cx = COL.x;
		const cr = COL.x + COL.w;
		// NO SEPARATE: the big coral 0, and the other two zeros under it.
		out.push(
			k.readout(cx, 50, { value: "0", size: 32, label: "no separate", caption: "frontends", paint: "red" }),
			k.text(cx, 60, "DEPLOY PIPELINES", { size: 3.5 }),
			k.text(cr, 60, "0", { size: 3.5, anchor: "end" }),
			k.text(cx, 66.5, "AUTH SYSTEMS", { size: 3.5 }),
			k.text(cr, 66.5, "0", { size: 3.5, anchor: "end" }),
		);

		// ROUTE: Yext in 2022, then Fisker.
		out.push(
			k.section(cx, 78, COL.w, "Route // 2022"),
			k.text(cx, 93, "YEXT", { role: "title", size: 6 }),
			k.guide([[cx + 19, 91], [cr - 27, 91]]),
			k.arrowhead(cr - 27, 91, 90, 2, { paint: "dim" }),
			k.text(cr, 93, "FISKER", { role: "title", size: 6, anchor: "end" }),
			k.text(cx, 101, ".YEXTRC", { role: "caption" }),
			k.text(cr, 101, "[ MULTI-TENANT AUTH ]", { size: 3.5, anchor: "end" }),
		);

		// DOCKED: the meter, a pip per job.
		out.push(k.section(cx, 112, COL.w, "Docked"));
		const pip = (i: number, lit: boolean) => k.rect(cx + i * 7, 125, 5, 2, { paint: "none", fill: lit ? "ink" : "dim" });
		for (let i = 0; i < JOBS.length; i++) out.push(pip(i, false));
		out.push(k.dot(cr - 1.5, 126, 1.4, { paint: "green" }));

		// The dock: a beat per job — its rectangle lands in the editor with a ripple, a pip lights, the mapping reads.
		const beats = JOBS.map((job, i) => [
			...docked(k, i),
			pip(i, true),
			k.group(
				[
					k.text(cx, 137, `${job.name} → ${job.is}`.toUpperCase(), { size: 3.5 }),
					k.text(cr, 137, `${i + 1}/4`, { size: 3.5, anchor: "end" }),
				],
				{ mark: "now" },
			),
		]);

		return [...out, k.steps(beats)];
	},
});
