// phase-cross — a zero crossing: a blue sine passing through an ink ring
// at the tile's centre, a red dot where it crosses the midline.
import { recipe } from "../recipe";
import { wave } from "../../lib/micro";

export default recipe((k) => [
	k.ring(24, 16, 7),
	...wave("sine", { amp: 9 }).children,
	k.dot(24, 16, 1.5, { paint: "red" }),
]);
