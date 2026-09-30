// mixer — two blue inputs curving in from dots at the left to an ink
// summing node (⊕, the plus in red), and a red line out with an
// arrowhead.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.path("M 6 8 H 10 C 16 8 16 16 22 16", { paint: "blue" }),
	k.path("M 6 24 H 10 C 16 24 16 16 22 16", { paint: "blue" }),
	k.dot(6, 8, 1.75, { paint: "blue" }),
	k.dot(6, 24, 1.75, { paint: "blue" }),
	k.ring(27, 16, 5),
	k.plus(27, 16, 5, { paint: "red" }),
	k.line(32, 16, 42, 16, { paint: "red" }),
	k.arrowhead(42, 16, 90, 3, { paint: "red" }),
]);
