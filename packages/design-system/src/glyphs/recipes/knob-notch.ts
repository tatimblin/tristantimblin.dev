// knob-notch — a rotary knob seen from the front: an ink ring with a blue
// notch pointing at its setting, and a tick arc round it, lit in ink up to
// the setting and dim past it.
import { recipe } from "../recipe";
import { polar } from "../../lib/micro";

const [CX, CY] = [24, 17.5];
/** The sweep, the setting, and the tick pitch. */
const [A0, A1, AT, STEP] = [-135, 135, 45, 30];

export default recipe((k) => {
	const [px, py] = polar(CX, CY, 3, AT);
	const [qx, qy] = polar(CX, CY, 6.5, AT);
	return [
		k.ticksRadial(CX, CY, 10, 12.5, (AT - A0) / STEP + 1, A0, AT, { weight: "hair" }),
		k.ticksRadial(CX, CY, 10, 12.5, (A1 - AT) / STEP, AT + STEP, A1, { paint: "dim", weight: "hair" }),
		k.ring(CX, CY, 8),
		k.line(px, py, qx, qy, { paint: "blue" }),
		k.dot(qx, qy, 1.25, { paint: "blue" }),
	];
});
