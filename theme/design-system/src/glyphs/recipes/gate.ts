// gate — the gate bar: a flat green bar sitting in a dim dotted signal
// line that runs in and out of it.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.guide([[4, 16], [12, 16]]),
	k.guide([[36, 16], [44, 16]]),
	k.rect(15, 13, 18, 6, { paint: "none", fill: "green" }),
]);
