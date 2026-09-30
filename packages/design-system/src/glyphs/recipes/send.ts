// send — an aux send: a blue ring with a dot at its heart, and a green
// dashed tail leaving it to the right that crawls outward (the one motion).
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ring(14, 16, 7, { paint: "blue" }),
	k.dot(14, 16, 1.5, { paint: "blue" }),
	k.group(k.line(24, 16, 44, 16, { paint: "green", dash: "long" }), { motion: "dash" }),
]);
