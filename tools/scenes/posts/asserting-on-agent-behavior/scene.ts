/**
 * Asserting on Agent Behavior — the post's art, as a baked scene: the
 * ASSERTION BOARD. Aptitude asserts on an agent's tool calls, their
 * parameters and their order, and the post's point is that those
 * assertions have to be loose: a tolerance, not a script. So the board is
 * a notched ticket with a green-washed band and ticks round it, three
 * bearings crossing the court, a few pixel marks, and two circles — each
 * an assertion's TOLERANCE ZONE. The agent walks it in alternating left
 * and right footprints (an outlined ball with the big toe inside, a heel
 * with a flat front): the start, two steps inside zone A, two inside zone
 * B, and a fifth that lands OUTSIDE B — coral print, coral ripple, the
 * zone turned coral, a pixel ✕: the assertion fails. A ruler in the
 * bottom band is the timeline, the `scale` glyph's own drawing at another
 * length, one tall tick per beat, with a pointer that steps along.
 *
 * The walk is the `steps` motion: one beat per landing, a ripple on each
 * (green where the assertion holds, coral where it breaks), the pointer a
 * `data-now` copy per beat. The still frame is the finished walk — the
 * failure in view — and the quilt tile replays it on hover.
 *
 *   bun run scenes:bake      → src/content/txt/asserting-on-agent-behavior.svg
 *
 * Drawn from nothing but the kit and the scale recipe: no credit.
 */

import { ruler, rulerPointer, type RulerOpts } from "@whois/design-system/glyphs/recipes/scale";
import type { Kit, Paint, Point } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** A number as the file writes it: a tenth is plenty on the plate, and it is deterministic. */
const r1 = (n: number): number => Math.round(n * 10) / 10;

// --- The board --------------------------------------------------------------

/** The outer ticket: a rounded rect, x0–x1 × y0–y1, corner R, with a V notch ND deep and NH half-tall at y NY on each side. */
const [X0, Y0, X1, Y1, R, NY, ND, NH] = [8, 10, 312, 170, 6, 90, 11, 14];
const OUTER = `M ${X0 + R} ${Y0} H ${X1 - R} Q ${X1} ${Y0} ${X1} ${Y0 + R} V ${NY - NH} L ${X1 - ND} ${NY} L ${X1} ${NY + NH} V ${Y1 - R} Q ${X1} ${Y1} ${X1 - R} ${Y1} H ${X0 + R} Q ${X0} ${Y1} ${X0} ${Y1 - R} V ${NY + NH} L ${X0 + ND} ${NY} L ${X0} ${NY - NH} V ${Y0 + R} Q ${X0} ${Y0} ${X0 + R} ${Y0} Z`;
/** The court inside it. */
const [I0, J0, I1, J1, IR] = [34, 27, 286, 153, 5];
const INNER = `M ${I0 + IR} ${J0} H ${I1 - IR} Q ${I1} ${J0} ${I1} ${J0 + IR} V ${J1 - IR} Q ${I1} ${J1} ${I1 - IR} ${J1} H ${I0 + IR} Q ${I0} ${J1} ${I0} ${J1 - IR} V ${J0 + IR} Q ${I0} ${J0} ${I0 + IR} ${J0} Z`;

/** The zones: each circle an assertion's tolerance — land inside and it holds. */
const A: Point = [100, 84];
const RA = 33;
const B: Point = [200, 96];
const RB = 50;

/** The timeline in the bottom band: the scale glyph's ruler, one tall tick (every third) per beat. */
const TIMELINE: RulerOpts = { x0: 118, x1: 212, y: 163, ticks: 16, major: 3, mid: 0, heights: [5, 0, 2.5], paint: "green", accent: "ink", size: 2.6 };

// --- The walk ---------------------------------------------------------------

/** A sole in two outlines, drawn as the right foot pointing up: the ball with its big toe on the inside, and a heel with a flat front edge. */
const BALL = "M -0.8 -13 C 2.6 -13.3 4.6 -10.4 4.6 -6 C 4.6 -2.2 3.4 1 1 1.8 C -1.4 2.5 -3.3 1.2 -3.7 -2 C -4 -5 -3.8 -8.4 -3.2 -10.6 C -2.7 -12.3 -1.9 -13 -0.8 -13 Z";
const HEEL = "M -2.5 4.8 H 2.8 C 3.1 9.2 2.1 12 0.2 12 C -1.8 12 -2.8 9.2 -2.5 4.8 Z";
const FOOT_SCALE = 0.85;

/** The landings, the walk's centre line: the start, two in zone A, two in zone B, one out. Feet alternate, the left first. */
const WALK: Point[] = [[58, 140], [84, 108], [112, 74], [170, 102], [206, 74], [268, 118]];

const inZone = ([x, y]: Point): boolean => Math.hypot(x - A[0], y - A[1]) <= RA || Math.hypot(x - B[0], y - B[1]) <= RB;
/** The heading from `a` to `b`, degrees on the dial (0 up, clockwise): where a foot at `a` points. */
const bearing = (a: Point, b: Point): number => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;

/** A footprint at `at`, pointing `angle`, the left foot mirrored. */
const foot = (k: Kit, at: Point, angle: number, left: boolean, paint: Paint): string =>
	k.group([k.path(BALL, { paint, weight: "line" }), k.path(HEEL, { paint, weight: "line" })], {
		transform: `translate(${r1(at[0])} ${r1(at[1])}) rotate(${r1(angle)}) scale(${left ? `-${FOOT_SCALE} ${FOOT_SCALE}` : FOOT_SCALE})`,
	});

// --- The board's pixel marks --------------------------------------------------

/** A mark of 3.2-unit pixels on a 3.4 pitch about `(cx, cy)`: one path, so a mark is one element. */
const PX = 3.2;
const PITCH = 3.4;
const pixels = (k: Kit, cx: number, cy: number, cells: readonly Point[], paint: Paint): string =>
	k.path(cells.map(([i, j]) => `M ${r1(cx + i * PITCH - PX / 2)} ${r1(cy + j * PITCH - PX / 2)} h ${PX} v ${PX} h -${PX} Z`).join(" "), { paint: "none", fill: paint });
/** The ✕ and the + as pixels. */
const CROSS: Point[] = [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]];
const PLUS: Point[] = [[0, -1], [-1, 0], [1, 0], [0, 1]];

export default scene({
	viewBox: "0 0 320 180",
	draw(k, ctx) {
		const chrome = { paint: "green", weight: "hair", cap: "butt" } as const;
		const clip = `${ctx.name}-board`;

		// The band's ticks: along the top, along the bottom clear of the ruler, and down both sides clear of the notches.
		const ticks: string[] = [];
		for (let x = 46; x <= 276; x += 23) {
			ticks.push(`M ${x} ${Y0 + 6} V ${Y0 + 11}`);
			if (x < 116 || x > 214) ticks.push(`M ${x} ${Y1 - 11} V ${Y1 - 6}`);
		}
		for (let y = 40; y <= 140; y += 25) {
			if (Math.abs(y - NY) > 18) ticks.push(`M ${X0 + 13} ${y} H ${X0 + 18} M ${X1 - 18} ${y} H ${X1 - 13}`);
		}
		// A dim centre rule of short ticks down the court.
		const rule = Array.from({ length: 5 }, (_, i) => `M 157 ${40 + i * 25} H 163`).join(" ");

		const board = [
			// The band between the ticket and the court, washed green; the court left dark.
			k.path(`${OUTER} ${INNER}`, { paint: "none", fill: k.wash("green", 18), evenodd: true }),
			k.path(OUTER, { paint: "green", weight: "line" }),
			k.path(INNER, { paint: "green", weight: "hair" }),
			k.path(ticks.join(" "), chrome),
			k.path(rule, { paint: "dim", weight: "hair", cap: "butt" }),
			// Three bearings across the whole board, clipped to the ticket.
			`<clipPath id="${clip}"><path d="${OUTER}" /></clipPath>`,
			`<g clip-path="url(#${clip})">`,
			k.line(0, 42, 320, 146, { paint: "green", weight: "hair" }),
			k.line(0, 134, 206, 88, { paint: "green", weight: "hair" }),
			k.line(136, 0, 190, 180, { paint: "green", weight: "hair" }),
			"</g>",
			// The zones.
			k.ring(A[0], A[1], RA, { paint: "green", weight: "line" }),
			k.ring(B[0], B[1], RB, { paint: "green", weight: "line" }),
			// The board's own glyphs: pixel marks and two dots.
			pixels(k, 122, 102, CROSS, "green"),
			pixels(k, 222, 70, PLUS, "green"),
			pixels(k, 270, 58, CROSS, "green"),
			k.dot(60, 132, 2.6, { paint: "green" }),
			k.dot(234, 118, 2.2, { paint: "green" }),
			// A dim dotted trail joining the landings, a touch under the prints.
			k.guide(WALK.map(([x, y]) => [x, y + 2] as Point)),
			// The timeline; its pointer is in the beats.
			...ruler(k, TIMELINE),
		];

		// The walk, one beat per landing.
		const beats = WALK.map((at, i) => {
			const heading = i < WALK.length - 1 ? bearing(at, WALK[i + 1]) : bearing(WALK[i - 1], at);
			const left = i % 2 === 0;
			const ok = i === 0 || inZone(at);
			const paint: Paint = ok ? "ink" : "red";
			return [
				foot(k, at, heading, left, paint),
				// The landing's ripple: green where the assertion holds, coral where it breaks; the start has none.
				...(i > 0 ? [k.ring(at[0], at[1], 9, { paint: ok ? "green" : "red", weight: "hair", mark: "ripple" })] : []),
				// The failure: the zone turns coral and a pixel ✕ lands beside the print.
				...(ok ? [] : [pixels(k, at[0] + 18, at[1] - 12, CROSS, "red"), k.ring(B[0], B[1], RB, { paint: "red", weight: "line" })]),
				// The pointer under the timeline, at this beat's tall tick.
				k.group(rulerPointer(k, TIMELINE, i * 3), { mark: "now" }),
			];
		});

		return [...board, k.steps(beats)];
	},
});
