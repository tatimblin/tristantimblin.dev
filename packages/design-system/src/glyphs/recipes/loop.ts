// loop — a return: a blue baseline, and a red path lifting off it at the
// right, running back over the top and dropping onto the line again at the
// left with an arrowhead.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.line(6, 24, 42, 24, { paint: "blue" }),
	k.dot(34, 24, 1.5, { paint: "red" }),
	k.wire([[34, 24], [34, 9], [14, 9], [14, 20]], { paint: "red", radius: 4 }),
	k.arrowhead(14, 21, 180, 3, { paint: "red" }),
]);
