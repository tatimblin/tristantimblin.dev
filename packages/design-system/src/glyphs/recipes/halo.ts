// halo — a red ring with a blue dot at its heart, glowing out through two
// dim dotted rings.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(24, 16, 12.5, { paint: "dim", weight: "hair", dash: "dotted" }),
	k.ring(24, 16, 9, { paint: "dim", weight: "hair", dash: "dotted" }),
	k.ring(24, 16, 5, { paint: "red" }),
	k.dot(24, 16, 1.5, { paint: "blue" }),
]);
