// checkbox — a checked box: an ink square with a green check in it.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.roundRect(16, 8, 16, 16, 2),
	k.check(24, 16, 8, { paint: "green" }),
]);
