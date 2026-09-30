// target — three blue rings, closing in on a red centre dot.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(24, 16, 12, { paint: "blue" }),
	k.ring(24, 16, 7.5, { paint: "blue" }),
	k.ring(24, 16, 3.5, { paint: "blue", weight: "hair" }),
	k.dot(24, 16, 1.5, { paint: "red" }),
]);
