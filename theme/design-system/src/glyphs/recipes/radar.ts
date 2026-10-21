// radar — a scope: an ink ring, dim dotted range rings inside it, a green
// sweep that turns (the one motion — it spins with the dotted outer ring,
// which keeps the group's box centred) and a red blip.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(24, 16, 12),
	k.ring(24, 16, 8, { paint: "dim", weight: "hair", dash: "dotted" }),
	k.ring(24, 16, 4, { paint: "dim", weight: "hair", dash: "dotted" }),
	k.dot(17, 21.5, 1.75, { paint: "red" }),
	k.group([k.ring(24, 16, 12, { paint: "dim", weight: "hair", dash: "dotted" }), k.line(24, 16, 32.49, 7.51, { paint: "green" })], { motion: "spin" }),
	k.dot(24, 16, 1.25, { paint: "green" }),
]);
