// rgb — the colour trio overlapping: a red dot and a blue dot, and a dim
// third over both, its translucency showing where the three mix.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.dot(19, 12, 7, { paint: "red" }),
	k.dot(29, 12, 7, { paint: "blue" }),
	k.dot(24, 20.5, 7, { paint: "dim" }),
]);
