// reticle — a sight: a blue ring, four ink ticks pointing in from it, and a
// red centre dot that blinks (the one motion).
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(24, 16, 10, { paint: "blue" }),
	k.ticksRadial(24, 16, 4.5, 13, 4, 0, 360),
	k.group(k.dot(24, 16, 1.75, { paint: "red" }), { motion: "blink" }),
]);
