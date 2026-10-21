// slider — a fader: a dim track with hair ticks under it, lit blue up to
// the cap, and the cap an ink keycap with a red index line across it.
import { recipe } from "../recipe";

const CAP = 30;

export default recipe((k) => [
	k.ticksLinear(6, 25, 42, 25, 7, 2, { paint: "dim", weight: "hair" }),
	k.line(CAP + 4, 16, 42, 16, { paint: "dim", weight: "hair" }),
	k.line(6, 16, CAP - 4, 16, { paint: "blue" }),
	k.dot(6, 16, 1.5, { paint: "blue" }),
	k.roundRect(CAP - 3.5, 8, 7, 16, 1.5),
	k.line(CAP, 11, CAP, 21, { paint: "red" }),
]);
