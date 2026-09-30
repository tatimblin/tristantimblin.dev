// crossbox — a crossed box: an ink square with a red cross in it,
// checkbox's partner.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.roundRect(16, 8, 16, 16, 2),
	k.cross(24, 16, 7, { paint: "red" }),
]);
