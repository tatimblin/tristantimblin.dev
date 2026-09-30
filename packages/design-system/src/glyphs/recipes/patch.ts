// patch — a patch cable: two blue jacks, a red cable drooping between
// them from a plug dot in each.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(10, 10, 4.5, { paint: "blue" }),
	k.ring(38, 10, 4.5, { paint: "blue" }),
	k.path("M 10 10 C 12 34 36 34 38 10", { paint: "red" }),
	k.dot(10, 10, 2, { paint: "red" }),
	k.dot(38, 10, 2, { paint: "red" }),
]);
