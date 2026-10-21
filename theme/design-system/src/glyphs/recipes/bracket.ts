// bracket — four blue corner brackets framing a red dot: the focus, the
// selection, the crop.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.bracket(13, 6, 5, "tl", { paint: "blue" }),
	k.bracket(35, 6, 5, "tr", { paint: "blue" }),
	k.bracket(13, 26, 5, "bl", { paint: "blue" }),
	k.bracket(35, 26, 5, "br", { paint: "blue" }),
	k.dot(24, 16, 2, { paint: "red" }),
]);
