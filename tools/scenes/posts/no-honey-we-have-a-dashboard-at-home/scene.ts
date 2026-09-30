/**
 * No Honey, We Have a Dashboard at Home — the post's art, as a baked
 * scene: a MODULE SHEET. The post's claim is that a fleet dashboard is a
 * worse copy of an editor you already have open, so the one strong
 * element is that editor, drawn as a line icon: an activity bar, a
 * sidebar that is the list of cars (a tree view, one car selected), the
 * digital twin open as a document (the car in side profile, dimensioned),
 * the palette running UNLOCK, and a terminal tailing a signal. Beside it,
 * two tight modules in the plate's type voices: the count the post ends on
 * — no separate frontend, deploy pipeline or auth system: 0, 0, 0 — and
 * the route the idea took, Yext in 2022 (the extension, multi-tenant
 * auth, seven accounts in the sidebar, a `.yextrc`) to Fisker.
 *
 * Ink line work on a grid with air, coral for the one big numeral, green
 * for what is live (the selected car, the signal's head). A still: no
 * motion.
 *
 *   bun run scenes:bake      → src/content/txt/no-honey-we-have-a-dashboard-at-home.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import type { Kit } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** A number as a path writes it. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

// --- The editor window ---------------------------------------------------------

/** The window: its box, the title bar's depth, the activity bar's and the sidebar's widths, the panel's top, the status bar's depth. */
const W = { x: 16, y: 24, w: 158, h: 122 };
const TITLE = 9;
const ACT = 10;
const SIDE = 44;
const STATUS = 6;
const PANEL_Y = W.y + W.h - STATUS - 28;

const X_ACT = W.x + ACT;
const X_SIDE = X_ACT + SIDE;
const Y_BODY = W.y + TITLE;
const Y_STATUS = W.y + W.h - STATUS;
const X_END = W.x + W.w;

/** The cars in the tree: their ids, and which one is open. */
const CARS = ["OCN-0412", "OCN-0413", "OCN-0521", "OCN-0588", "OCN-0602", "OCN-0719"];
const OPEN = 2;

/**
 * The digital twin: an SUV in side profile, drawn on a local frame 60
 * long with the ground at y 0 (up negative), wheels at 13 and 47.
 */
const BODY =
	"M 2 -6 L 2 -12 C 2 -14 3 -15 5.5 -15.4 L 15 -17.4 L 36 -17.4 C 40.5 -17.4 44 -14.6 47.5 -11.6 L 55.5 -10 C 58.2 -9.4 59 -8.4 59 -6.5 L 59 -5 " +
	"L 53.5 -5 A 6.5 6.5 0 0 0 40.5 -5 L 19.5 -5 A 6.5 6.5 0 0 0 6.5 -5 L 2 -5 Z";
const GLASS = "M 16 -15.6 L 35.4 -15.6 C 38.6 -15.6 41.4 -14 44.2 -11.6 L 14.2 -11.6 Z M 29 -15.6 L 29 -11.6";
const DETAIL = "M 29 -11.6 L 29 -6.5 M 21 -9.8 H 24 M 36 -9.8 H 39 M 44.2 -11.6 L 45.6 -9.6 H 43.4 M 52.5 -8.2 L 57.4 -8.2 M 2 -10.2 L 4.4 -10.2";

/** The twin's placement in the editor: its frame's origin and scale. */
const TWIN = { x: X_SIDE + 12, y: PANEL_Y - 14, s: 1.35 };

/** A point on the twin's frame, on the plate. */
const tw = (x: number, y: number): [number, number] => [r2(TWIN.x + x * TWIN.s), r2(TWIN.y + y * TWIN.s)];

/** The signal the terminal tails: a stepped trace across the panel, its head live. */
const SIGNAL: [number, number][] = [
	[0, 0], [6, 0], [6, -5], [11, -5], [11, -2], [18, -2], [18, -7], [22, -7], [22, 0], [30, 0], [30, -4], [37, -4], [37, -1], [44, -1], [44, -6], [49, -6],
];

function editor(k: Kit): string[] {
	const out: string[] = [];
	const px = X_SIDE + 6;
	const py = PANEL_Y + 18;

	// The frame, its bars and panes: the outline the one emphasis weight.
	out.push(
		k.roundRect(W.x, W.y, W.w, W.h, 3, { weight: "line" }),
		k.path(
			`M ${W.x} ${Y_BODY} H ${X_END} M ${X_ACT} ${Y_BODY} V ${Y_STATUS} M ${X_SIDE} ${Y_BODY} V ${Y_STATUS} M ${W.x} ${Y_STATUS} H ${X_END} M ${X_SIDE} ${PANEL_Y} H ${X_END}`,
			{ cap: "butt" },
		),
	);

	// The title bar: three lights, and the palette running the unlock.
	for (let i = 0; i < 3; i++) out.push(k.ring(W.x + 5 + i * 4.5, W.y + TITLE / 2, 1.3));
	out.push(
		k.pill(W.x + 50, W.y + 2, 66, 5, { paint: "dim" }),
		k.text(W.x + 54, W.y + 5.9, "> FLEET: UNLOCK", { role: "label", size: 3.5 }),
	);

	// The activity bar: explorer, search, extensions, and the account at its foot.
	const ax = W.x + ACT / 2;
	out.push(
		k.path(`M ${ax - 2.4} ${Y_BODY + 4} h 3.4 l 1.4 1.4 v 4.6 h -4.8 Z`),
		k.ring(ax - 0.4, Y_BODY + 16.4, 1.9),
		k.line(ax + 1, Y_BODY + 17.8, ax + 2.6, Y_BODY + 19.4),
		k.path(`M ${ax - 2.6} ${Y_BODY + 25} h 2.3 v 2.3 h -2.3 Z M ${ax - 2.6} ${Y_BODY + 27.9} h 2.3 v 2.3 h -2.3 Z M ${ax + 0.3} ${Y_BODY + 27.9} h 2.3 v 2.3 h -2.3 Z M ${ax + 0.9} ${Y_BODY + 23.8} h 2.3 v 2.3 h -2.3 Z`),
		k.line(W.x + 0.8, Y_BODY + 24, W.x + 0.8, Y_BODY + 31.2, { weight: "line", paint: "green" }),
		k.ring(ax, Y_STATUS - 9, 1.5),
		k.arc(ax, Y_STATUS - 3.2, 3, -60, 60),
	);

	// The sidebar: the list of cars as a tree, the open one marked.
	out.push(k.text(X_ACT + 3.5, Y_BODY + 6, "FLEET // CARS", { role: "label", size: 3.5, paint: "dim" }));
	CARS.forEach((id, i) => {
		const y = Y_BODY + 14 + i * 7;
		const open = i === OPEN;
		if (open) out.push(k.rect(X_ACT + 1.5, y - 4.4, SIDE - 3, 6.4, { paint: "dim" }));
		out.push(
			k.chevron(X_ACT + 5, y - 1.4, open ? 180 : 90, 1.3),
			k.text(X_ACT + 8.5, y, id, { role: "label", size: 3.5, paint: open ? "ink" : "dim" }),
		);
		if (open) out.push(k.dot(X_SIDE - 4.5, y - 1.2, 1.1, { paint: "green" }));
	});

	// The editor: one tab, the twin open in it, dimensioned.
	out.push(
		k.path(`M ${X_SIDE} ${Y_BODY + 7} H ${X_SIDE + 1} V ${Y_BODY} M ${X_SIDE + 38} ${Y_BODY} V ${Y_BODY + 7} H ${X_END}`, { cap: "butt" }),
		k.text(X_SIDE + 4, Y_BODY + 5, "OCN-0521", { role: "label", size: 3.5 }),
		k.cross(X_SIDE + 33.5, Y_BODY + 3.5, 2, { paint: "dim" }),
		k.group([k.path(BODY), k.path(GLASS), k.path(DETAIL, { paint: "dim" })], {
			transform: `translate(${TWIN.x} ${TWIN.y}) scale(${TWIN.s})`,
		}),
		k.ring(...tw(13, -5), 4.8 * TWIN.s),
		k.ring(...tw(13, -5), 1.8 * TWIN.s, { paint: "dim" }),
		k.ring(...tw(47, -5), 4.8 * TWIN.s),
		k.ring(...tw(47, -5), 1.8 * TWIN.s, { paint: "dim" }),
		k.guide([tw(-4, 0.2), tw(64, 0.2)]),
	);
	// Its dimension over the roof: ticks at the bumpers, the digital twin's name.
	const [dx0, dy] = tw(2, -23);
	const [dx1] = tw(59, -23);
	out.push(
		k.path(`M ${dx0} ${dy} H ${dx1} M ${dx0} ${dy - 1.6} V ${dy + 1.6} M ${dx1} ${dy - 1.6} V ${dy + 1.6}`, { paint: "dim", cap: "butt" }),
		k.text((dx0 + dx1) / 2, dy - 2, "DIGITAL TWIN", { role: "caption", size: 3.5, anchor: "middle" }),
	);

	// The panel: a terminal tailing the car's signals, the trace's head live.
	out.push(
		k.text(X_SIDE + 4, PANEL_Y + 6, "$ FLEET TAIL --SIGNALS", { role: "label", size: 3.5, paint: "dim" }),
		k.polyline(SIGNAL.map(([x, y]) => [px + x * 1.6, py + y] as [number, number])),
		k.dot(px + 49 * 1.6 + 2, py - 6, 1.2, { paint: "green" }),
	);

	// The status bar: the account signed in.
	out.push(k.text(X_SIDE + 4, Y_STATUS + 4.4, "ACCOUNTS: 7", { role: "caption", size: 3.5 }));
	return out;
}

// --- The modules beside it ---------------------------------------------------------

const M = { x: 196, w: 108 };

function modules(k: Kit): string[] {
	const { x, w } = M;
	const out: string[] = [];

	// The count the post ends on: no separate frontend, pipeline or auth.
	out.push(
		k.section(x, 24, w, "No separate"),
		k.ring(x + w - 3, 30, 2.6, { paint: "dim", dash: "dotted" }),
		k.readout(x, 66, { value: "0", size: 32, caption: "frontends", paint: "red" }),
		k.text(x + 22, 51, "WAS: CREATE-REACT-APP", { role: "caption", size: 3.5 }),
		k.text(x + 22, 56, "DETAIL PAGE: 10 TABS", { role: "caption", size: 3.5 }),
		k.rule(x, x + w, 72, { dotted: true }),
		k.text(x, 80, "DEPLOY PIPELINES", { role: "label", size: 3.5 }),
		k.text(x + w, 80, "0", { role: "label", size: 3.5, anchor: "end" }),
		k.text(x, 87, "AUTH SYSTEMS", { role: "label", size: 3.5 }),
		k.text(x + w, 87, "0", { role: "label", size: 3.5, anchor: "end" }),
	);

	// The route: Yext in 2022, the extension and its auth, then Fisker.
	const y = 108;
	out.push(
		k.section(x, y, w, "Route // 2022"),
		k.text(x, y + 17, "YEXT", { role: "title", size: 9 }),
		k.line(x + 28, y + 13.6, x + w - 36, y + 13.6, { paint: "dim" }),
		k.arrowhead(x + w - 36, y + 13.6, 90, 2, { paint: "dim" }),
		k.text(x + w, y + 17, "FISKER", { role: "title", size: 9, anchor: "end" }),
		k.bracketLabel(x, y + 27, "multi-tenant auth", { size: 3.5 }),
		k.line(x, y + 34, x + 12, y + 34),
		k.arrowhead(x + 12, y + 34, 90, 2),
		k.text(x + 16, y + 35.3, ".YEXTRC", { role: "label", size: 3.5 }),
		k.text(x + w, y + 35.3, "VS CODE EXT.", { role: "label", size: 3.5, anchor: "end" }),
	);

	// Registration: a dim + in the gutter between the icon and the sheet.
	out.push(k.plus(185, 98, 4, { paint: "dim" }));
	return out;
}

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		return [
			...editor(k),
			...modules(k),
			k.text(W.x, W.y + W.h + 9, "LIST CARS // DIGITAL TWIN // UNLOCK // OTA UPDATE // TAIL SIGNALS", { role: "caption", size: 3.5 }),
		];
	},
});
