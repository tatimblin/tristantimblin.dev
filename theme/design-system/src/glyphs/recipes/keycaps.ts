// keycaps — the segmented button row: a bank of seven small dim keycap
// pills, one lit green, a blue dot under it marking the selection. Wide.
import { recipe } from "../recipe";

const N = 7;
const W = 8;
const GAP = 4;
const LIT = 4;
const X0 = (96 - (N * W + (N - 1) * GAP)) / 2;

export default recipe({
	viewBox: "0 0 96 32",
	draw: (k) => [
		...Array.from({ length: N }, (_, i) =>
			i === LIT
				? k.pill(X0 + i * (W + GAP), 7, W, 14, { paint: "none", fill: "green" })
				: k.pill(X0 + i * (W + GAP), 7, W, 14, { paint: "dim", weight: "hair" }),
		),
		k.dot(X0 + LIT * (W + GAP) + W / 2, 26, 1.5, { paint: "blue" }),
	],
});
