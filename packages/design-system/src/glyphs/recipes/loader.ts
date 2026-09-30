// loader — a dot-circle loader: twelve dots on a ring, the trail dim, the
// last third ink, the head blue and a little larger, and the ring spins
// (the one motion). The four dots on the axes are one size, so the group's
// box is square about the centre and it turns in place.
import { recipe } from "../recipe";
import type { Paint } from "../../lib/micro";
import { polar } from "../../lib/micro";

const [CX, CY, R, N] = [24, 16, 10, 12];

/** Each dot's paint and radius, from the tail (i = 0, the top) round to the head. */
const dot = (i: number): [Paint, number] => {
	if (i === N - 1) return ["blue", 2];
	if (i === N - 2) return ["ink", 1.6];
	return [i >= 8 ? "ink" : "dim", 1.2];
};

export default recipe((k) => [
	k.group(
		Array.from({ length: N }, (_, i) => {
			const [x, y] = polar(CX, CY, R, (i * 360) / N);
			const [paint, r] = dot(i);
			return k.dot(x, y, r, { paint });
		}),
		{ motion: "spin" },
	),
]);
