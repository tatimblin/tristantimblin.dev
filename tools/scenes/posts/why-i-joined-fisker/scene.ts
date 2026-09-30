/**
 * Your Car Knows You're Getting Sick — the post's art, as a baked scene: a
 * MODULE SHEET. The post joins Fisker to read a driver's health off the
 * car's own signals — steering, braking, acceleration — so the panel is the
 * driver's seat drawn as the car infographic draws an icon: one clean line
 * illustration, a steering wheel cropped by the bottom edge and, through
 * its opening, a typical cluster of two dials under the binnacle hood.
 * Beside it, three tight modules lettered with the post's own numbers:
 * the three signals, each a small trace; the pipeline (8 TB a day in
 * parquet, 2M messages a second off the cars); the health reading the LSU
 * research points at, a bracketed state.
 *
 * OCCLUSION: the rim is the one thing in front of the cluster, and it is
 * round, so it does not change as the wheel turns. One clipPath (the plate
 * less the rim's band, even-odd) cuts the whole cluster behind it.
 *
 * The motion is `steps`, three beats: the car reads its signals. Each beat
 * lands one signal's trace (they stay) and holds the wheel's spokes at that
 * moment's angle (a now-mark) — turning for steering, square for braking,
 * straight for acceleration. The still frame is the last beat: all three
 * traces read, the wheel straight.
 *
 *   bun run scenes:bake      → src/content/txt/why-i-joined-fisker.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { grid, ids, type Kit, type Point, polar, round } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** A disc as one closed subpath: the clipPath's cut-outs. */
const discD = (x: number, y: number, r: number): string =>
	`M ${round(x - r)} ${round(y)} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;

// --- The sheet's grid: 3 × 2, the wheel across two columns and both rows ------

const cells = grid(3, 2, 12, 16);
/** The right column, top to bottom: the modules. */
const COL = { x: cells[2].x, w: cells[2].w };

// --- The wheel ------------------------------------------------------------------

/** The wheel's centre, low: the bottom edge crops it. */
const C: Point = [100, 150];
/** The rim's outer and inner edge, the hub, the hub's badge. */
const [R1, R0, HUB, BADGE] = [54, 48, 13, 7];

/** The three spokes at `rot`: each a flat bar, hub to rim, flaring where it meets the rim; one path. */
function spokes(rot: number): string {
	return [270, 90, 180]
		.map((a) => {
			const deg = (w: number, r: number) => (w / r) * (180 / Math.PI);
			const p = (r: number, w: number) => polar(C[0], C[1], r, a + rot + deg(w, r)).join(" ");
			// Out along one edge, a flare into the rim, back along the other.
			return `M ${p(HUB, -3)} L ${p(R0 - 9, -3)} Q ${p(R0 - 1, -3)} ${p(R0, -8)} M ${p(R0, 8)} Q ${p(R0 - 1, 3)} ${p(R0 - 9, 3)} L ${p(HUB, 3)}`;
		})
		.join(" ");
}

// --- The cluster, behind the rim -------------------------------------------------

/** The two dials — power, speed — either side of where the centre display was. */
const DIALS: { at: Point; label: string; value: number; red?: [number, number] }[] = [
	{ at: [74, 88], label: "PWR", value: 0.34, red: [0.78, 1] },
	{ at: [126, 88], label: "KM/H", value: 0.52 },
];
const DR = 21;
const SWEEP: [number, number] = [-130, 130];
const angleOf = (v: number) => SWEEP[0] + v * (SWEEP[1] - SWEEP[0]);

function cluster(k: Kit): string[] {
	const out = [
		// The binnacle's brow over the dials, falling behind the rim either side.
		k.path("M 38 118 C 38 70 58 58 100 58 C 142 58 162 70 162 118", { paint: "ink", weight: "hair" }),
	];
	for (const { at: [x, y], label, value, red } of DIALS) {
		out.push(
			k.ring(x, y, DR, { paint: "ink", weight: "line" }),
			k.ticksRadial(x, y, DR - 5, DR - 2, 6, SWEEP[0], SWEEP[1], { paint: "ink", weight: "hair" }),
			k.ticksRadial(x, y, DR - 3.5, DR - 2, 21, SWEEP[0], SWEEP[1], { paint: "dim", weight: "hair" }),
			...(red ? [k.band(x, y, DR - 8, DR - 6.5, angleOf(red[0]), angleOf(red[1]), { paint: "red", cap: "butt" })] : []),
			k.needle(x, y, DR - 7, angleOf(value), { paint: "ink", weight: "line", hub: 0 }),
			k.dot(x, y, 1.6, { paint: "ink" }),
			k.text(x, y + 8, label, { role: "caption", anchor: "middle" }),
		);
	}
	return out;
}

// --- The signals: three lanes, a trace each -----------------------------------------

/** The lanes' baselines, and where a trace runs. */
const LANES = [34, 44, 54];
const [TX0, TX1] = [COL.x + 42, COL.x + COL.w];

/** A trace across its lane: `f(u)` for u in 0…1, up is positive, in units. */
const trace = (k: Kit, y: number, f: (u: number) => number): string => {
	const pts: Point[] = [];
	const n = 36;
	for (let i = 0; i <= n; i++) {
		const u = i / n;
		pts.push([TX0 + u * (TX1 - TX0), y - f(u)]);
	}
	return k.polyline(pts, { paint: "blue", weight: "hair" });
};
const SIGNALS: { name: string; f: (u: number) => number }[] = [
	// Steering: a wander, and small corrections riding it.
	{ name: "STEERING", f: (u) => 2.2 * Math.sin(u * 7.5) + 0.8 * Math.sin(u * 31 + 1) },
	// Braking: flat, then pressed twice, the second hard.
	{ name: "BRAKING", f: (u) => (u > 0.22 && u < 0.34 ? 1.8 : u > 0.58 && u < 0.8 ? 3.6 : 0) - 0.6 },
	// Acceleration: a pull away, easing to cruise, a lift and back on.
	{ name: "ACCEL", f: (u) => 3.6 * Math.exp(-(((u - 0.2) / 0.14) ** 2)) + 1.4 * Math.exp(-(((u - 0.78) / 0.1) ** 2)) - 1.2 },
];
/** The wheel through the beats: turning, square, straight. */
const ROT = [-16, 7, 0];

export default scene({
	viewBox: "0 0 320 180",
	draw(k, ctx) {
		const id = ids(23);
		const clip = `${ctx.name}-rim`;
		const { x, w } = COL;

		// The title over the drawing: the driver, the platform, the year.
		const head = [
			k.text(16, 24, "DRIVER_01", { role: "title" }),
			k.text(16, 32, "MAGNA EV PLATFORM // 2023", { role: "caption" }),
			k.text(cells[1].x + cells[1].w, 24, id.hex(), { role: "caption", anchor: "end" }),
		];

		// The wheel: the rim's two edges, the hub and its badge.
		const wheel = [
			k.ring(C[0], C[1], R1, { paint: "ink", weight: "line" }),
			k.ring(C[0], C[1], R0, { paint: "ink", weight: "hair" }),
			k.ring(C[0], C[1], HUB, { paint: "ink", weight: "line" }),
			k.ring(C[0], C[1], BADGE, { paint: "dim", weight: "hair" }),
		];

		// Module 1 — the signals: a section head, three lanes with their names and dotted baselines.
		const signals = [
			k.section(x, 16, w, "Signals // 03"),
			...SIGNALS.map((s, i) => k.text(x, LANES[i] + 1.3, s.name, { size: 3.5 })),
			...LANES.map((y) => k.rule(TX0, TX1, y, { dotted: true })),
		];

		// Module 2 — the pipeline: 8 TB a day, in parquet, off 2M messages a second.
		const pipeline = [
			k.section(x, 70, w, "Pipeline"),
			k.readout(x, 108, { value: "8", size: 32, caption: "TB / DAY", paint: "red" }),
			k.text(x + 22, 101, "PARQUET", { role: "caption" }),
			k.text(x + 22, 108, "2M MSG/S", { role: "caption" }),
		];

		// Module 3 — the health reading: the LSU research's state, bracketed.
		const health = [
			k.section(x, 124, w, "Health // LSU"),
			k.bracketLabel(x, 143, "Cognitive decline", { size: 3.5 }),
			k.text(x, 151, "DETECTION // SIGNAL DATA", { role: "caption" }),
			k.text(x, 164, id.id(), { role: "caption" }),
			k.text(x + w, 164, "TRAINING", { role: "caption", anchor: "end" }),
		];

		// The read: a trace lands per beat and stays; the spokes hold that beat's angle.
		const beats = SIGNALS.map((s, i) => [trace(k, LANES[i], s.f), k.path(spokes(ROT[i]), { paint: "ink", weight: "line", mark: "now" })]);

		return [
			`<clipPath id="${clip}"><path clip-rule="evenodd" d="M 0 0 H 320 V 180 H 0 Z ${discD(C[0], C[1], R1)} ${discD(C[0], C[1], R0)}" /></clipPath>`,
			`<g clip-path="url(#${clip})">`,
			...cluster(k),
			`</g>`,
			...wheel,
			...head,
			...signals,
			...pipeline,
			...health,
			k.steps(beats),
		];
	},
});
