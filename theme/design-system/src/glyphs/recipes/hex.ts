// hex — a blue hexagon, pointy-topped, a red dot at its centre.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.hex(24, 16, 11, { paint: "blue" }),
	k.dot(24, 16, 1.5, { paint: "red" }),
]);
