// switch-ladder — a switch feeding a level ladder: an open ink lever on its
// pivot dot, a red contact, and a wire into a dim bus that runs the height
// of a blue ladder (the `ladder()` generator, 4 of 6 lit) on the right.
// `ladder-switch` is the same drawn the other way round.
import { recipe } from "../recipe";
import { type Kit } from "../../lib/micro";
import { ladder } from "../../lib/micro/gen";

/** The switch and ladder, left to right, or mirrored (the ladder on the left). */
export function switchLadder(k: Kit, mirror = false): string[] {
	const x = (v: number) => (mirror ? 48 - v : v);
	const y = 16;
	const bars = ladder(0, { lit: 4, steps: 6 });
	return [
		k.line(x(7.5), y, x(15.5), y - 6),
		k.dot(x(7.5), y, 1.5),
		k.line(x(17.5), y, x(27.5), y),
		k.dot(x(17.5), y, 1.5, { paint: "red" }),
		k.line(x(27.5), 8.5, x(27.5), 23.5, { paint: "dim", weight: "hair", cap: "butt" }),
		k.group(bars.children, { transform: `translate(${x(35.5) - 24} 0)` }),
	];
}

export default recipe((k) => switchLadder(k));
