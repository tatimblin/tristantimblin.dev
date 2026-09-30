/**
 * Tahoe Mountain Hair — the post's art, as a baked scene: THE WATER CYCLE
 * IN TWO INSETS. The post chases the hair a trip to Tahoe gave — mineral
 * water off granite, dry mountain air — so the panel is where that water
 * comes from, drawn as two touching circular map insets under a row of
 * phases about the sun.
 *
 * LEFT, the basin: the crest along the top, the lake in the bowl with an
 * island, a pier and a boat, pines on every shore, a lakeside town and a
 * hamlet to the south, fields, trails, a stream off the crest. RIGHT, the
 * granite: a range in front of a dimmer one (the one behind is CUT at
 * the front's ridge — `clipOutsidePolygon`, since a ridge is not convex),
 * strata, a tarn, scree, crystals in the rock, pines, a hut on its trail,
 * hills below. The creek runs from the tarn across the tangency into the
 * lake. Small leaders to label bars name the places, as a map would. The
 * phase row above: three waxing discs, the sun, three waning.
 *
 * The motion is `steps`, five beats round the cycle, each lighting its
 * phase disc and ringing it (the beat's now-mark): EVAPORATE (vapour off
 * the lake, the sun's rays go blue), CONDENSE (the next phase), SNOW
 * (flakes, a snowfield, caps on the peaks), MELT (the creek runs blue
 * from the tarn into the lake, carrying lavender minerals), COLLECT (a
 * ripple where it meets the lake, minerals through the water, the last
 * two phases lit). The still is the whole cycle; the quilt tile replays
 * it on hover.
 *
 * Both insets are drawn in their own coordinates (tangent at 160, 94,
 * radius 47) and placed by one transform, the row by another; strokes
 * are non-scaling, and the insets' clipPaths sit inside the transform so
 * they follow it.
 *
 *   bun run scenes:bake      → src/content/txt/tahoe-mountain-hair.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { chain, clipOutsidePolygon, insidePolygon, type Point, rng, round, segmentsD, smoothD } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** A point as a path writes it: a tenth is plenty at this scale. */
const r1 = (n: number): number => Math.round(n * 10) / 10;
const xy = ([x, y]: Point): string => `${r1(x)} ${r1(y)}`;

// --- Small marks, as subpaths so a field of them is one element -------------

/** A pine, its base at (x, y): a triangle and a trunk tick. */
const pine = (x: number, y: number, h = 4): string => `M ${xy([x, y - h])} L ${xy([x + h * 0.38, y])} H ${r1(x - h * 0.38)} Z M ${xy([x, y])} v ${r1(h * 0.3)}`;
/** A house, its floor's centre at (x, y). */
const house = (x: number, y: number, w = 3, h = 2.4): string => `M ${xy([x - w / 2, y])} v ${-h} l ${r1(w / 2)} ${-w * 0.45} l ${r1(w / 2)} ${w * 0.45} v ${h} Z`;
/** A disc: filled, a dot; stroked, a ring. */
const disc = (x: number, y: number, r: number): string => `M ${xy([x - r, y])} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
/** Meadow grass: a pair of short strokes per tuft, leaning `a` and `b`. */
const tufts = (pts: readonly Point[], a = "l -0.8 -1.8", b = "l 0.6 -1.6"): string => pts.map(([x, y]) => `M ${xy([x, y])} ${a} M ${xy([x + 1.2, y])} ${b}`).join(" ");
/** A crystal: a small upright hexagon, stroked. */
const crystal = ([x, y]: Point): string => `M ${x} ${y - 1.8} l 1.6 0.9 v 1.8 l -1.6 0.9 l -1.6 -0.9 v -1.8 Z`;

// --- The layout on the plate ---------------------------------------------------

/** The insets' radius in their own coordinates, their centres, and where they touch. */
const RAD = 47;
const L: Point = [113, 94];
const R: Point = [207, 94];
/** The insets on the plate: scaled 1.32 about the tangency, which sits at (160, 106). */
const MAP = "translate(160 106) scale(1.32) translate(-160 -94)";
/** The phase row on the plate: scaled 1.22 about the sun, which sits at (160, 25). */
const ROW = "translate(160 25) scale(1.22) translate(-160 -32)";

/** The row: seven discs 24 apart about the sun at the centre, radius 5. */
const SP = 24;
const PY = 32;
const PR = 5;
const PX = [-3, -2, -1, 0, 1, 2, 3].map((i) => 160 + i * SP);
/** How much of each phase is lit: a crescent, a half, a gibbous — the sun's slot none — then back. */
const LIT = [0.25, 0.5, 0.8, 0, 0.8, 0.5, 0.25];

const inCircle = (c: Point, r: number) => (p: Point): boolean => Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
const inL = inCircle(L, RAD - 2);
const inR = inCircle(R, RAD - 2);

// --- The basin ------------------------------------------------------------------

const LAKE: Point[] = [[88, 104], [96, 92], [112, 90], [128, 94], [142, 102], [147, 116], [136, 128], [116, 133], [98, 128], [86, 116]];
const inLake = (p: Point): boolean => insidePolygon(p, LAKE);
const CREST: Point[] = [[64, 82], [76, 66], [86, 74], [100, 58], [112, 68], [124, 60], [136, 70], [146, 62], [160, 74]];
const FOREST_W: Point[] = [[66, 84], [80, 80], [92, 88], [96, 100], [88, 112], [72, 108], [64, 96]];
const FOREST_S: Point[] = [[92, 134], [110, 136], [130, 134], [140, 140], [120, 146], [96, 146]];
const ISLAND: Point[] = [[122, 110], [127, 109], [129, 113], [124, 115]];
/** The lakeside town, its fourth house the tall one. */
const TOWN: Point[] = [[100, 88], [104, 87], [108, 88], [113, 87], [118, 88]];

// --- The granite ------------------------------------------------------------------

/** The front range's ridge, and the dimmer one behind it. */
const RANGE: Point[] = [[160, 106], [172, 84], [180, 92], [192, 64], [204, 84], [212, 72], [222, 86], [236, 68], [250, 92], [256, 100]];
const BACK: Point[] = [[160, 100], [170, 90], [178, 94], [186, 78], [198, 88], [206, 78], [216, 86], [228, 74], [240, 82], [250, 78], [258, 88]];
/** The front range as a solid: its ridge, closed down past the inset's foot. */
const RANGE_SOLID: Point[] = [...RANGE, [256, 150], [160, 150]];
const TARN: Point[] = [[226, 100], [234, 98], [240, 102], [236, 108], [228, 107]];
const TARN_BOX: Point[] = [[224, 96], [242, 96], [242, 110], [224, 110]];
/** The creek, from the tarn to the tangency, and on to the lake's shore. */
const CREEK: Point[] = [[228, 104], [218, 108], [204, 110], [188, 106], [172, 100], [160, 94]];
const CREEK_ON = " C 154 96 150 100 145 104";
/** The snowfield under the peaks. */
const SNOWFIELD: Point[] = [[180, 92], [186, 80], [192, 64], [204, 84], [212, 72], [222, 86], [236, 68], [246, 84], [248, 92], [232, 96], [208, 98]];

/** The places named: a dot at the place, a leader, a label bar of width w. */
const PLACES: [Point, Point, number][] = [
	[[113, 83], [122, 78], 10],
	[[100, 58], [104, 52], 10],
	[[124, 111], [130, 118], 9],
	[[236, 68], [220, 58], 10],
	[[240, 118], [230, 128], 6],
	[[234, 100], [238, 90], 8],
];

export default scene({
	viewBox: "0 0 320 180",
	draw(k, ctx) {
		const hair = { weight: "hair" } as const;
		const clipL = `${ctx.name}-l`;
		const clipR = `${ctx.name}-r`;
		/** Children clipped to an inset (inside the map's transform). */
		const clipped = (id: string, children: readonly string[]): string => `<g clip-path="url(#${id})">\n${children.join("\n")}\n</g>`;
		const inMap = (children: readonly string[]): string => k.group(children, { transform: MAP });
		const inRow = (children: readonly string[]): string => k.group(children, { transform: ROW });

		/** One seeded scatter for the whole panel: points in a box, kept by `ok`, never nearer than 3.2 to each other. */
		const rand = rng(3);
		const scatter = (n: number, x0: number, y0: number, w: number, h: number, ok: (p: Point) => boolean = () => true): Point[] => {
			const out: Point[] = [];
			for (let guard = 0; out.length < n && guard < n * 40; guard++) {
				const p: Point = [x0 + rand() * w, y0 + rand() * h];
				if (ok(p) && out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 3.2)) out.push(p);
			}
			return out;
		};
		const dots = (pts: readonly Point[], r: number): string => pts.map(([x, y]) => disc(x, y, r)).join(" ");

		// --- The phase row -----------------------------------------------------

		const links = PX.slice(0, -1).map((x, i) => `M ${x + (i === 3 ? 13 : PR + 1)} ${PY} H ${PX[i + 1] - (i + 1 === 3 ? 13 : PR + 1)}`);
		const row = [
			k.path(PX.filter((_, i) => i !== 3).map((x) => disc(x, PY, PR)).join(" "), { paint: "dim", ...hair }),
			k.ring(160, PY, 8, { paint: "ink", ...hair, fill: k.wash("blue", 14) }),
			k.ticksRadial(160, PY, 10, 13, 12, 0, 330, { paint: "dim", ...hair }),
			k.ring(160, PY, 5, { paint: "dim", ...hair, dash: "dotted" }),
			k.path(links.join(" "), { paint: "dim", ...hair }),
		];
		/** The lit lune of phase i: from the right while waxing, the left while waning. */
		const phase = (i: number): string => {
			const [x, r, f] = [PX[i], PR - 1.2, LIT[i]];
			const rx = r1(r * Math.abs(1 - 2 * f));
			const waxing = i < 3;
			const outer = waxing ? 1 : 0;
			const inner = (waxing ? 0 : 1) ^ (f > 0.5 ? 1 : 0);
			return k.path(`M ${x} ${round(PY - r)} A ${round(r)} ${round(r)} 0 0 ${outer} ${x} ${round(PY + r)} A ${rx} ${round(r)} 0 0 ${inner} ${x} ${round(PY - r)} Z`, { paint: "none", fill: "blue" });
		};
		/** The current beat's disc, ringed while it is current. */
		const nowRing = (i: number): string => k.ring(PX[i], PY, PR + 2.5, { paint: "blue", ...hair, mark: "now" });

		// --- The insets --------------------------------------------------------

		const labels = [
			k.path(PLACES.map(([a, b]) => `M ${xy(a)} L ${xy(b)}`).join(" "), { paint: "dim", ...hair }),
			k.path(dots(PLACES.map(([a]) => a), 0.8), { paint: "none", fill: "dim" }),
			k.path(PLACES.map(([, b, w]) => `M ${r1(b[0] + 1)} ${r1(b[1])} h ${w}`).join(" "), { paint: "dim", weight: "line", cap: "butt" }),
		];

		// The basin. The scatter's order is the drawing's: the pines first, then their sizes, then the meadow.
		const shore = (p: Point) => !inLake(p) && inL(p);
		const pinesL = [
			...scatter(22, 66, 84, 32, 30, shore),
			...scatter(14, 92, 130, 48, 12, shore),
			...scatter(8, 128, 64, 30, 22, (p) => shore(p) && p[0] < 144),
			...scatter(6, 70, 66, 24, 14, inL),
			...scatter(8, 84, 122, 14, 14, shore),
		];
		const pinesLD = pinesL.map(([x, y]) => pine(x, y, 3.2 + rand() * 1.6)).join(" ");
		const meadow = scatter(18, 138, 104, 20, 22, shore);
		const basin = clipped(clipL, [
			k.path(smoothD(FOREST_W, true), { paint: "none", fill: k.wash("green", 12) }),
			k.path(smoothD(FOREST_S, true), { paint: "none", fill: k.wash("green", 12) }),
			k.path(smoothD(LAKE, true), { paint: "blue", ...hair, fill: k.wash("blue", 22) }),
			// The lake's currents, the island with its two pines, a buoy, the stream off the crest.
			k.path("M 96 110 C 106 106 118 112 132 108 M 100 120 C 112 116 124 122 138 118", { paint: "blue", ...hair, dash: "dotted" }),
			k.path(smoothD(ISLAND, true), { paint: "blue", ...hair }),
			k.path(disc(134, 124, 1.2), { paint: "none", fill: "blue" }),
			k.path("M 86 74 C 84 82 92 86 90 94 C 89 98 92 100 94 102", { paint: "blue", ...hair }),
			k.path(pine(124, 111, 3) + pine(127, 112, 2.6), { paint: "green", ...hair }),
			k.polyline(CREST, { paint: "ink", ...hair }),
			// Contours, the forest, the town, the pier.
			k.path("M 66 90 Q 90 78 112 78 T 158 82 M 70 100 Q 96 86 124 84", { paint: "dim", ...hair, dash: "dotted" }),
			k.path(pinesLD, { paint: "green", ...hair }),
			k.path(TOWN.map(([x, y], i) => house(x, y, i === 3 ? 3.6 : 3, i === 3 ? 4 : 2.4)).join(" "), { paint: "ink", ...hair }),
			k.line(110, 90, 110, 98, { paint: "ink", ...hair }),
			k.dot(110, 98, 0.9, { paint: "ink" }),
			// Two fields, hatched.
			k.rect(146, 74, 10, 7, { paint: "dim", ...hair }),
			k.rect(148, 84, 10, 6, { paint: "dim", ...hair }),
			k.path("M 148 74 L 146 76 M 152 74 L 146 80 M 156 74 L 149 81 M 156 78 L 153 81 M 150 84 L 148 86 M 154 84 L 148 90 M 158 84 L 152 90 M 158 88 L 156 90", { paint: "dim", ...hair }),
			// Trails: up to the crest, and round the north shore.
			k.guide([[100, 87], [94, 78], [98, 70], [106, 64]]),
			k.path("M 96 86 C 108 84 122 86 132 90 C 140 92 144 98 150 100 M 132 90 C 136 84 142 80 146 78", { paint: "dim", ...hair, dash: "dash" }),
			// The hamlet to the south, the boat, the meadow, the creek's last stretch.
			k.path(house(104, 136, 2.8, 2.2) + house(108, 137, 2.8, 2.2) + house(112.5, 136, 2.8, 2.2), { paint: "ink", ...hair }),
			k.path("M 133 121 l 1 1.4 h 4 l 1 -1.4 Z M 136 121 v -2.4", { paint: "ink", ...hair }),
			k.path(tufts(meadow), { paint: "green", ...hair, cap: "butt" }),
			k.path(`M 160 94${CREEK_ON}`, { paint: "dim", ...hair, dash: "dotted" }),
		]);

		// The granite.
		const pinesR = [...scatter(10, 164, 112, 40, 20, inR), ...scatter(8, 216, 114, 36, 18, inR)];
		const scree = scatter(14, 172, 92, 60, 24, (p) => inR(p) && !insidePolygon(p, TARN_BOX));
		const slope = scatter(12, 168, 96, 30, 14, inR);
		const pinesRD = pinesR.map(([x, y]) => pine(x, y, 3 + rand() * 1.4)).join(" ");
		const granite = clipped(clipR, [
			// The range behind, hidden where the front range stands before it.
			k.path(segmentsD(clipOutsidePolygon(chain(BACK), RANGE_SOLID)), { paint: "dim", ...hair }),
			k.path(smoothD([[160, 140], [180, 124], [206, 132], [230, 122], [254, 136], [254, 150], [160, 150]], true), { paint: "none", fill: k.wash("green", 10) }),
			k.polyline(RANGE, { paint: "ink", ...hair }),
			k.path("M 191 70 l 1.5 10 M 194 69 l 0.5 8 M 211 76 l 0.5 8 M 235 72 l 1.5 8 M 238 72 l 0.5 7", { paint: "ink", ...hair }),
			k.path(tufts(slope, "l -1.4 0.6", "l 1.4 0.5"), { paint: "dim", ...hair, cap: "butt" }),
			// Strata, foothills, the tarn, the creek, scree.
			k.path("M 160 116 Q 200 106 254 114 M 162 124 Q 206 114 252 124 M 168 132 Q 208 122 250 132", { paint: "dim", ...hair, dash: "dash" }),
			k.path("M 178 98 Q 192 78 206 96 M 214 92 Q 236 74 248 96", { paint: "dim", ...hair }),
			k.path(smoothD(TARN, true), { paint: "blue", ...hair, fill: k.wash("blue", 20) }),
			k.path(smoothD(CREEK), { paint: "dim", ...hair, dash: "dotted" }),
			k.path(dots(scree, 0.7), { paint: "none", fill: "dim" }),
			// Pines, the hut and its trail, the hills, crystals in the rock.
			k.path(pinesRD, { paint: "green", ...hair }),
			k.path(house(240, 120, 3.4, 2.6), { paint: "ink", ...hair }),
			k.guide([[240, 120], [244, 112], [240, 106], [236, 104]]),
			k.path("M 160 134 Q 186 116 210 134 M 204 136 Q 228 118 254 134", { paint: "dim", ...hair }),
			k.path(([[186, 102], [200, 100], [178, 110], [214, 102]] as Point[]).map(crystal).join(" "), { paint: "lavender", ...hair }),
		]);

		const map = [
			...labels,
			`<clipPath id="${clipL}"><circle cx="${L[0]}" cy="${L[1]}" r="${RAD}" /></clipPath>`,
			`<clipPath id="${clipR}"><circle cx="${R[0]}" cy="${R[1]}" r="${RAD}" /></clipPath>`,
			basin,
			granite,
			k.ring(L[0], L[1], RAD, { paint: "ink", weight: "line" }),
			k.ring(R[0], R[1], RAD, { paint: "ink", weight: "line" }),
		];

		// --- The cycle, beat by beat ------------------------------------------------

		/** A snow cap on the peak at (x, y), s its size. */
		const cap = ([x, y]: Point, s: number): string =>
			k.polygon([[x, y], [x + 4 * s, y + 5 * s], [x + 2.4 * s, y + 3.4 * s], [x + 1, y + 5.4 * s], [x - 1, y + 3.8 * s], [x - 2.6 * s, y + 5.4 * s], [x - 4 * s, y + 5 * s]], { paint: "none", fill: "ink" });

		const vapour = clipped(clipL, [92, 124, 136].map((x, i) => k.path(`M ${x} ${104 + (i % 2) * 4} c -3 -5 3 -8 0 -13 c -3 -5 3 -8 0 -13`, { paint: "blue", ...hair, dash: "dash" })));
		const sunNow = k.ticksRadial(160, PY, 10, 13, 12, 0, 330, { paint: "blue", ...hair, mark: "now" });
		const flakes = scatter(26, 168, 50, 78, 34, inCircle(R, RAD - 3));
		const snow = clipped(clipR, [
			k.path(dots(flakes, 0.8), { paint: "none", fill: "ink" }),
			k.polygon(SNOWFIELD, { paint: "none", fill: k.wash("blue", 12) }),
			cap([192, 64], 0.9),
			cap([212, 72], 0.7),
			cap([236, 68], 0.8),
		]);
		const snowL = clipped(clipL, [
			k.path(dots(scatter(7, 90, 50, 56, 16, inCircle(L, RAD - 3)), 0.8), { paint: "none", fill: "ink" }),
			cap([100, 58], 0.6),
			cap([146, 62], 0.5),
		]);
		const melt = k.path(smoothD(CREEK) + CREEK_ON, { paint: "blue", weight: "line" });
		const minerals = clipped(clipR, ([[214, 108], [196, 108], [176, 102]] as Point[]).map(([x, y]) => k.hex(x, y, 2.2, { paint: "none", fill: "lavender" })));
		const collect = clipped(clipL, [
			k.path("M 138 108 A 8 8 0 0 0 148 114 M 132 110 A 14 14 0 0 0 148 122", { paint: "blue", ...hair }),
			k.path(dots(scatter(8, 96, 100, 44, 26, inLake), 0.9), { paint: "none", fill: "lavender" }),
		]);

		const beats = [
			// Evaporate: vapour off the lake, the sun's rays blue.
			[inMap([vapour]), inRow([sunNow, phase(0), nowRing(0)])],
			// Condense: the next phase.
			[inRow([phase(1), nowRing(1)])],
			// Snow: flakes over both insets, the snowfield, caps on the peaks.
			[inMap([snow, snowL]), inRow([phase(2), nowRing(2)])],
			// Melt: the creek runs blue into the lake, carrying minerals.
			[inMap([melt, minerals]), inRow([phase(4), nowRing(4)])],
			// Collect: a ripple where it meets the lake, minerals through the water.
			[inMap([collect, k.ring(145, 104, 7, { paint: "blue", ...hair, mark: "ripple" })]), inRow([phase(5), phase(6), nowRing(6)])],
		];

		return [inRow(row), inMap(map), k.steps(beats)];
	},
});
