// ring-in — a signal arriving: a blue double ring, the outer one a fine
// dash that crawls (the one motion), and a red line with an arrowhead
// running in from the left edge to the centre.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.group(k.ring(24, 16, 12, { paint: "blue", weight: "hair", dash: "dash" }), { motion: "dash" }),
	k.ring(24, 16, 8, { paint: "blue" }),
	k.line(2, 16, 21, 16, { paint: "red" }),
	k.arrowhead(22, 16, 90, 3, { paint: "red" }),
]);
