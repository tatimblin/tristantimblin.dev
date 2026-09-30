// joystick — a small part: a blue ball on a stick, rising from a boot on a
// small iso block in ink. 48×32.
import { recipe } from "../recipe";

// The block's near corner, and the centre of its top face (6, 6, 4 up).
const AT = [24, 29] as const;
const [TX, TY] = [24, AT[1] - 6 - 4];

export default recipe((k) => [
	k.isoBox(AT[0], AT[1], 12, 12, 4, { top: "none" }),
	k.isoEllipse(TX, TY, 3, { paint: "blue", weight: "hair" }),
	k.line(TX, TY, TX, 10, { paint: "blue" }),
	k.ring(TX, 7.5, 3.5, { paint: "none", fill: "blue" }),
]);
