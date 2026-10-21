// crossfade — two signals trading places: a blue S-curve falling from the
// top lane to the bottom and a red one rising past it, each leaving from a
// dot at the left.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.path("M 6 9 H 14 C 24 9 24 23 34 23 H 42", { paint: "blue" }),
	k.path("M 6 23 H 14 C 24 23 24 9 34 9 H 42", { paint: "red" }),
	k.dot(6, 9, 1.5, { paint: "blue" }),
	k.dot(6, 23, 1.5, { paint: "red" }),
]);
