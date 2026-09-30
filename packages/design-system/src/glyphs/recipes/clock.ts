// clock — a clock face in a dim dotted ring: an ink ring, four hair ticks
// at the quarters, a short ink hour hand, a blue minute hand and a red hub.
// The minute hand turns (the one motion): it spins with the dotted ring,
// which is centrally symmetric, so the group's box keeps the hub at its
// centre.
import { recipe } from "../recipe";
import { polar } from "../../lib/micro";

const [CX, CY] = [24, 16];

export default recipe((k) => {
	const [hx, hy] = polar(CX, CY, 5, 300);
	const [mx, my] = polar(CX, CY, 8.5, 60);
	return [
		k.ring(CX, CY, 10, {}),
		k.ticksRadial(CX, CY, 7.5, 10, 4, 0, 360, { weight: "hair" }),
		k.line(CX, CY, hx, hy),
		k.group([k.ring(CX, CY, 12.5, { paint: "dim", weight: "hair", dash: "dotted" }), k.line(CX, CY, mx, my, { paint: "blue" })], { motion: "spin" }),
		k.dot(CX, CY, 1.5, { paint: "red" }),
	];
});
