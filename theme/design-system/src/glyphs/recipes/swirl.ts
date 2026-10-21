// swirl — a pinwheel of eight curved blades: each leaves the centre on a
// bend, runs an eighth of the rim and bends back, so the disc turns (the
// pack's shape 18). One filled path in the ink; it spins as the loader
// does, about its own centre. 48×32.
import { polar, round, type Point } from "../../lib/micro";
import { recipe } from "../recipe";

const [CX, CY, R] = [24, 16, 12];
const N = 8;
const BLADE = 360 / N / 2; // the rim a blade holds: half its share
const BEND = 55; // how far the control point trails the blade's edge
const p = (q: Point) => `${round(q[0])} ${round(q[1])}`;

const d = Array.from({ length: N }, (_, i) => {
	const a = (360 / N) * i;
	const [c0, rim0, rim1, c1] = [
		polar(CX, CY, R * 0.62, a - BEND),
		polar(CX, CY, R, a),
		polar(CX, CY, R, a + BLADE),
		polar(CX, CY, R * 0.5, a + BLADE - BEND),
	];
	return `M${CX} ${CY}Q${p(c0)} ${p(rim0)}A${R} ${R} 0 0 1 ${p(rim1)}Q${p(c1)} ${CX} ${CY}Z`;
}).join("");

export default recipe((k) => [k.group(k.path(d, { paint: "none", fill: "ink" }), { motion: "spin", speed: 0.5 })]);
