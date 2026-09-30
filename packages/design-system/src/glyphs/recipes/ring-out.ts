// ring-out — ring-in's mirror, a signal leaving: the blue double ring, the
// outer one a fine dash that crawls (the one motion), and a red line with
// an arrowhead running out from a dot at the centre to the right edge.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.group(k.ring(24, 16, 12, { paint: "blue", weight: "hair", dash: "dash" }), { motion: "dash" }),
	k.ring(24, 16, 8, { paint: "blue" }),
	k.dot(24, 16, 1.5, { paint: "red" }),
	k.line(24, 16, 46, 16, { paint: "red" }),
	k.arrowhead(46, 16, 90, 3, { paint: "red" }),
]);
