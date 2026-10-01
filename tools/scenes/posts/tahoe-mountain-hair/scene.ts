/**
 * Tahoe Mountain Hair — the post's art, as a baked scene: THE ROOM, AS A
 * REVERB. A synth's reverb module draws its room face-on with sliders round
 * it; this one draws the climate a head of hair lives in, and the routine is
 * the hand on its controls. A teaser, not a sheet: a module front panel.
 *
 * THE ROOM is the reverb's: zigzag walls hatched on the left (off the plate)
 * and the right, a dim tiled grid between them (a shower's tiles), a label
 * plate hanging from the top reading TAHOE, a side bay with the mountain's
 * ridge in it — the elevation, drawn once. Standing in it where the
 * microphone stood is THE ORB: a ringed ball, five holes round a coral
 * core, on a stem.
 *
 * THE CONTROLS are the module's three sliders, each a blue track with a ring
 * handle, a dimension line with arrowheads and a centred caps label:
 * ELEVATION across the top (high: Tahoe's 6,225 ft), HUMIDITY up the right
 * (low: the dry mountain air), HARDNESS across the bottom, under the orb (hard: the mineral
 * water the routine puts back).
 *
 * The motion is `steps`, four beats: San Francisco's settings — low, humid,
 * soft — then the routine turning one control a beat to Tahoe's, a ripple at
 * the handle it moved. Each beat's now-mark is the three handles and their
 * lit tracks at that moment. The still is the last beat: Tahoe, dialled in.
 *
 *   bun run scenes:bake      → src/content/txt/tahoe-mountain-hair.svg
 *
 * Drawn from the kit: no credit.
 */

import { clipOutside, edges, type Kit, type Point, type Segment, segmentsD } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

// --- The room ------------------------------------------------------------------

/** The module's outline: off the left edge, the bay on its right. */
const ROOM = { x0: -8, x1: 232, y0: 40, y1: 146 };
/** The walls: the zigzag's teeth run between these x, a tooth every PITCH down. */
const WALL_L = { back: 8, tip: 20 };
const WALL_R = { back: 188, tip: 176 };
/** The right wall's back, and the bay beyond it. */
const BAY = 192;
const TEETH = 9;
const PITCH = (ROOM.y1 - ROOM.y0) / TEETH;
/** The tiles: the grid between the walls. */
const TILE = 15.6;
/** The orb, where the microphone stood: its centre and radius. */
const ORB: Point = [72, 88];
const ORB_R = 15;
/** The label plate, hanging from the top. */
const PLATE = { x0: 98, x1: 150, y0: ROOM.y0, y1: ROOM.y0 + 15 };

/** A zigzag wall from the top to the bottom, its teeth pointing in. */
const zigzag = ({ back, tip }: { back: number; tip: number }): Point[] =>
	Array.from({ length: TEETH * 2 + 1 }, (_, i) => [i % 2 ? tip : back, ROOM.y0 + (i * PITCH) / 2] as Point);

// --- The controls ----------------------------------------------------------------

type Axis = "x" | "y";
interface Slider {
	name: string;
	axis: Axis;
	/** the track's fixed coordinate, and its run from the low end to the high end */
	at: number;
	from: number;
	to: number;
	/** where the dimension line runs, beside the track */
	dim: number;
	/** San Francisco's setting and Tahoe's, 0–1 along the run */
	sf: number;
	tahoe: number;
}

const SLIDERS: Slider[] = [
	{ name: "ELEVATION", axis: "x", at: 28, from: 26, to: 206, dim: 13, sf: 0.06, tahoe: 0.88 },
	{ name: "HUMIDITY", axis: "y", at: 254, from: 142, to: 44, dim: 273, sf: 0.84, tahoe: 0.14 },
	{ name: "HARDNESS", axis: "x", at: 158, from: 16, to: 128, dim: 172, sf: 0.1, tahoe: 0.9 },
];
const HANDLE = 5;
const TRACK = 3.5;

/** A point on a slider's run, `t` from its low end. */
const on = (s: Slider, t: number): Point => {
	const v = s.from + (s.to - s.from) * t;
	return s.axis === "x" ? [v, s.at] : [s.at, v];
};

/** The dimension line: end ticks, a line each side of the centred label, an arrowhead at each end. */
function dimension(k: Kit, s: Slider): string[] {
	const [a, b] = [Math.min(s.from, s.to), Math.max(s.from, s.to)];
	const mid = (a + b) / 2;
	const gap = s.name.length * 2.6 + 4;
	const P = (u: number, v = 0): Point => (s.axis === "x" ? [u, s.dim + v] : [s.dim + v, u]);
	const segs: Segment[] = [
		[P(a, -3.5), P(a, 3.5)],
		[P(b, -3.5), P(b, 3.5)],
		[P(a + 1, 0), P(mid - gap, 0)],
		[P(mid + gap, 0), P(b - 1, 0)],
	];
	const [ax, ay] = P(a + 1);
	const [bx, by] = P(b - 1);
	const [lx, ly] = P(mid);
	return [
		k.path(segmentsD(segs), { paint: "ink", weight: "hair" }),
		k.arrowhead(ax, ay, s.axis === "x" ? 270 : 0, 2.6, { paint: "ink", weight: "hair" }),
		k.arrowhead(bx, by, s.axis === "x" ? 90 : 180, 2.6, { paint: "ink", weight: "hair" }),
		s.axis === "x"
			? k.text(lx, ly + 2.1, s.name, { size: 6, anchor: "middle" })
			: k.text(lx - 2.1, ly, s.name, { size: 6, anchor: "middle", turn: 90 }),
	];
}

/** A slider set to `t`: the track lit blue from its low end to the handle, and the handle — a ring and its dot. */
function handle(k: Kit, s: Slider, t: number): string[] {
	const [hx, hy] = on(s, t);
	const [x0, y0] = on(s, 0);
	const lit =
		s.axis === "x"
			? k.pill(x0, s.at - TRACK / 2, Math.max(TRACK, hx - HANDLE - 1 - x0), TRACK, { paint: "none", fill: "blue" })
			: k.pill(s.at - TRACK / 2, hy + HANDLE + 1, TRACK, Math.max(TRACK, y0 - hy - HANDLE - 1), { paint: "none", fill: "blue" });
	return [lit, k.ring(hx, hy, HANDLE, { paint: "ink", weight: "line", fill: "none" }), k.dot(hx, hy, 1.8, { paint: "ink" })];
}

export default scene({
	viewBox: "0 0 320 180",
	draw(k, ctx) {
		const hair = { weight: "hair" } as const;
		const out: string[] = [];

		// The tiles: a dim grid between the walls, cut round the label plate.
		const plate: Point[] = [[PLATE.x0, PLATE.y0], [PLATE.x1, PLATE.y0], [PLATE.x1, PLATE.y1], [PLATE.x0, PLATE.y1]];
		const grid: Segment[] = [];
		for (let x = WALL_L.tip + TILE; x < WALL_R.tip; x += TILE) grid.push([[x, ROOM.y0], [x, ROOM.y1]]);
		for (let y = ROOM.y0 + TILE; y < ROOM.y1; y += TILE) grid.push([[WALL_L.tip, y], [WALL_R.tip, y]]);
		// The orb stands in front of the tiles: cut them round its ball (a 24-gon) and its stem.
		const ball: Point[] = Array.from({ length: 24 }, (_, i) => [ORB[0] + Math.cos((i * Math.PI) / 12) * (ORB_R + 1.5), ORB[1] + Math.sin((i * Math.PI) / 12) * (ORB_R + 1.5)] as Point);
		const stem: Point[] = [[ORB[0] - 2, ORB[1]], [ORB[0] + 2, ORB[1]], [ORB[0] + 2, ROOM.y1], [ORB[0] - 2, ROOM.y1]];
		out.push(k.path(segmentsD(clipOutside(clipOutside(clipOutside(grid, plate), ball), stem)), { paint: "dim", ...hair }));

		// The walls: hatched between the room's edge and the zigzag, under one clip.
		const left = zigzag(WALL_L);
		const right = zigzag(WALL_R);
		const wallL: Point[] = [[ROOM.x0, ROOM.y0], ...left, [ROOM.x0, ROOM.y1]];
		const wallR: Point[] = [[BAY, ROOM.y0], ...right, [BAY, ROOM.y1]];
		const clip = `${ctx.name}-walls`;
		const hatch: Segment[] = [];
		for (let c = ROOM.y0 - 60; c < ROOM.y1 + 10; c += 4) {
			hatch.push([[ROOM.x0, c + ROOM.x0], [WALL_L.tip, c + WALL_L.tip]], [[WALL_R.tip, c], [BAY, c + (BAY - WALL_R.tip)]]);
		}
		const poly = (p: Point[]) => `<polygon points="${p.map((q) => q.join(",")).join(" ")}" />`;
		out.push(
			`<clipPath id="${clip}">${poly(wallL)}${poly(wallR)}</clipPath>`,
			`<g clip-path="url(#${clip})">`,
			k.path(segmentsD(hatch), { paint: "dim", ...hair }),
			`</g>`,
			k.polyline(left, { paint: "ink", weight: "line" }),
			k.polyline(right, { paint: "ink", weight: "line" }),
			k.line(BAY, ROOM.y0, BAY, ROOM.y1, { paint: "ink", weight: "line" }),
		);

		// The bay: the mountain's ridge, the elevation drawn once.
		const RIDGE: Point[] = [[BAY, 122], [201, 108], [208, 113], [219, 90], [232, 106]];
		out.push(
			k.polygon([...RIDGE, [ROOM.x1, ROOM.y1], [BAY, ROOM.y1]], { paint: "none", fill: k.wash("blue", 16) }),
			k.polyline(RIDGE, { paint: "ink", ...hair }),
		);

		// The module's outline over it all, and the label plate.
		out.push(
			k.roundRect(ROOM.x0, ROOM.y0, ROOM.x1 - ROOM.x0, ROOM.y1 - ROOM.y0, 3, { paint: "ink", ...hair, fill: "none" }),
			k.path(segmentsD(edges(plate).slice(1, 4)), { paint: "dim", ...hair }),
			k.text((PLATE.x0 + PLATE.x1) / 2, PLATE.y1 - 4.2, "TAHOE", { role: "title", size: 9, anchor: "middle" }),
		);

		// The orb, where the microphone stood: a ringed ball, five holes round a
		// coral core, on a stem to the floor.
		out.push(
			k.rect(ORB[0] - 1, ORB[1] + ORB_R, 2, ROOM.y1 - ORB[1] - ORB_R, { paint: "none", fill: "ink" }),
			k.ring(ORB[0], ORB[1], ORB_R, { paint: "ink", weight: "line", fill: "none" }),
			k.ring(ORB[0], ORB[1], ORB_R - 3.5, { paint: "ink", ...hair, fill: "none" }),
			...[0, 72, 144, 216, 288].map((a) => {
				const t = (a * Math.PI) / 180;
				return k.dot(ORB[0] + Math.sin(t) * 7.2, ORB[1] - Math.cos(t) * 7.2, 2.6, { paint: "ink" });
			}),
			k.dot(ORB[0], ORB[1], 3.4, { paint: "red" }),
		);

		// The controls: each slider's dimension line and its dim rail.
		for (const s of SLIDERS) {
			const [a, b] = [on(s, 0), on(s, 1)];
			out.push(...dimension(k, s), k.line(a[0], a[1], b[0], b[1], { paint: "dim", ...hair }));
		}

		// The routine: SF's settings, then one control a beat turned to Tahoe's.
		const state = (n: number) => SLIDERS.map((s, i) => (i < n ? s.tahoe : s.sf));
		const beats = [0, 1, 2, 3].map((n) => {
			const ts = state(n);
			const now = k.group(SLIDERS.flatMap((s, i) => handle(k, s, ts[i])), { mark: "now" });
			if (n === 0) return [now];
			const [rx, ry] = on(SLIDERS[n - 1], ts[n - 1]);
			return [k.ring(rx, ry, HANDLE + 2, { paint: "blue", ...hair, fill: "none", mark: "ripple" }), now];
		});

		return [...out, k.steps(beats)];
	},
});
