// orbit — a blue body and what circles it: a dim dotted orbit, a blue arc
// of it lit with a node dot at each end, and a red node riding the orbit,
// which spins (the one motion).
import { recipe } from "../recipe";
import { polar } from "../../lib/micro";

export default recipe((k) => {
	const [a0x, a0y] = polar(24, 16, 11, 200);
	const [a1x, a1y] = polar(24, 16, 11, 300);
	const [nx, ny] = polar(24, 16, 11, 70);
	return [
		k.arc(24, 16, 11, 200, 300, { paint: "blue" }),
		k.dot(a0x, a0y, 1.5, { paint: "blue" }),
		k.dot(a1x, a1y, 1.5, { paint: "blue" }),
		k.dot(24, 16, 2.5, { paint: "blue" }),
		k.group([k.ring(24, 16, 11, { paint: "dim", weight: "hair", dash: "dotted" }), k.dot(nx, ny, 2, { paint: "red" })], { motion: "spin" }),
	];
});
