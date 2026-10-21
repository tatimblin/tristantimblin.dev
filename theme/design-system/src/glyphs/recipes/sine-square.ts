// sine-square — a signal through a key: a blue sine running the width of
// the tile, straight through an ink keycap frame at its centre.
import { recipe } from "../recipe";
import { wave } from "../../lib/micro";

export default recipe((k) => [
	k.keycap(15, 6, 18, 20, { paint: "ink", weight: "line", r: 2.5 }),
	...wave("sine", { amp: 6 }).children,
]);
