// tri-bands — a solid triangle whose lower third breaks into bands: the
// apex in the ink, four blue bands under it widening to the base (the
// pack's shape 26). Two filled paths. 48×32.
import { round } from "../../lib/micro";
import { recipe } from "../recipe";

const [CX, TOP, BASE] = [24, 4, 28];
/** Half the triangle's width at `y`: equilateral, so the base is 24 / cos 30° across. */
const half = (y: number) => ((y - TOP) / (BASE - TOP)) * ((BASE - TOP) / Math.sqrt(3));
/** The triangle between two heights, as a closed subpath. */
const slab = (y0: number, y1: number) => {
	const [h0, h1] = [half(y0), half(y1)];
	return `M${round(CX - h0)} ${y0}L${round(CX + h0)} ${y0}L${round(CX + h1)} ${y1}L${round(CX - h1)} ${y1}Z`;
};

// Bands from the base up, 1.75 deep at a pitch of 3; the solid apex down to 16.
const bands = [0, 1, 2, 3].map((i) => slab(round(BASE - 1.75 - i * 3), BASE - i * 3)).join("");

export default recipe((k) => [
	k.path(slab(TOP, 16), { paint: "none", fill: "ink" }),
	k.path(bands, { paint: "none", fill: "blue" }),
]);
