// bezier — a cubic bezier: a blue curve between two ink anchors, its two
// control handles as dim hair lines ending in green dots.
import { recipe } from "../recipe";

const P0 = [7, 25] as const;
const C1 = [17, 6] as const;
const C2 = [31, 26] as const;
const P1 = [41, 7] as const;

export default recipe((k) => [
	k.line(...P0, ...C1, { paint: "dim", weight: "hair" }),
	k.line(...P1, ...C2, { paint: "dim", weight: "hair" }),
	k.path(`M ${P0.join(" ")} C ${C1.join(" ")} ${C2.join(" ")} ${P1.join(" ")}`, { paint: "blue" }),
	k.terminal(...P0, 3, { fill: "ink", paint: "none" }),
	k.terminal(...P1, 3, { fill: "ink", paint: "none" }),
	k.dot(...C1, 1.5, { paint: "green" }),
	k.dot(...C2, 1.5, { paint: "green" }),
]);
