// pcb — the phone's board: a thin green rounded board with three chips
// (ink tops, the reference's white faces), two blue traces along the iso
// axes and a row of blue pads at its +x edge. Wide (96×64).
import { type Kit, iso } from "../../lib/micro";
import { recipe } from "../recipe";

const [W, D, H] = [50, 24, 2];
const AT = [59, 50] as const;
/** A point on the board in world terms: x along the board, y across, z above its top. */
const P = (x: number, y: number, z = 0) => iso(x - W, y - D, H + z, AT);
/** A chip by its footprint `[x0, y0, x1, y1]` and height: an ink-topped box placed by its near corner. */
const chip = (k: Kit, [x0, y0, x1, y1]: number[], h: number) => {
	const [x, y] = P(x1, y1);
	return k.isoBox(x, y, x1 - x0, y1 - y0, h, { paint: "ink" });
};

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoRoundBox(AT[0], AT[1], W, D, H, 3, { paint: "green", top: "none" }),
		// The traces first, so the chips they enter sit on them.
		k.polyline([P(24, 8), P(34, 8), P(34, 13)], { paint: "blue", weight: "hair", cap: "butt" }),
		k.polyline([P(24, 14), P(30, 14)], { paint: "blue", weight: "hair", cap: "butt" }),
		// Far to near: the flat far chip, the big one, the small near one.
		chip(k, [34, 3, 44, 8], 1.5),
		chip(k, [8, 5, 24, 17], 3),
		chip(k, [30, 13, 38, 21], 3),
		// The pads along the +x edge.
		...[6, 10, 14, 18, 22].map((y) => k.dot(...P(46, y), 1, { paint: "blue" })),
	],
});
