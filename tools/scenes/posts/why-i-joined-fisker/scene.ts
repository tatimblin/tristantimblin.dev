/**
 * Your Car Knows You're Getting Sick — the post's art, as a baked scene:
 * THE GRAPHIC ALONE, the driving HUD across the whole plate. The post joins
 * Fisker to read a driver's health off the car's own signals — steering,
 * braking, acceleration — so the one strong element is the driver's view
 * drawn the way a synth panel draws it: not a car, a few lines standing for
 * one.
 *
 * The windshield's frame across the top, the road as a green one-point grid
 * running to a small blue skyline, the dash's edge with the console's step,
 * the gear knob (a rounded rect with its R) under it. Either side of the
 * road, a needle dial for a signal — STEER in blue, BRAKE in red — and on
 * the dash, the signal row: three bars under a bracket, lit in each dial's
 * colour and the road's green for acceleration; the vents and a lamp on the
 * right. No readouts: a teaser, not a sheet.
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
import { type Kit, type Point, round } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The road ------------------------------------------------------------------

/** The vanishing point, the road's near width, and the rows' spacing (its height). */
const V: Point = [160, 40];
const [ROAD_W, ROAD_H] = [300, 92];
/** Where the road ends far off (the skyline's baseline) and near (the dash). */
const FAR = 60;
const DASH = V[1] + ROAD_H;
/** The console's step in the dash: its half-width at the top, the rise. */
const [STEP_W, STEP_H] = [34, 12];
const DASH_LINE: Point[] = [
	[-10, DASH],
	[V[0] - STEP_W - 10, DASH],
	[V[0] - STEP_W, DASH - STEP_H],
	[V[0] + STEP_W, DASH - STEP_H],
	[V[0] + STEP_W + 10, DASH],
	[330, DASH],
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
	{ at: [22, 94], name: "STEER", paint: "blue", read: [0, 45, 70] },
	{ at: [274, 94], name: "BRAKE", paint: "red", read: [20, 80, 35] },
];
const [DR, SWEEP] = [16, [-20, 90] as const];

// --- The signal row, on the dash ----------------------------------------------------

const SIGNALS: ("blue" | "red" | "green")[] = ["blue", "red", "green"];
const ROW = { x: 40, y: DASH + 24, pitch: 17 };
const bar = (k: Kit, i: number, paint: "blue" | "red" | "green" | "dim") =>
	k.rect(ROW.x + i * ROW.pitch, ROW.y, 12, 3, { paint: "none", fill: paint });

export default scene({
	viewBox: "0 0 320 180",
	draw(k, ctx) {
		const clip = `${ctx.name}-road`;
		const out: string[] = [];

		// The windshield: the frame's top edge across the view, off the left, the pillar down on the right.
		out.push(k.path(`M -10 36 L 30 18 H 282 L 304 30 V 50`, { paint: "ink", weight: "line" }));

		// The road: its rails cut to the band between the skyline and the dash.
		const band = [[-10, FAR] as Point, [DASH_LINE[DASH_LINE.length - 1][0], FAR] as Point, ...[...DASH_LINE].reverse()];
		out.push(
			`<clipPath id="${clip}"><polygon points="${band.map((p) => p.join(",")).join(" ")}" /></clipPath>`,
			`<g clip-path="url(#${clip})">`,
			k.vanishingGrid(V[0], V[1], ROAD_W, ROAD_H, 0, 13, { paint: "green" }),
			`</g>`,
		);

		// The skyline on the horizon, where the road runs out.
		const sc = 1.7;
		out.push(part(k, skyline, { at: [V[0], FAR - 9 * sc], scale: sc, weight: "hair" }));

		// The dash: its edge with the console's step, and the gear knob under it — a rounded head with its R, the stick, the boot to the floor.
		const [kx, ky] = [V[0], DASH + 7];
		out.push(
			k.polyline(DASH_LINE, { paint: "ink", weight: "line" }),
			k.roundRect(kx - 8, ky, 16, 16, 5, { paint: "ink", weight: "line" }),
			k.text(kx, ky + 11.3, "R", { role: "title", size: 9, anchor: "middle", paint: "red" }),
			k.line(kx, ky + 16, kx, ky + 26, { paint: "ink", weight: "line" }),
			k.ring(kx, ky + 26, 3, { paint: "ink", weight: "hair" }),
			k.path(`M ${kx - 22} 190 C ${kx - 15} ${ky + 38} ${kx - 10} ${ky + 31} ${kx - 9} ${ky + 31} H ${kx + 9} C ${kx + 10} ${ky + 31} ${kx + 15} ${ky + 38} ${kx + 22} 190`, { paint: "dim", weight: "hair" }),
		);

		// The dials: the signal's name over its ticks and a dim track, the needle added per beat.
		for (const { at: [x, y], name, paint } of DIALS) {
			out.push(
				k.text(x, y - 21, name, { role: "title", size: 9, paint }),
				k.arc(x, y, DR + 2.5, SWEEP[0], SWEEP[1], { paint: "dim", weight: "hair" }),
				k.ticksRadial(x, y, DR - 4, DR, 5, SWEEP[0], SWEEP[1], { paint, weight: "line", cap: "butt" }),
			);
		}

		// The signal row: a bracket over the bars, a dim bar each until its beat lights it.
		out.push(
			k.path(`M ${ROW.x - 3} ${ROW.y - 4} V ${ROW.y - 8} H ${ROW.x + 2 * ROW.pitch + 15} V ${ROW.y - 4}`, { paint: "ink", weight: "hair" }),
			...SIGNALS.map((_, i) => bar(k, i, "dim")),
		);

		// The dash's right: the vents and a lamp.
		{
			const x0 = V[0] + STEP_W + 30;
			out.push(k.ticksLinear(x0, DASH + 12, x0 + 36, DASH + 12, 5, 11, { paint: "dim", weight: "hair" }), k.ring(290, DASH + 17.5, 4, { paint: "dim", weight: "hair" }));
		}

		// The read: a bar lit per beat (it stays); the road a third of a row nearer and the needles, current while it is.
		const beats = SIGNALS.map((paint, i) => [
			bar(k, i, paint),
			k.group(
				[
					rows(k, ((2 - i) * 1) / 3),
					...DIALS.map(({ at: [x, y], paint, read }) => k.needle(x, y, DR - 5, read[i], { paint, weight: "line", hub: 2.2 })),
				],
				{ mark: "now" },
			),
		]);
		out.push(k.steps(beats));

		return out;
	},
});
