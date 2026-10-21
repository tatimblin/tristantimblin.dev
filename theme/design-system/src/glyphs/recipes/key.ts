// key — a single keycap, pressed: an ink cap, the dim hairline of its face
// inset, and a green dot lit at its centre.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.roundRect(13, 5, 22, 22, 3),
	k.keycap(16.5, 7.5, 15, 15, { r: 2 }),
	k.dot(24, 15, 2.5, { paint: "green" }),
]);
