// phase-invert — polarity flipped: a blue sine and its mirror image, the
// same wave upside down, dim behind it.
import { recipe } from "../recipe";
import { wave } from "../../lib/micro";

export default recipe((k) => [
	k.group(wave("sine", { amp: 8, paint: "dim" }).children, { transform: "matrix(1 0 0 -1 0 32)" }),
	...wave("sine", { amp: 8 }).children,
]);
