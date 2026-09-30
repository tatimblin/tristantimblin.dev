// junction — the flow connector between two tiles: a blue dot, an ink line,
// a blue dot, and a small green chevron in the middle saying which way.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.line(8, 16, 40, 16),
	k.chevron(26, 16, 90, 3, { paint: "green" }),
	k.dot(8, 16, 2.5, { paint: "blue" }),
	k.dot(40, 16, 2.5, { paint: "blue" }),
]);
