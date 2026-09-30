/**
 * Your Car Knows You're Getting Sick — the post's art, as a baked scene: a
 * MODULE SHEET around THE DRIVING HUD. The post joins Fisker to read a
 * driver's health off the car's own signals — steering, braking,
 * acceleration — so the one strong element is the driver's view drawn the
 * way a synth panel draws it: not a car, a few lines standing for one.
 *
 *   left     the HUD (the left two cells): the windshield's frame across the
 *            top, the road as a green one-point grid running to a small blue
 *            skyline, the dash's edge with the console's step, the gear knob
 *            (a rounded rect with its R) under it. Either side of the road, a
 *            needle dial for a signal — STEER in blue, BRAKE in red — and on
 *            the dash, the signal row: the three names over their bars, lit
 *            in each dial's colour and the road's green for ACCEL.
 *   right    the sheet: DRIVER_01 on the Magna platform, 2023; the stream off
 *            the cars as the big thin numeral, 2M MSG/S; the pipeline, 8 TB a
 *            day in parquet; and the reading the LSU research points at,
 *            [ COGNITIVE DECLINE ].
 *
 * The motion is `steps`, three beats: the car reads its signals. Each beat
 * lights one signal's bar (it stays) and holds that moment as a now-mark —
 * the road's rows a third of a row nearer, the two needles where the
 * signals are. The still frame is the last beat: all three read.
 *
 * The road's rails are the kit's `vanishingGrid`, cut by one clipPath to
 * the band between the skyline and the dash; its rows are drawn per beat,
 * only where they fall inside that band.
 *
 *   bun run scenes:bake      → src/content/txt/why-i-joined-fisker.svg
 *
 * Drawn from the kit and the skyline recipe: no credit.
 */

import skyline from "@whois/design-system/glyphs/recipes/skyline";
import { grid, ids, type Kit, type Point, round, span } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The sheet's grid: three columns, the HUD across two ------------------------

const cells = grid(3, 1, 12, 16);
const HUD = span(cells[0], cells[1]);
const COL = cells[2];

// --- The road ------------------------------------------------------------------

/** The vanishing point, the road's near width, and the rows' spacing (its height). */
const V: Point = [HUD.x + HUD.w / 2, 40];
const [ROAD_W, ROAD_H] = [196, 88];
/** Where the road ends far off (the skyline's baseline) and near (the dash). */
const FAR = 57;
const DASH = V[1] + ROAD_H;
/** The console's step in the dash: its half-width at the top, the rise. */
const [STEP_W, STEP_H] = [26, 10];
const DASH_LINE: Point[] = [
	[-10, DASH],
	[V[0] - STEP_W - 8, DASH],
	[V[0] - STEP_W, DASH - STEP_H],
	[V[0] + STEP_W, DASH - STEP_H],
	[V[0] + STEP_W + 8, DASH],
	[HUD.x + HUD.w + 2, DASH],
];

/** The rows at `phase` (0…1 of a row): a perspective spacing, 1/(1 + i/2), only those inside the band. */
function rows(k: Kit, phase: number): string {
	const d: string[] = [];
	for (let i = 0; i < 24; i++) {
		const p = 1 / (1 + (i + phase) / 2);
		const y = V[1] + ROAD_H * p;
		if (y < FAR + 0.5) break;
		if (y > DASH - STEP_H - 0.5) continue;
		const h = (ROAD_W / 2) * p;
		d.push(`M ${round(V[0] - h)} ${round(y)} H ${round(V[0] + h)}`);
	}
	return k.path(d.join(" "), { paint: "green", weight: "hair", cap: "butt" });
}

// --- The dials: a signal each, either side of the road ------------------------------

const DIALS: { at: Point; name: string; paint: "blue" | "red"; read: number[] }[] = [
	{ at: [HUD.x + 4, 84], name: "STEER", paint: "blue", read: [0, 45, 70] },
	{ at: [HUD.x + HUD.w - 30, 84], name: "BRAKE", paint: "red", read: [20, 80, 35] },
];
const [DR, SWEEP] = [12, [-20, 90] as const];

// --- The signal row, on the dash ----------------------------------------------------

const SIGNALS: { name: string; paint: "blue" | "red" | "green" }[] = [
	{ name: "STR", paint: "blue" },
	{ name: "BRK", paint: "red" },
	{ name: "ACC", paint: "green" },
];
const ROW = { x: HUD.x + 26, y: DASH + 26, pitch: 13 };
const bar = (k: Kit, i: number, paint: "blue" | "red" | "green" | "dim") =>
	k.rect(ROW.x + i * ROW.pitch, ROW.y + 2, 9, 2.5, { paint: "none", fill: paint });

export default scene({
	viewBox: "0 0 320 180",
	draw(k, ctx) {
		const id = ids(23);
		const clip = `${ctx.name}-road`;
		const out: string[] = [];

		// The windshield: the frame's top edge across the view, off the left, the pillar down on the right.
		out.push(k.path(`M -10 34 L ${HUD.x + 14} 20 H ${HUD.x + HUD.w - 14} L ${HUD.x + HUD.w} 30 V 44`, { paint: "ink", weight: "line" }));

		// The road: its rails cut to the band between the skyline and the dash.
		const band = [[-10, FAR] as Point, [DASH_LINE[DASH_LINE.length - 1][0], FAR] as Point, ...[...DASH_LINE].reverse()];
		out.push(
			`<clipPath id="${clip}"><polygon points="${band.map((p) => p.join(",")).join(" ")}" /></clipPath>`,
			`<g clip-path="url(#${clip})">`,
			k.vanishingGrid(V[0], V[1], ROAD_W, ROAD_H, 0, 11, { paint: "green" }),
			`</g>`,
		);

		// The skyline on the horizon, where the road runs out.
		const sc = 1.3;
		out.push(part(k, skyline, { at: [V[0], FAR - 9 * sc], scale: sc, weight: "hair" }));

		// The dash: its edge with the console's step, and the gear knob under it — a rounded head with its R, the stick, the boot to the floor.
		const [kx, ky] = [V[0], DASH + 8];
		out.push(
			k.polyline(DASH_LINE, { paint: "ink", weight: "line" }),
			k.roundRect(kx - 6, ky, 12, 13, 4, { paint: "ink", weight: "line" }),
			k.text(kx, ky + 8.8, "R", { role: "title", size: 6, anchor: "middle", paint: "red" }),
			k.line(kx, ky + 13, kx, ky + 22, { paint: "ink", weight: "line" }),
			k.ring(kx, ky + 22, 2.5, { paint: "ink", weight: "hair" }),
			k.path(`M ${kx - 18} 190 C ${kx - 12} ${ky + 34} ${kx - 8} ${ky + 26} ${kx - 7} ${ky + 26} H ${kx + 7} C ${kx + 8} ${ky + 26} ${kx + 12} ${ky + 34} ${kx + 18} 190`, { paint: "dim", weight: "hair" }),
		);

		// The dials: the signal's name over its ticks and a dim track, the needle added per beat.
		for (const { at: [x, y], name, paint } of DIALS) {
			out.push(
				k.text(x, y - 16, name, { role: "title", size: 6, paint }),
				k.arc(x, y, DR + 2, SWEEP[0], SWEEP[1], { paint: "dim", weight: "hair" }),
				k.ticksRadial(x, y, DR - 3, DR, 5, SWEEP[0], SWEEP[1], { paint, weight: "line", cap: "butt" }),
			);
		}

		// The signal row: a bracket over the names, a dim bar under each until its beat lights it.
		out.push(
			k.text(HUD.x, ROW.y + 4.3, "SIG", { role: "title", size: 6, paint: "green" }),
			k.path(`M ${ROW.x - 2} ${ROW.y - 6} V ${ROW.y - 9} H ${ROW.x + 2 * ROW.pitch + 11} V ${ROW.y - 6}`, { paint: "ink", weight: "hair" }),
			...SIGNALS.map((s, i) => k.text(ROW.x + i * ROW.pitch + 4.5, ROW.y - 1, s.name, { size: 3.5, anchor: "middle" })),
			...SIGNALS.map((_, i) => bar(k, i, "dim")),
		);

		// The dash's right: the vents and a lamp.
		{
			const x0 = V[0] + STEP_W + 20;
			out.push(
				k.ticksLinear(x0, DASH + 10, x0 + 24, DASH + 10, 4, 8, { paint: "dim", weight: "hair" }),
				k.ring(HUD.x + HUD.w - 6, DASH + 14, 3, { paint: "dim", weight: "hair" }),
				k.text(HUD.x + HUD.w, DASH + 30, id.hex(), { role: "caption", anchor: "end" }),
			);
		}

		// --- the column -------------------------------------------------------
		const { x: cx, w: cw } = COL;
		const cr = cx + cw;
		out.push(
			k.text(cx, 22.5, "DRIVER_01", { role: "title" }),
			k.rule(cx, cr, 27),
			k.text(cx, 34, "MAGNA EV // 2023", { role: "caption" }),
			k.readout(cx, 72, { value: "2M", size: 32, label: "stream" }),
			k.text(cx + 50, 55, "MSG/S", { size: 4.5 }),
			k.text(cx, 80, "OFF THE CARS // LIVE", { role: "caption" }),
			k.section(cx, 90, cw, "Pipeline"),
			k.text(cx, 105, "8 TB / DAY", { size: 4.5 }),
			k.text(cx, 111, "PARQUET", { role: "caption" }),
			...Array.from({ length: 8 }, (_, i) => k.rect(cr - 2.5 - i * 4, 101, 2.5, 5, { paint: "none", fill: "ink" })),
			k.section(cx, 124, cw, "Health // LSU"),
			k.bracketLabel(cx, 142, "cognitive decline", { size: 3.5 }),
			k.dot(cr - 2, 140.8, 1.6, { paint: "red" }),
			k.text(cx, 150, "SIGNAL: DRIVER", { role: "caption" }),
			k.text(cr, 150, id.id(), { role: "caption", anchor: "end" }),
		);

		// The read: a bar lit per beat (it stays); the road a third of a row nearer and the needles, current while it is.
		const beats = SIGNALS.map((s, i) => [
			bar(k, i, s.paint),
			k.group(
				[
					rows(k, ((2 - i) * 1) / 3),
					...DIALS.map(({ at: [x, y], paint, read }) => k.needle(x, y, DR - 4, read[i], { paint, weight: "line", hub: 1.8 })),
				],
				{ mark: "now" },
			),
		]);
		out.push(k.steps(beats));

		return out;
	},
});

