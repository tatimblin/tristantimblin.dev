// pendulum — the pendulum wave: an ink rule, and a row of blue dots
// hanging from it on dim dashed drops of a swinging length, the longest
// one red.
import { recipe } from "../recipe";

const X = [8, 14, 20, 26, 32, 38];
const Y = [15, 21, 26, 22, 16, 11];
const HOT = 2;

export default recipe((k) => [
	k.line(5, 5, 43, 5),
	...X.map((x, i) => k.line(x, 7, x, Y[i] - 3, { paint: "dim", weight: "hair", dash: "dash" })),
	...X.map((x, i) => k.dot(x, Y[i], 2, { paint: i === HOT ? "red" : "blue" })),
]);
