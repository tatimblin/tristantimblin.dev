// registration — the printer's registration mark: a hairline ink crosshair
// through a red ring, a small blue ring at its heart.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.plus(24, 16, 26, { weight: "hair" }),
	k.ring(24, 16, 8, { paint: "red" }),
	k.ring(24, 16, 3.5, { paint: "blue" }),
]);
