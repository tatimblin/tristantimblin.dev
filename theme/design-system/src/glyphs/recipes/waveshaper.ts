// waveshaper — a transfer curve: y = x³ in red on dim dotted axes, flat
// through the origin and steep at the ends.
import { recipe } from "../recipe";
import { lineD, simplify, type Point } from "../../lib/micro";

const [CX, CY, RX, RY] = [24, 16, 12, 11];
const pts: Point[] = Array.from({ length: 61 }, (_, i) => {
	const x = -1 + (2 * i) / 60;
	return [CX + RX * x, CY - RY * x ** 3];
});

export default recipe((k) => [
	k.guide([[8, CY], [40, CY]]),
	k.guide([[CX, 4], [CX, 28]]),
	k.path(lineD(simplify(pts)), { paint: "red" }),
]);
