// spark — an asterisk: six blue spokes around a red centre dot, a gap
// between them so the dot sits in its own light.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.ticksRadial(24, 16, 4, 11, 6, 0, 360, { paint: "blue", cap: "round" }),
	k.dot(24, 16, 1.75, { paint: "red" }),
]);
