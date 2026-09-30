/**
 * No Honey, We Have a Dashboard at Home — the post's art, as a baked scene:
 * a WINDOW AT HOME. The post builds its own fleet dashboard rather than
 * buying one, so the panel is the home it was built in: a window centred
 * on a wall of square tiles, and through the glass not a garden but a
 * room of grid — the dashboard at home.
 *
 * The wall is a dim hairline grid of tiles. The window is an outer frame,
 * the glass inset from it, and a cross mullion drawn as double lines
 * making four panes. Curtains hang gathered from a rod with round finials,
 * four hairline folds a side, caught in at the sill. On the sill, a small
 * potted plant, its leaves green. Through the glass, a perspective grid
 * room: blue rays from the glass's edge to one vanishing point, blue depth
 * rings between, and the far wall lit green.
 *
 * HIDDEN LINES: everything is line work on the plate, so nothing can paint
 * over what stands behind it. What is behind is CUT (`clipOutside`): the
 * wall's grid stops at the frame, the sill, the rod and the curtains; the
 * room stops at the mullion bars and at the plant's pot and leaves.
 *
 * A still: no motion.
 *
 *   bun run scenes:bake      → src/content/txt/no-honey-we-have-a-dashboard-at-home.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { clipOutside, edges, type Point, round, type Segment, segmentsD } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** An axis-aligned box: where it starts, how big it is. */
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A box's outline, its corners in order: the polygon `clipOutside` cuts against. */
const corners = ({ x, y, w, h }: Box): Point[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Cut `segs` outside every box in turn: what stands in front of them. */
const behind = (segs: Segment[], boxes: readonly Box[]): Segment[] => boxes.reduce((s, b) => clipOutside(s, corners(b)), segs);

/** A point as a path writes it. */
const xy = (x: number, y: number): string => `${round(x)} ${round(y)}`;

// --- The window ---------------------------------------------------------------

/** The outer frame, centred on the plate. */
const FRAME: Box = { x: 116, y: 34, w: 88, h: 104 };
/** The glass, inset from the frame. */
const GLASS: Box = { x: FRAME.x + 6, y: FRAME.y + 6, w: FRAME.w - 12, h: FRAME.h - 12 };
/** The cross mullion: its centre lines, and half a bar's width. */
const [MX, MY, BAR] = [FRAME.x + FRAME.w / 2, GLASS.y + GLASS.h * 0.46, 2.5];
const V_BAR: Box = { x: MX - BAR, y: GLASS.y, w: BAR * 2, h: GLASS.h };
const H_BAR: Box = { x: GLASS.x, y: MY - BAR, w: GLASS.w, h: BAR * 2 };
/** The sill, proud of the frame each side. */
const SILL: Box = { x: FRAME.x - 10, y: FRAME.y + FRAME.h, w: FRAME.w + 20, h: 6 };

// --- The rod and the curtains -----------------------------------------------------

/** The rod runs above the frame, 20 past it each side, a round finial at each end. */
const ROD_Y = FRAME.y - 8;
const [ROD_X0, ROD_X1] = [FRAME.x - 20, FRAME.x + FRAME.w + 20];
const ROD_BAND: Box = { x: ROD_X0, y: ROD_Y - 2, w: ROD_X1 - ROD_X0, h: 4 };
const FOLDS = 4;

/**
 * A curtain hung at `x0`, gathered outward (`dir`): four folds, each from
 * the rod swelling out, caught in at the sill's height and falling on to
 * it. Returns the folds as one path `d`, and the box it covers on the wall.
 */
function curtain(x0: number, dir: 1 | -1): { d: string; box: Box } {
	const folds: string[] = [];
	for (let i = 0; i < FOLDS; i++) {
		const top = x0 + dir * i * 4;
		const tie = x0 + dir * (i * 1.6 + 2);
		folds.push(
			`M ${xy(top, ROD_Y + 2)}` +
				` C ${xy(top + dir * 3, ROD_Y + 40)} ${xy(tie + dir * 6, FRAME.y + 70)} ${xy(tie, FRAME.y + 84)}` +
				` C ${xy(tie - dir * 3, FRAME.y + 96)} ${xy(top - dir, FRAME.y + 112)} ${xy(top + dir * 2, FRAME.y + FRAME.h - 2)}`,
		);
	}
	const outer = x0 + dir * 16;
	return { d: folds.join(" "), box: { x: Math.min(x0, outer) - 3, y: ROD_Y, w: 22, h: FRAME.h + 10 } };
}
const LEFT = curtain(FRAME.x - 2, -1);
const RIGHT = curtain(FRAME.x + FRAME.w + 2, 1);

// --- The plant on the sill ------------------------------------------------------

/** The pot's foot, on the sill near the right of the window. */
const [POT_X, POT_Y] = [FRAME.x + FRAME.w - 18, SILL.y];
/** The pot and the leaves as boxes: they stand in front of the glass and cut the room. */
const PLANT: Box[] = [
	{ x: POT_X - 5.5, y: POT_Y - 8.5, w: 11, h: 9 },
	{ x: POT_X - 9, y: POT_Y - 19, w: 17.5, h: 11 },
];
/** Two leaves from the pot's rim, a small one leaning left, a taller one right. */
const LEAVES = [
	`M ${xy(POT_X, POT_Y - 8)} C ${xy(POT_X - 1, POT_Y - 14)} ${xy(POT_X - 6, POT_Y - 16)} ${xy(POT_X - 9, POT_Y - 15)} C ${xy(POT_X - 6, POT_Y - 12)} ${xy(POT_X - 2, POT_Y - 11)} ${xy(POT_X, POT_Y - 8)}`,
	`M ${xy(POT_X, POT_Y - 8)} C ${xy(POT_X + 1, POT_Y - 16)} ${xy(POT_X + 5, POT_Y - 19)} ${xy(POT_X + 8, POT_Y - 19)} C ${xy(POT_X + 6, POT_Y - 15)} ${xy(POT_X + 3, POT_Y - 12)} ${xy(POT_X, POT_Y - 8)}`,
].join(" ");

// --- The room through the glass -------------------------------------------------

/** The vanishing point, a little below the glass's centre, and the far wall round it. */
const VP: Point = [GLASS.x + GLASS.w / 2, GLASS.y + GLASS.h / 2 + 4];
const BACK: Box = { x: VP[0] - 16, y: VP[1] - 16, w: 32, h: 30 };
/** A point on the glass's edge, carried to the far wall's edge. */
const toBack = (x: number, y: number): Point => [BACK.x + ((x - GLASS.x) / GLASS.w) * BACK.w, BACK.y + ((y - GLASS.y) / GLASS.h) * BACK.h];
/** The depth rings: how far each is from the glass toward the far wall, closing up as they recede. */
const DEPTHS = [0.3, 0.52, 0.68, 0.8, 0.89];

/** The room's grid: rays from the glass's four edges to the far wall — 8 across, 10 down — and the depth rings. */
function room(): Segment[] {
	const g = GLASS;
	const segs: Segment[] = [];
	for (let i = 0; i <= 8; i++) {
		const x = g.x + (g.w * i) / 8;
		segs.push([[x, g.y], toBack(x, g.y)], [[x, g.y + g.h], toBack(x, g.y + g.h)]);
	}
	for (let i = 1; i < 10; i++) {
		const y = g.y + (g.h * i) / 10;
		segs.push([[g.x, y], toBack(g.x, y)], [[g.x + g.w, y], toBack(g.x + g.w, y)]);
	}
	for (const t of DEPTHS) {
		const lerp = (a: number, b: number) => a + (b - a) * t;
		const [x0, y0] = [lerp(g.x, BACK.x), lerp(g.y, BACK.y)];
		const [x1, y1] = [lerp(g.x + g.w, BACK.x + BACK.w), lerp(g.y + g.h, BACK.y + BACK.h)];
		segs.push(...edges([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]));
	}
	return segs;
}

// --- The wall -----------------------------------------------------------------

/** Square tiles, 12 on a side, off the plate's edges. */
function wall(): Segment[] {
	const segs: Segment[] = [];
	for (let x = 2; x <= 320; x += 12) segs.push([[x, 0], [x, 180]]);
	for (let y = 4; y <= 180; y += 12) segs.push([[0, y], [320, y]]);
	return segs;
}

/** The mullion as double lines: each bar's two edges, broken where the bars cross. */
const MULLION: Segment[] = [
	...[MX - BAR, MX + BAR].flatMap((x): Segment[] => [[[x, GLASS.y], [x, MY - BAR]], [[x, MY + BAR], [x, GLASS.y + GLASS.h]]]),
	...[MY - BAR, MY + BAR].flatMap((y): Segment[] => [[[GLASS.x, y], [MX - BAR, y]], [[MX + BAR, y], [GLASS.x + GLASS.w, y]]]),
];

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		return [
			// The wall, stopping at everything in front of it.
			k.path(segmentsD(behind(wall(), [FRAME, SILL, LEFT.box, RIGHT.box, ROD_BAND])), { paint: "dim", weight: "hair" }),
			// Through the glass: the room, passing behind the mullion and the plant; its far wall lit green.
			k.path(segmentsD(behind(room(), [V_BAR, H_BAR, ...PLANT])), { paint: "blue", weight: "hair" }),
			k.path(segmentsD(behind(edges(corners(BACK)), [V_BAR, H_BAR])), { paint: "green", weight: "line" }),
			// The window over it: the frame, the glass's edge, the mullion.
			k.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, { paint: "ink", weight: "line" }),
			k.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h, { paint: "ink", weight: "hair" }),
			k.path(segmentsD(MULLION), { paint: "ink", weight: "hair" }),
			// The sill, and the plant on it: a tapered pot, two green leaves.
			k.rect(SILL.x, SILL.y, SILL.w, SILL.h, { paint: "ink", weight: "line" }),
			k.polygon([[POT_X - 5, POT_Y], [POT_X - 4, POT_Y - 8], [POT_X + 4, POT_Y - 8], [POT_X + 5, POT_Y]], { paint: "ink", weight: "hair" }),
			k.path(LEAVES, { paint: "none", fill: "green" }),
			// The rod, its finials, and the curtains hung from it.
			k.line(ROD_X0, ROD_Y, ROD_X1, ROD_Y, { paint: "ink", weight: "line" }),
			k.dot(ROD_X0, ROD_Y, 1.8, { paint: "ink" }),
			k.dot(ROD_X1, ROD_Y, 1.8, { paint: "ink" }),
			k.path(LEFT.d, { paint: "ink", weight: "hair" }),
			k.path(RIGHT.d, { paint: "ink", weight: "hair" }),
		];
	},
});
