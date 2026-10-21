// sine-lock — a locked oscillator: a blue sine running in from the left
// and stopping at a small lavender padlock (the lock glyph's shackle and
// body, scaled down), a blue keyhole dot in it.
import { recipe } from "../recipe";
import { lineD, simplify, type Point } from "../../lib/micro";

const X0 = 4;
const X1 = 29;
const sine: Point[] = Array.from({ length: 81 }, (_, i) => {
	const x = X0 + ((X1 - X0) * i) / 80;
	return [x, 16 - 7 * Math.sin((2 * Math.PI * (x - X0)) / 12.5)];
});

export default recipe((k) => [
	k.path(lineD(simplify(sine)), { paint: "blue" }),
	k.path("M 35 15 V 11.5 A 3 3 0 0 1 41 11.5 V 15", { paint: "lavender" }),
	k.roundRect(32, 15, 12, 10, 1.5, { paint: "lavender" }),
	k.dot(38, 20, 1.5, { paint: "blue" }),
]);
