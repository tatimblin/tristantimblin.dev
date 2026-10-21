// rotary — the phone's dial: a green iso disc with a ring of ten finger
// holes round a hub, the gap at four o'clock closed by the finger stop in
// ink. Wide (96×64).
import { recipe } from "../recipe";

const [CX, CY] = [48, 34];
const R = 25;
/** A point on the disc's top: world radius `r` at dial angle `a` (0 up, clockwise), on the 2:1 disc. */
const on = (r: number, a: number): [number, number] => {
	const t = (a * Math.PI) / 180;
	return [CX + r * Math.sin(t), CY - (r / 2) * Math.cos(t)];
};
/** The holes: ten at 30°, leaving a gap centred on 120°. */
const HOLES = Array.from({ length: 10 }, (_, i) => 165 + 30 * i);

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoCylinder(CX, CY + 4, 34, 4, { paint: "green", top: "none" }),
		k.isoEllipse(CX, CY, 9, { paint: "green", weight: "hair" }),
		k.dot(CX, CY, 1.5, { paint: "green" }),
		...HOLES.map((a) => k.isoEllipse(...on(R, a), 3.5, { paint: "green", weight: "hair" })),
		k.line(...on(19, 120), ...on(31, 120)),
	],
});
